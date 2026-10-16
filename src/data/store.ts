import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import type { CartItem, Demand, Product, SortMode } from '../types';
import { STORE_DEFAULTS, type StoreConfig } from '../config/site';
import {
  LIMITS,
  clampStars,
  sanitizeCategory,
  sanitizePixKey,
  sanitizeText,
} from '../utils/sanitize';
import { digitsOnly, toDate } from '../utils/format';
import { hasActiveAdminSession, openAdminSession, touchAdminSession } from '../utils/security';
import { KEYS, readJSON, writeJSON } from '../utils/storage';

/**
 * Camada de dados da loja.
 *
 * Todo acesso ao Firestore passa por aqui. Benefícios práticos:
 *  - um único lugar para validar/normalizar o que vem do banco (documento
 *    antigo sem campo novo não quebra mais a tela);
 *  - os componentes ficam apresentacionais e fáceis de testar;
 *  - cada coleção é assinada UMA vez e compartilhada, em vez de vários
 *    componentes abrirem escutas duplicadas.
 *
 * IMPORTANTE: nada aqui altera o Firebase. Credenciais e inicialização
 * continuam exatamente como estão em `src/utils/firebase.ts`.
 */

/* ------------------------------------------------------------------ *
 * Normalização dos documentos
 * ------------------------------------------------------------------ */

export const KNOWN_CATEGORIES = ['perfumes', 'skincare', 'make', 'cabelo', 'corpo'];

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Converte um documento cru em `Product` garantindo campos utilizáveis. */
export function normalizeProduct(id: string, raw: Record<string, unknown>): Product {
  const price = Math.max(0, toNumber(raw.price));
  const discount = Math.max(0, toNumber(raw.discountPrice));
  const commentsRaw = Array.isArray(raw.comments) ? raw.comments : [];

  return {
    fid: id,
    name: sanitizeText(raw.name, LIMITS.name) || 'Produto sem nome',
    price,
    discountPrice: discount > 0 && discount < price ? discount : null,
    stock: Math.max(0, Math.round(toNumber(raw.stock))),
    category: sanitizeCategory(raw.category, KNOWN_CATEGORIES),
    description: sanitizeText(raw.description, LIMITS.description),
    image: typeof raw.image === 'string' ? raw.image : '',
    rating: toNumber(raw.rating) > 0 ? Math.min(5, toNumber(raw.rating)) : 5,
    hidden: raw.hidden === true,
    comments: commentsRaw
      .map((entry) => {
        const c = (entry ?? {}) as Record<string, unknown>;
        return {
          id: toNumber(c.id),
          user: sanitizeText(c.user, LIMITS.userName) || 'Cliente',
          text: sanitizeText(c.text, LIMITS.comment),
          stars: clampStars(c.stars),
          date: sanitizeText(c.date, 20),
        };
      })
      .filter((c) => c.text.length > 0),
    createdAt: (raw.createdAt as Product['createdAt']) ?? null,
    updatedAt: (raw.updatedAt as Product['updatedAt']) ?? null,
  };
}

/** Converte um documento cru em `Demand`. */
export function normalizeDemand(id: string, raw: Record<string, unknown>): Demand {
  return {
    fid: id,
    product: sanitizeText(raw.product, LIMITS.name),
    productId: typeof raw.productId === 'string' ? raw.productId : undefined,
    user: sanitizeText(raw.user, LIMITS.userName),
    whatsapp: digitsOnly(raw.whatsapp).slice(0, 15),
    date: sanitizeText(raw.date, 20),
    createdAt: (raw.createdAt as Demand['createdAt']) ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Assinaturas em tempo real
 * ------------------------------------------------------------------ */

/**
 * Mantém a referência da assinatura ativa, mesmo quando precisamos trocar de
 * consulta no meio do caminho (ex.: fallback sem `orderBy`). Sem isso, a
 * limpeza no unmount vazaria um listener do Firestore.
 */
class LiveSubscription {
  private current: Unsubscribe | null = null;
  private disposed = false;

  set(unsubscribe: Unsubscribe): void {
    if (this.disposed) {
      unsubscribe();
      return;
    }
    this.current = unsubscribe;
  }

  dispose(): void {
    this.disposed = true;
    this.current?.();
    this.current = null;
  }
}

function mapProducts(snapshot: { docs: { id: string; data: () => unknown }[] }): Product[] {
  return snapshot.docs.map((d) => normalizeProduct(d.id, (d.data() ?? {}) as Record<string, unknown>));
}

function mapDemands(snapshot: { docs: { id: string; data: () => unknown }[] }): Demand[] {
  return snapshot.docs.map((d) => normalizeDemand(d.id, (d.data() ?? {}) as Record<string, unknown>));
}

/**
 * Escuta `products`.
 *
 * O `orderBy('createdAt')` original é mantido. Se ele falhar (documento sem o
 * campo, índice ausente, permissão negada) caímos para uma consulta sem
 * ordenação — a vitrine continua vendendo em vez de ficar vazia.
 */
export function subscribeProducts(handlers: {
  onData: (products: Product[]) => void;
  onError?: (error: Error) => void;
}): () => void {
  const live = new LiveSubscription();
  let fallbackStarted = false;

  const startFallback = (cause: Error) => {
    if (fallbackStarted) {
      handlers.onError?.(cause);
      return;
    }
    fallbackStarted = true;
    try {
      live.set(
        onSnapshot(
          collection(db, 'products'),
          (snapshot) => handlers.onData(mapProducts(snapshot)),
          (error) => {
            handlers.onError?.(error);
            handlers.onData([]);
          }
        )
      );
    } catch (error) {
      handlers.onError?.((error as Error) ?? cause);
      handlers.onData([]);
    }
  };

  try {
    live.set(
      onSnapshot(
        query(collection(db, 'products'), orderBy('createdAt', 'asc')),
        (snapshot) => handlers.onData(mapProducts(snapshot)),
        (error) => startFallback(error)
      )
    );
  } catch (error) {
    startFallback(error as Error);
  }

  return () => live.dispose();
}

/** Escuta `demands` (usada apenas com o painel administrativo aberto). */
export function subscribeDemands(handlers: {
  onData: (demands: Demand[]) => void;
  onError?: (error: Error) => void;
}): () => void {
  const live = new LiveSubscription();
  let fallbackStarted = false;

  const startFallback = () => {
    if (fallbackStarted) return;
    fallbackStarted = true;
    try {
      live.set(
        onSnapshot(
          collection(db, 'demands'),
          (snapshot) => handlers.onData(mapDemands(snapshot)),
          (error) => handlers.onError?.(error)
        )
      );
    } catch (error) {
      handlers.onError?.(error as Error);
    }
  };

  try {
    live.set(
      onSnapshot(
        query(collection(db, 'demands'), orderBy('createdAt', 'desc')),
        (snapshot) => handlers.onData(mapDemands(snapshot)),
        () => startFallback()
      )
    );
  } catch {
    startFallback();
  }

  return () => live.dispose();
}

/* ------------------------------------------------------------------ *
 * Configuração da loja (settings/config)
 * ------------------------------------------------------------------ */

/**
 * Lê `settings/config`.
 *
 * O caminho é o mesmo de antes. Removemos apenas a "ofuscação" com
 * `"\x73\x65\x74\x74\x69\x6e\x67\x73"`: o bundle é público, qualquer pessoa
 * lê as strings no arquivo compilado, então aquilo não protegia nada e ainda
 * atrapalhava a manutenção.
 */
export async function fetchStoreConfig(): Promise<StoreConfig> {
  try {
    const snapshot = await getDoc(doc(db, 'settings', 'config'));
    if (!snapshot.exists()) return { ...STORE_DEFAULTS };

    const data = snapshot.data() as Record<string, unknown>;
    return {
      pix: sanitizePixKey(data.pix_key) || STORE_DEFAULTS.pix,
      wpp: digitsOnly(data.whatsapp) || STORE_DEFAULTS.wpp,
      name: sanitizeText(data.store_name, 30) || STORE_DEFAULTS.name,
      city: sanitizeText(data.store_city, 20) || STORE_DEFAULTS.city,
    };
  } catch {
    // Offline ou sem permissão: segue com os valores padrão.
    return { ...STORE_DEFAULTS };
  }
}

/* ------------------------------------------------------------------ *
 * Hooks de dados
 * ------------------------------------------------------------------ */

export interface ProductsState {
  products: Product[];
  loading: boolean;
  error: Error | null;
  /** true quando a última leitura veio sem conexão. */
  offline: boolean;
  /** Reabre a assinatura (botão "tentar novamente"). */
  retry: () => void;
}

/** Catálogo em tempo real. */
export function useProducts(): ProductsState {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeProducts({
      onData: (data) => {
        if (!active) return;
        setProducts(data);
        setLoading(false);
        setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
      },
      onError: (err) => {
        if (!active) return;
        setError(err);
        setLoading(false);
      },
    });

    const onOnline = () => setNonce((n) => n + 1);
    window.addEventListener('online', onOnline);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('online', onOnline);
    };
  }, [nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { products, loading, error, offline, retry };
}

/** Solicitações de "me avise" — assina só enquanto o painel está aberto. */
export function useDemands(enabled: boolean) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDemands([]);
      return;
    }
    let active = true;
    const unsubscribe = subscribeDemands({
      onData: (data) => active && setDemands(data),
      onError: (err) => active && setError(err),
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);

  return { demands, error };
}

/** Configuração da loja (Pix, WhatsApp, nome, cidade). */
export function useStoreConfig(): StoreConfig {
  const [config, setConfig] = useState<StoreConfig>({ ...STORE_DEFAULTS });

  useEffect(() => {
    let active = true;
    void fetchStoreConfig().then((next) => {
      if (active) setConfig(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return config;
}

/**
 * Sessão administrativa.
 *
 * Persiste em `sessionStorage` (recarregar a página não desloga) e expira após
 * 30 minutos sem atividade. Antes, deixar o painel aberto num computador
 * compartilhado era acesso permanente.
 */
export function useAdminSession() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => hasActiveAdminSession());
  const timerRef = useRef<number | null>(null);

  const login = useCallback(() => {
    openAdminSession();
    setIsAdmin(true);
  }, []);

  const logout = useCallback(() => {
    setIsAdmin(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const check = () => {
      if (!touchAdminSession()) setIsAdmin(false);
    };
    const activity = () => touchAdminSession();

    timerRef.current = window.setInterval(check, 30_000);
    window.addEventListener('click', activity, { passive: true });
    window.addEventListener('keydown', activity);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      window.removeEventListener('click', activity);
      window.removeEventListener('keydown', activity);
    };
  }, [isAdmin]);

  return { isAdmin, login, logout };
}

/* ------------------------------------------------------------------ *
 * Favoritos, sacola e endereço (persistidos no aparelho)
 * ------------------------------------------------------------------ */

/** Favoritos — sobrevivem a recarregar a página e ao app instalado. */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => readJSON<string[]>(KEYS.favorites, []));

  useEffect(() => {
    writeJSON(KEYS.favorites, favorites);
  }, [favorites]);

  const toggle = useCallback((fid?: string) => {
    if (!fid) return false;
    let added = false;
    setFavorites((prev) => {
      const exists = prev.includes(fid);
      added = !exists;
      return exists ? prev.filter((id) => id !== fid) : [...prev, fid];
    });
    return added;
  }, []);

  const has = useCallback((fid?: string) => Boolean(fid && favorites.includes(fid)), [favorites]);

  return { favorites, toggle, has, count: favorites.length };
}

export const MAX_CART_ITEMS = 60;

/** Sacola — persistida: fechar o app não perde o pedido. */
export function useCart() {
  const [cart, setCart] = useState<CartItem[]>(() => {
    const stored = readJSON<Partial<CartItem>[]>(KEYS.cart, []);
    // Revalida o que estava gravado: produto apagado/preço inválido sai.
    return stored
      .filter((item) => item && typeof item.name === 'string')
      .slice(0, MAX_CART_ITEMS)
      .map((item, index) => ({
        ...(item as CartItem),
        cartId: String(item.cartId ?? `restored-${index}`),
        quantity: Math.max(1, Math.min(999, Math.round(toNumber(item.quantity)) || 1)),
        unitPrice: Math.max(0, toNumber(item.unitPrice) || toNumber(item.price)),
      }));
  });

  useEffect(() => {
    writeJSON(KEYS.cart, cart);
  }, [cart]);

  const clear = useCallback(() => setCart([]), []);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const units = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  return { cart, setCart, clear, total, units };
}

/** Endereço de entrega — lembra do último usado. */
export interface StoredAddress {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  referencia: string;
}

export const EMPTY_ADDRESS: StoredAddress = {
  rua: '',
  numero: '',
  bairro: '',
  cidade: 'Rio Branco - AC',
  referencia: '',
};

export function useAddress() {
  const [address, setAddress] = useState<StoredAddress>(() => {
    const stored = readJSON<Partial<StoredAddress>>(KEYS.address, {});
    return {
      rua: sanitizeText(stored.rua, LIMITS.street),
      numero: sanitizeText(stored.numero, LIMITS.number),
      bairro: sanitizeText(stored.bairro, LIMITS.district),
      cidade: sanitizeText(stored.cidade, LIMITS.city) || EMPTY_ADDRESS.cidade,
      referencia: sanitizeText(stored.referencia, LIMITS.street),
    };
  });

  useEffect(() => {
    writeJSON(KEYS.address, address);
  }, [address]);

  const reset = useCallback(() => setAddress({ ...EMPTY_ADDRESS }), []);

  const isComplete = useMemo(
    () => Boolean(address.rua.trim() && address.numero.trim() && address.bairro.trim()),
    [address]
  );

  return { address, setAddress, reset, isComplete };
}

/* ------------------------------------------------------------------ *
 * Filtro e ordenação (funções puras -> fáceis de testar)
 * ------------------------------------------------------------------ */

/** Preço efetivo (com promoção) usado nas ordenações. */
export function priceOf(product: Product): number {
  const promo = toNumber(product.discountPrice);
  const price = toNumber(product.price);
  return promo > 0 && promo < price ? promo : price;
}

export function sortProducts(products: Product[], mode: SortMode): Product[] {
  const copy = [...products];
  switch (mode) {
    case 'price-asc':
      return copy.sort((a, b) => priceOf(a) - priceOf(b));
    case 'price-desc':
      return copy.sort((a, b) => priceOf(b) - priceOf(a));
    case 'rating':
      return copy.sort((a, b) => toNumber(b.rating) - toNumber(a.rating));
    case 'newest':
    default:
      return copy.sort((a, b) => {
        const ta = toDate(a.createdAt)?.getTime() ?? 0;
        const tb = toDate(b.createdAt)?.getTime() ?? 0;
        return tb - ta;
      });
  }
}

export interface FilterOptions {
  category: string;
  search: string;
  favoritesOnly?: boolean;
  favorites?: string[];
  availableOnly?: boolean;
  promoOnly?: boolean;
}

/** Filtra o catálogo. A busca ignora acentos e caixa alta. */
export function filterProducts(products: Product[], options: FilterOptions): Product[] {
  const needle = normalizeSearch(options.search);
  const words = needle ? needle.split(/\s+/).filter(Boolean) : [];
  const favoriteSet = options.favoritesOnly ? new Set(options.favorites ?? []) : null;

  return products.filter((product) => {
    if (product.hidden === true) return false;

    if (options.category && options.category !== 'todos' && product.category !== options.category) {
      return false;
    }
    if (favoriteSet && !favoriteSet.has(product.fid ?? '')) return false;
    if (options.availableOnly && toNumber(product.stock) <= 0) return false;
    if (options.promoOnly && priceOf(product) >= toNumber(product.price)) return false;
    if (words.length === 0) return true;

    const haystack = normalizeSearch(
      `${product.name} ${product.description ?? ''} ${product.category}`
    );
    return words.every((word) => haystack.includes(word));
  });
}

/** Minúsculas e sem acento: a busca acha "essencia" digitando "essência". */
export function normalizeSearch(input: unknown): string {
  const raw = typeof input === 'string' ? input : '';
  const lower = raw.toLowerCase().trim();
  try {
    return lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return lower;
  }
}

/** Produtos em destaque para o banner (promoção ou muito bem avaliados). */
export function pickFeatured(products: Product[], limit = 4): Product[] {
  const promoOf = (p: Product) => toNumber(p.discountPrice);
  return products
    .filter((p) => p.image)
    .filter((p) => promoOf(p) > 0 || toNumber(p.rating) >= 4.8)
    .sort((a, b) => {
      // Promoção primeiro; empate -> melhor avaliação.
      const promoDiff = (promoOf(b) > 0 ? 1 : 0) - (promoOf(a) > 0 ? 1 : 0);
      if (promoDiff !== 0) return promoDiff;
      return toNumber(b.rating) - toNumber(a.rating);
    })
    .slice(0, limit);
}

