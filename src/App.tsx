import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CartItem, Product, SortMode } from './types';
import { CATEGORIES, SITE } from './config/site';
import { AdSlot } from './components/ads/AdSlot';
import { CartSidebar } from './components/shop/CartSidebar';
import { CatalogControls } from './components/shop/CatalogControls';
import { Footer } from './components/shop/Footer';
import { HeroBanner } from './components/shop/HeroBanner';
import { HeroHeader } from './components/shop/HeroHeader';
import { MeAviseModal } from './components/shop/MeAviseModal';
import { Navbar } from './components/shop/Navbar';
import { PolicyModal, type PolicyKind } from './components/shop/PolicyModal';
import { ProductGrid } from './components/shop/ProductGrid';
import { ProductModal } from './components/shop/ProductModal';
import { SupportSection } from './components/shop/SupportSection';
import { AdminLoginModal } from './components/shop/AdminLoginModal';
import { FloatingActions } from './components/app/FloatingActions';
import { InstallPrompt } from './components/app/InstallPrompt';
import { StatusBanner } from './components/app/StatusBanner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { SecurityNotice } from './components/ui/SecurityNotice';
import { Toast } from './components/ui/Toast';
import {
  filterProducts,
  pickFeatured,
  sortProducts,
  useAddress,
  useAdminSession,
  useCart,
  useDemands,
  useFavorites,
  useProducts,
  useStoreConfig,
  MAX_CART_ITEMS,
} from './data/store';
import {
  addDemand,
  addProductComment,
  removeDemand,
  removeProduct,
  saveProduct,
  toggleProductHidden,
} from './data/writes';
import { authenticateAdmin, authStatus } from './utils/auth';
import { LIMITS, sanitizeText } from './utils/sanitize';
import { useGuardBot, usePageHardening, useSubmissionThrottle } from './utils/security';
import {
  applyUpdate,
  clearRuntimeCaches,
  getDeviceProfile,
  hasInstallPrompt,
  isStandalone,
  registerServiceWorker,
  requestPersistentStorage,
  storageEstimate,
  supportsPwa,
} from './utils/pwa';
import { useUrlState, type UrlState } from './hooks/useUrlState';
import { useSeo } from './hooks/useSeo';
import type { ToastState } from './types';

/**
 * Componente raiz da loja.
 *
 * ── ARQUITETURA ──────────────────────────────────────────────────────────
 * Este arquivo costumava ter 1.688 linhas com a vitrine, o carrinho, três
 * modais e o painel administrativo misturados. Qualquer mudança obrigava a
 * ler o arquivo inteiro e cada render redesenhava tudo.
 *
 * Agora o App só faz o trabalho de um container: guarda o estado, conecta os
 * dados e entrega props. A apresentação mora em `src/components`, o acesso ao
 * Firestore em `src/data`, e as regras puras em `src/utils`.
 *
 * ── PERFORMANCE ──────────────────────────────────────────────────────────
 *  - O painel administrativo é `lazy`: quem só compra nunca baixa esse código.
 *  - Handlers são `useCallback` e derivados são `useMemo`, então os cards
 *    (todos `React.memo`) não re-renderizam a cada tecla na busca.
 *  - `getDeviceProfile()` detecta aparelho fraco / economia de dados e liga o
 *    "modo econômico": sem autoplay do banner, sem animação pesada.
 *  - Service worker faz a segunda visita abrir instantaneamente.
 *
 * ── FIREBASE ─────────────────────────────────────────────────────────────
 * `src/utils/firebase.ts` não foi alterado. As credenciais, o projeto e a
 * inicialização continuam exatamente como estavam; mudamos apenas como os
 * dados são lidos/validados/gravados.
 */

/** Painel administrativo — carregado só quando alguém abre o painel. */
const AdminPanel = lazy(() =>
  import('./components/admin/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);

const EMPTY_TOAST: ToastState = { msg: '', show: false, tone: 'info' };

export default function App() {
  /* ── Dados ─────────────────────────────────────────────────────────── */
  const store = useStoreConfig();
  const { products, loading, offline, error: productsError, retry } = useProducts();
  const { isAdmin, login, logout } = useAdminSession();
  const { demands } = useDemands(isAdmin);

  /* ── Estado local do visitante ─────────────────────────────────────── */
  const { cart, setCart, clear: clearCart, total: cartTotal, units: cartUnits } = useCart();
  const { favorites, toggle: toggleFavorite, has: isFavorite } = useFavorites();
  const { address, setAddress } = useAddress();

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'address' | 'pix'>('cart');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [meAviseProduct, setMeAviseProduct] = useState<Product | null>(null);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [policy, setPolicy] = useState<PolicyKind | null>(null);
  const [toast, setToast] = useState<ToastState>(EMPTY_TOAST);
  const [searchOpenSignal, setSearchOpenSignal] = useState(0);
  const [installSignal, setInstallSignal] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [auth, setAuth] = useState(authStatus);

  /* ── Estado da vitrine (categoria, busca, ordenação) ───────────────── */
  const [category, setCategory] = useState('todos');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [promoOnly, setPromoOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  /* ── Aparelho / modo econômico ─────────────────────────────────────── */
  const [device, setDevice] = useState(() => getDeviceProfile());
  const economical = device.lowEnd || device.reducedMotion;

  /* ── Segurança ─────────────────────────────────────────────────────── */
  const [blocked, setBlocked] = useState(false);
  const guard = useGuardBot(useCallback(() => setBlocked(true), []));
  usePageHardening({ hardenExternalLinks: true });

  /* ── URL como fonte de verdade (deep link + botão voltar + SEO) ────── */
  const applyUrlState = useCallback((state: UrlState) => {
    if (state.category) setCategory(state.category);
    if (typeof state.search === 'string') setSearch(state.search);
    if (state.sort) setSort(state.sort);
    if (state.product) {
      setSelectedProduct({ fid: state.product } as Product);
    } else {
      setSelectedProduct((prev) => (prev && !prev.name ? null : prev));
    }
  }, []);

  const { push: pushUrl, read: readUrl } = useUrlState(applyUrlState);

  // Primeira leitura: atalhos do app instalado e links compartilhados.
  useEffect(() => {
    applyUrlState(readUrl());
  }, [applyUrlState, readUrl]);

  // Reflete o estado atual na URL (replaceState — não empilha histórico).
  useEffect(() => {
    pushUrl({
      category,
      search,
      sort,
      product: selectedProduct?.fid ?? '',
    });
  }, [category, search, sort, selectedProduct, pushUrl]);

  /* ── SEO ───────────────────────────────────────────────────────────── */
  useSeo({ products, category, search, selectedProduct, loading });

  /* ── PWA: service worker, persistência, atualização ────────────────── */
  useEffect(() => {
    void registerServiceWorker(() => setUpdateReady(true));
    void requestPersistentStorage();
    void storageEstimate().then(setStorageUsage);
  }, []);

  // Atalho do app instalado (long-press no ícone) pode mudar a categoria.
  useEffect(() => {
    if (!isStandalone()) return;
    setDevice(getDeviceProfile());
  }, []);

  /* ── Toast ─────────────────────────────────────────────────────────── */
  const toastTimer = useRef<number | null>(null);
  const notify = useCallback((msg: string, tone: ToastState['tone'] = 'info') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ msg: sanitizeText(msg, 90), show: true, tone });
    toastTimer.current = window.setTimeout(() => setToast(EMPTY_TOAST), 3500);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  /* ── Anti-spam (avaliação e "me avise") ────────────────────────────── */
  const throttle = useSubmissionThrottle();
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(
      () => setCooldown((c) => (c <= 1 ? 0 : c - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  /* ── Derivados ─────────────────────────────────────────────────────── */
  const featured = useMemo(() => pickFeatured(products, 4), [products]);
  const visible = useMemo(
    () =>
      filterProducts(products, {
        category,
        search,
        promoOnly,
        availableOnly,
        favoritesOnly,
        favorites,
      }),
    [products, category, search, promoOnly, availableOnly, favoritesOnly, favorites]
  );
  const sorted = useMemo(() => sortProducts(visible, sort), [visible, sort]);

  // O produto selecionado pode ter chegado só com o `fid` (deep link).
  const resolvedProduct = useMemo(() => {
    if (!selectedProduct) return null;
    if (selectedProduct.name) return selectedProduct;
    return products.find((p) => p.fid === selectedProduct.fid) ?? null;
  }, [selectedProduct, products]);

  /**
   * Mostra o botão "Instalar app" apenas onde instalar é possível:
   * prompt nativo disponível, iOS (que tem fluxo manual) ou navegador com
   * suporte a PWA ainda sem o evento. Nunca aparece dentro do app instalado.
   */
  const canInstall = useMemo(() => {
    void installSignal; // reavalia quando o usuário interage com o convite
    if (isStandalone()) return false;
    return hasInstallPrompt() || supportsPwa();
  }, [installSignal]);

  /* ── Sacola ────────────────────────────────────────────────────────── */
  const addToCart = useCallback(
    (product: Product, qty = 1) => {
      const stock = Math.max(0, Math.round(Number(product.stock) || 0));
      if (stock <= 0) {
        notify('⚠️ Esse produto está esgotado', 'error');
        return;
      }
      const want = Math.max(1, Math.min(stock, Math.round(qty) || 1));
      const promo = Number(product.discountPrice) || 0;
      const price = Number(product.price) || 0;
      const unitPrice = promo > 0 && promo < price ? promo : price;

      setCart((prev) => {
        const existing = prev.find((item) => item.fid === product.fid);
        if (existing) {
          if (existing.quantity + want > stock) {
            notify(`⚠️ Só temos ${stock} unidade(s) em estoque`, 'error');
            return prev;
          }
          return prev.map((item) =>
            item.fid === product.fid ? { ...item, quantity: item.quantity + want } : item
          );
        }
        if (prev.length >= MAX_CART_ITEMS) {
          notify('⚠️ Sacola cheia: finalize o pedido para adicionar mais', 'error');
          return prev;
        }
        const item: CartItem = {
          ...product,
          cartId: `${product.fid ?? 'item'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          quantity: want,
          unitPrice,
        };
        return [...prev, item];
      });
      notify('✅ Adicionado à sacola!', 'success');
    },
    [notify, setCart]
  );

  const updateCartQty = useCallback(
    (cartId: string, delta: number) => {
      setCart((prev) =>
        prev.map((item) => {
          if (item.cartId !== cartId) return item;
          const stock = Math.max(1, Math.round(Number(item.stock) || 1));
          const quantity = Math.max(1, Math.min(stock, item.quantity + delta));
          return { ...item, quantity };
        })
      );
    },
    [setCart]
  );

  const removeFromCart = useCallback(
    (cartId: string) => setCart((prev) => prev.filter((item) => item.cartId !== cartId)),
    [setCart]
  );

  const openCart = useCallback(() => {
    setCheckoutStep('cart');
    setIsCartOpen(true);
  }, []);

  /* ── Favoritos ─────────────────────────────────────────────────────── */
  const handleToggleFavorite = useCallback(
    (product: Product) => {
      const added = toggleFavorite(product.fid);
      notify(added ? '💖 Adicionado aos favoritos' : '💔 Removido dos favoritos', added ? 'success' : 'info');
    },
    [toggleFavorite, notify]
  );

  /* ── Compartilhar ──────────────────────────────────────────────────── */
  const handleShare = useCallback(
    async (product: Product) => {
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('produto', product.fid ?? '');
      const shareUrl = url.toString();
      const name = sanitizeText(product.name, 60);

      // Web Share API: no celular abre o menu nativo (WhatsApp, Instagram…).
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `${name} — ${SITE.name}`,
            text: `Confira ${name} na ${SITE.name} ✨`,
            url: shareUrl,
          });
          return;
        } catch (error) {
          // O usuário cancelou: não é erro, apenas encerra.
          if ((error as Error)?.name === 'AbortError') return;
        }
      }

      try {
        await navigator.clipboard.writeText(`${shareUrl} — ${name}`);
        notify('🔗 Link copiado! É só colar no WhatsApp.', 'success');
      } catch {
        notify('⚠️ Não foi possível copiar o link neste aparelho', 'error');
      }
    },
    [notify]
  );

  /* ── Avaliação ─────────────────────────────────────────────────────── */
  const handleSubmitComment = useCallback(
    async (product: Product, comment: { user: string; text: string; stars: number }) => {
      const wait = throttle('comment', 5000);
      if (wait > 0) {
        notify(`⏳ Aguarde ${wait}s para avaliar de novo`, 'info');
        setCooldown(wait);
        return false;
      }
      const result = await addProductComment(product, comment);
      notify(result.ok ? `✅ ${result.message}!` : `⚠️ ${result.message}`, result.ok ? 'success' : 'error');
      return result.ok;
    },
    [throttle, notify]
  );

  /* ── "Me avise" ────────────────────────────────────────────────────── */
  const openMeAvise = useCallback((product: Product) => {
    setMeAviseProduct(product);
  }, []);

  const handleSubmitDemand = useCallback(
    async (payload: { product: Product; user: string; whatsapp: string }) => {
      const wait = throttle('demand', 10000);
      if (wait > 0) {
        notify(`⏳ Aguarde ${wait}s para enviar outra solicitação`, 'info');
        setCooldown(wait);
        return false;
      }
      const result = await addDemand(payload);
      notify(result.ok ? '✅ Vamos te avisar assim que chegar!' : `⚠️ ${result.message}`, result.ok ? 'success' : 'error');
      if (result.ok) setMeAviseProduct(null);
      return result.ok;
    },
    [throttle, notify]
  );

  /* ── Painel administrativo ─────────────────────────────────────────── */
  const handleAdminAuth = useCallback(
    async (password: string) => {
      const result = await authenticateAdmin(password);
      setAuth(authStatus());
      if (result.ok) {
        login();
        notify('🔓 Acesso liberado', 'success');
        return { ok: true, message: result.message };
      }
      return { ok: false, message: result.message };
    },
    [login, notify]
  );

  const handleAdminLogout = useCallback(() => {
    logout();
    notify('🔒 Painel encerrado', 'info');
  }, [logout, notify]);

  const handleSaveProduct = useCallback(
    async (payload: Parameters<typeof saveProduct>[0]) => {
      const result = await saveProduct(payload);
      notify(result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}`, result.ok ? 'success' : 'error');
      return result.ok;
    },
    [notify]
  );

  const handleDeleteProduct = useCallback(
    async (product: Product) => {
      const result = await removeProduct(product.fid);
      notify(result.ok ? '🗑️ Produto removido' : `⚠️ ${result.message}`, result.ok ? 'success' : 'error');
      return result.ok;
    },
    [notify]
  );

  const handleToggleHidden = useCallback(
    async (product: Product) => {
      const result = await toggleProductHidden(product);
      notify(result.ok ? `👁️ ${result.message}` : `⚠️ ${result.message}`, result.ok ? 'success' : 'error');
      return result.ok;
    },
    [notify]
  );

  const handleDeleteDemand = useCallback(
    async (demand: { fid?: string }) => {
      const result = await removeDemand(demand.fid);
      notify(result.ok ? '📦 Removido' : `⚠️ ${result.message}`, result.ok ? 'success' : 'error');
      return result.ok;
    },
    [notify]
  );

  const handleClearCache = useCallback(async () => {
    const cleared = await clearRuntimeCaches();
    setStorageUsage(await storageEstimate());
    notify(
      cleared ? '🧹 Cache liberado — a loja volta a baixar as fotos' : '⚠️ Não foi possível limpar',
      cleared ? 'success' : 'error'
    );
  }, [notify]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setCategory('todos');
    setPromoOnly(false);
    setAvailableOnly(false);
    setFavoritesOnly(false);
  }, []);

  /* ── Bloqueio (iframe suspeito) ────────────────────────────────────── */
  if (blocked) return <SecurityNotice />;

  return (
    <div className="relative min-h-screen pb-24">
      <a
        href="#catalogo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[9999] focus:rounded-xl focus:bg-slate focus:px-5 focus:py-3 focus:text-sm focus:font-black focus:text-white"
      >
        Pular para o catálogo
      </a>

      <Navbar
        cartCount={cart.length}
        cartUnits={cartUnits}
        isAdmin={isAdmin}
        canInstall={canInstall}
        searchOpen={Boolean(search)}
        onOpenCart={openCart}
        onToggleAdmin={() => (isAdmin ? handleAdminLogout() : setIsAdminLoginOpen(true))}
        onInstall={() => setInstallSignal((n) => n + 1)}
        onToggleSearch={() => {
          setSearchOpenSignal((n) => n + 1);
          document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onHome={() => {
          if (isAdmin) {
            handleAdminLogout();
            return;
          }
          clearFilters();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <StatusBanner
        offline={offline}
        updateReady={updateReady}
        onApplyUpdate={() => {
          setUpdateReady(false);
          applyUpdate();
        }}
        onDismissUpdate={() => setUpdateReady(false)}
      />

      <main className="mx-auto w-full max-w-7xl px-4 pt-24 sm:px-6 md:pt-28">
        {isAdmin ? (
          <ErrorBoundary label="Painel administrativo">
            <Suspense
              fallback={
                <p className="py-24 text-center text-sm font-bold tracking-widest text-slate-soft uppercase">
                  Carregando painel…
                </p>
              }
            >
              <AdminPanel
                products={products}
                demands={demands}
                integrity={guard.integrity}
                onSaveProduct={handleSaveProduct}
                onDeleteProduct={handleDeleteProduct}
                onToggleHidden={handleToggleHidden}
                onDeleteDemand={handleDeleteDemand}
                onNotify={notify}
                onLogout={handleAdminLogout}
                onClearCache={handleClearCache}
                storageUsage={storageUsage}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <>
            <HeroBanner products={featured} onSelect={setSelectedProduct} economical={economical} />

            <HeroHeader productCount={products.length} />

            {/* Anúncio após a vitrine — nunca antes do primeiro conteúdo. */}
            <AdSlot variant="horizontal" className="mb-8" />

            <CatalogControls
              search={search}
              onSearchChange={setSearch}
              category={category}
              onCategoryChange={setCategory}
              sort={sort}
              onSortChange={setSort}
              promoOnly={promoOnly}
              onPromoOnlyChange={setPromoOnly}
              availableOnly={availableOnly}
              onAvailableOnlyChange={setAvailableOnly}
              favoritesOnly={favoritesOnly}
              onFavoritesOnlyChange={setFavoritesOnly}
              favoritesCount={favorites.length}
              totalResults={sorted.length}
              totalProducts={products.length}
              openSignal={searchOpenSignal}
            />

            {productsError && sorted.length === 0 && (
              <div
                role="alert"
                className="mb-8 flex flex-col items-center gap-3 rounded-[2rem] border-2 border-amber-200 bg-amber-50 p-6 text-center sm:flex-row sm:justify-between sm:text-left"
              >
                <p className="text-sm font-bold text-amber-900">
                  Não foi possível carregar o catálogo agora.
                  <span className="block text-xs font-medium text-amber-700">
                    Você ainda pode montar a sacola com o que já estava salvo neste aparelho.
                  </span>
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="shrink-0 rounded-2xl bg-slate px-6 py-3 text-[0.6rem] font-black tracking-widest text-white uppercase transition-colors hover:bg-blue"
                >
                  Tentar de novo
                </button>
              </div>
            )}

            <ErrorBoundary label="Catálogo de produtos">
              <ProductGrid
                products={sorted}
                loading={loading}
                favorites={favorites}
                onDetail={setSelectedProduct}
                onAdd={addToCart}
                onNotify={openMeAvise}
                onToggleFavorite={handleToggleFavorite}
                onClearFilters={clearFilters}
              />
            </ErrorBoundary>

            <SupportSection
              whatsapp={store.wpp}
              instagramUrl={SITE.social.instagram || undefined}
            />

            <Footer
              onCategory={(id) => {
                clearFilters();
                setCategory(id);
                document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
              }}
              onOpenPolicy={setPolicy}
              onInstall={() => setInstallSignal((n) => n + 1)}
              canInstall={canInstall}
            />
          </>
        )}
      </main>

      {/* ── Camadas flutuantes ───────────────────────────────────────── */}
      <Toast toast={toast} onDismiss={() => setToast(EMPTY_TOAST)} />

      <FloatingActions whatsapp={isAdmin ? '' : store.wpp} />

      <InstallPrompt openSignal={installSignal} onNotify={notify} />

      <CartSidebar
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        total={cartTotal}
        step={checkoutStep}
        onStepChange={setCheckoutStep}
        address={address}
        onAddressChange={(patch) => setAddress((prev) => ({ ...prev, ...patch }))}
        onUpdateQty={updateCartQty}
        onRemove={removeFromCart}
        onClear={clearCart}
        store={store}
        onNotify={notify}
        reducedMotion={economical}
      />

      <ProductModal
        product={resolvedProduct}
        products={products}
        isFavorite={isFavorite(resolvedProduct?.fid)}
        onClose={() => setSelectedProduct(null)}
        onSelect={setSelectedProduct}
        onAdd={addToCart}
        onNotifyRequest={openMeAvise}
        onToggleFavorite={handleToggleFavorite}
        onShare={handleShare}
        onSubmitComment={handleSubmitComment}
        reducedMotion={economical}
      />

      <MeAviseModal
        product={meAviseProduct}
        open={Boolean(meAviseProduct)}
        onClose={() => setMeAviseProduct(null)}
        onSubmit={handleSubmitDemand}
        cooldown={cooldown}
        reducedMotion={economical}
      />

      <AdminLoginModal
        open={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        onSubmit={handleAdminAuth}
        lockedUntil={auth.lockedUntil}
        attemptsLeft={auth.attemptsLeft}
        reducedMotion={economical}
      />

      <PolicyModal kind={policy} onClose={() => setPolicy(null)} />
    </div>
  );
}

/** Reexporta os limites para quem importar do App (compatibilidade). */
export { LIMITS, CATEGORIES };
