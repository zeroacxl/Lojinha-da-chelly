import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Camera,
  Check,
  Edit3,
  Eye,
  EyeOff,
  LogOut,
  Package,
  Phone,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import type { Demand, Product } from '../../types';
import { CATEGORIES } from '../../config/site';
import { cn } from '../../utils/cn';
import { fmt, relativeDate } from '../../utils/format';
import { normalizeSearch } from '../../data/store';
import type { IntegrityState } from '../../utils/security';
import { securityAdvice } from '../../utils/security';
import type { StoredAddress } from '../../data/store';

/**
 * Painel administrativo.
 *
 * É carregado sob demanda (`React.lazy` em App.tsx): quem apenas compra nunca
 * baixa este código, o que corta uma fatia grande do JavaScript inicial.
 *
 * Melhorias:
 *  - formulário com estado validado e mensagens de erro explícitas (antes um
 *    preço vazio virava `NaN` e era gravado no banco);
 *  - exclusão com confirmação em dois toques na própria linha — `confirm()`
 *    nativo é bloqueado em vários WebViews e no app instalado;
 *  - upload de foto com feedback de progresso e tratamento de erro real;
 *  - novo card "Segurança & Saúde" mostrando o diagnóstico do aparelho e o
 *    espaço que o app ocupa;
 *  - campo para ocultar produto sem apagar (evita perda de avaliações).
 */

export interface AdminPanelProps {
  products: Product[];
  demands: Demand[];
  integrity: IntegrityState;
  onSaveProduct: (payload: {
    fid?: string;
    name: string;
    price: number;
    discountPrice: number | null;
    stock: number;
    category: string;
    description: string;
    image: string;
    hidden: boolean;
  }) => Promise<boolean>;
  onDeleteProduct: (product: Product) => Promise<boolean>;
  onToggleHidden: (product: Product) => Promise<boolean>;
  onDeleteDemand: (demand: Demand) => Promise<boolean>;
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onLogout: () => void;
  onClearCache: () => Promise<void>;
  storageUsage: { usage: number; quota: number } | null;
}

type AdminView = 'produtos' | 'demandas' | 'seguranca';

interface ProductDraft {
  name: string;
  price: string;
  discountPrice: string;
  stock: string;
  category: string;
  description: string;
  hidden: boolean;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  price: '',
  discountPrice: '',
  stock: '10',
  category: 'make',
  description: '',
  hidden: false,
};

export const AdminPanel = memo(function AdminPanel({
  products,
  demands,
  integrity,
  onSaveProduct,
  onDeleteProduct,
  onToggleHidden,
  onDeleteDemand,
  onNotify,
  onLogout,
  onClearCache,
  storageUsage,
}: AdminPanelProps) {
  const [view, setView] = useState<AdminView>('produtos');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [image, setImage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ kind: 'product' | 'demand'; id: string } | null>(
    null
  );
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stats = useMemo(() => {
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 3).length;
    const soldOut = products.filter((p) => p.stock <= 0).length;
    const hidden = products.filter((p) => p.hidden).length;
    const onSale = products.filter((p) => (p.discountPrice ?? 0) > 0).length;
    const stockValue = products.reduce((sum, p) => sum + (p.discountPrice || p.price) * p.stock, 0);
    return { total: products.length, lowStock, soldOut, hidden, onSale, stockValue };
  }, [products]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(search);
    if (!needle) return products;
    return products.filter((p) =>
      normalizeSearch(`${p.name} ${p.category} ${p.description ?? ''}`).includes(needle)
    );
  }, [products, search]);

  /* ── Edição ─────────────────────────────────────────────────────── */
  const startEdit = useCallback((product: Product) => {
    setEditingId(product.fid ?? null);
    setImage(product.image ?? '');
    setDraft({
      name: product.name,
      price: String(product.price ?? ''),
      discountPrice: product.discountPrice ? String(product.discountPrice) : '',
      stock: String(product.stock ?? 0),
      category: product.category,
      description: product.description ?? '',
      hidden: product.hidden === true,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setImage('');
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const save = useCallback(async () => {
    const name = draft.name.trim();
    if (name.length < 2) {
      onNotify('⚠️ Informe o nome do produto (mínimo 2 letras)', 'error');
      return;
    }
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price <= 0) {
      onNotify('⚠️ Informe um preço válido, maior que zero', 'error');
      return;
    }
    const discountRaw = draft.discountPrice.trim();
    const discount = discountRaw ? Number(discountRaw) : null;
    if (discount !== null && (!Number.isFinite(discount) || discount < 0)) {
      onNotify('⚠️ Preço promocional inválido', 'error');
      return;
    }
    if (discount !== null && discount > 0 && discount >= price) {
      onNotify('⚠️ A promoção precisa ser menor que o preço normal', 'error');
      return;
    }
    const stock = Number(draft.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      onNotify('⚠️ Estoque inválido', 'error');
      return;
    }
    if (compressing) {
      onNotify('⏳ Ainda comprimindo a foto, aguarde…', 'info');
      return;
    }

    setSaving(true);
    const ok = await onSaveProduct({
      fid: editingId ?? undefined,
      name,
      price: Math.round(price * 100) / 100,
      discountPrice: discount !== null && discount > 0 ? Math.round(discount * 100) / 100 : null,
      stock: Math.round(stock),
      category: draft.category,
      description: draft.description.trim(),
      image,
      hidden: draft.hidden,
    });
    setSaving(false);
    if (ok) cancelEdit();
  }, [draft, image, editingId, compressing, onSaveProduct, onNotify, cancelEdit]);

  /* ── Upload de foto ─────────────────────────────────────────────── */
  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setCompressing(true);
      try {
        const { compressImage } = await import('../../utils/format');
        const compressed = await compressImage(file);
        setImage(compressed);
        onNotify(`✅ Foto pronta (${Math.round((compressed.length * 0.75) / 1024)} KB)`, 'success');
      } catch (error) {
        onNotify(
          `⚠️ ${(error as Error)?.message || 'Não foi possível processar a imagem'}`,
          'error'
        );
      } finally {
        setCompressing(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [onNotify]
  );

  /* ── Ações com confirmação ──────────────────────────────────────── */
  const runConfirmed = useCallback(async () => {
    if (!confirmAction) return;
    const { kind, id } = confirmAction;
    setConfirmAction(null);

    if (kind === 'product') {
      const target = products.find((p) => p.fid === id);
      if (target) await onDeleteProduct(target);
      return;
    }
    const demand = demands.find((d) => d.fid === id);
    if (demand) await onDeleteDemand(demand);
  }, [confirmAction, products, demands, onDeleteProduct, onDeleteDemand]);

  useEffect(() => {
    if (!confirmAction) return;
    const timer = window.setTimeout(() => setConfirmAction(null), 6000);
    return () => window.clearTimeout(timer);
  }, [confirmAction]);

  const editableImage = image || (editingId ? products.find((p) => p.fid === editingId)?.image : '');

  return (
    <div className="animate-fade-up">
      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-1 text-[0.6rem] font-black tracking-[0.25em] text-blue uppercase italic">
            Modo em tempo real ativo 🔥
          </p>
          <h2 className="text-2xl font-black text-slate italic md:text-3xl">Painel Administrativo</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 rounded-xl border-2 border-slate-pale bg-white px-4 py-2.5 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase transition-colors hover:border-rose-light hover:text-rose"
          >
            <LogOut size={14} aria-hidden="true" /> Sair
          </button>
        </div>
      </div>

      {/* ── Indicadores ───────────────────────────────────────────── */}
      <dl className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={Package}
          tone="blue"
          label="Produtos"
          value={String(stats.total)}
          hint={`${stats.hidden} ocultos`}
        />
        <StatCard
          icon={AlertCircle}
          tone="amber"
          label="Estoque baixo"
          value={String(stats.lowStock)}
          hint={`${stats.soldOut} esgotados`}
        />
        <StatCard
          icon={TrendingUp}
          tone="green"
          label="Valor em estoque"
          value={fmt(stats.stockValue)}
          hint={`${stats.onSale} em promoção`}
        />
        <StatCard
          icon={Phone}
          tone="rose"
          label="Interessados"
          value={String(demands.length)}
          hint="pedidos de aviso"
        />
      </dl>

      {/* ── Abas ──────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-wrap gap-2 sm:gap-3" role="tablist" aria-label="Seções do painel">
        {(
          [
            { id: 'produtos', label: 'Produtos', icon: Package, badge: 0 },
            { id: 'demandas', label: 'Solicitações', icon: Archive, badge: demands.length },
            { id: 'seguranca', label: 'Segurança', icon: ShieldCheck, badge: 0 },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              'relative flex items-center gap-2 rounded-xl px-5 py-2.5 text-[0.65rem] font-black tracking-widest uppercase transition-colors',
              'focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none',
              view === tab.id
                ? tab.id === 'demandas'
                  ? 'bg-rose text-white shadow-lg shadow-rose/20'
                  : 'bg-blue text-white shadow-lg shadow-blue/20'
                : 'bg-white text-slate-soft hover:text-slate'
            )}
          >
            <tab.icon size={15} aria-hidden="true" /> {tab.label}
            {tab.badge > 0 && (
              <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate text-[9px] font-black text-white">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Confirmação pendente ──────────────────────────────────── */}
      {confirmAction && (
        <div
          role="alertdialog"
          aria-label="Confirmar exclusão"
          className="mb-6 flex flex-col gap-3 rounded-2xl border-2 border-rose-light bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm font-bold text-rose-dark">
            Confirmar exclusão? Isso não pode ser desfeito.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runConfirmed()}
              className="rounded-xl bg-rose px-5 py-2.5 text-[0.6rem] font-black tracking-widest text-white uppercase transition-transform active:scale-95"
            >
              Sim, excluir
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-xl border-2 border-rose-200 bg-white px-5 py-2.5 text-[0.6rem] font-black tracking-widest text-rose-dark uppercase"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {view === 'produtos' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px,1fr] lg:gap-8">
          {/* ── Formulário ────────────────────────────────────────── */}
          <form
            className="h-fit rounded-[2rem] border border-slate-pale bg-white p-6 shadow-sm sm:p-8"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h3 className="mb-6 text-xs font-black tracking-[0.2em] text-slate-soft uppercase italic">
              {editingId ? '✏️ Editando Produto' : '📦 Novo Item'}
            </h3>

            <div className="space-y-4">
              <Field label="Nome do Produto" htmlFor="ad-name">
                <input
                  id="ad-name"
                  className="input-style"
                  placeholder="Ex: Essência Baunilha 50ml"
                  maxLength={60}
                  value={draft.name}
                  onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Field label="Preço (R$)" htmlFor="ad-price">
                  <input
                    id="ad-price"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="99999"
                    className="input-style"
                    placeholder="0,00"
                    value={draft.price}
                    onChange={(event) => setDraft((d) => ({ ...d, price: event.target.value }))}
                  />
                </Field>
                <Field label="Promoção (R$)" htmlFor="ad-discount">
                  <input
                    id="ad-discount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="99999"
                    className="input-style"
                    placeholder="opcional"
                    value={draft.discountPrice}
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, discountPrice: event.target.value }))
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Field label="Estoque" htmlFor="ad-stock">
                  <input
                    id="ad-stock"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    max="9999"
                    className="input-style"
                    placeholder="0"
                    value={draft.stock}
                    onChange={(event) => setDraft((d) => ({ ...d, stock: event.target.value }))}
                  />
                </Field>
                <Field label="Categoria" htmlFor="ad-category">
                  <select
                    id="ad-category"
                    className="input-style"
                    value={draft.category}
                    onChange={(event) => setDraft((d) => ({ ...d, category: event.target.value }))}
                  >
                    {CATEGORIES.filter((c) => c.id !== 'todos').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Descrição" htmlFor="ad-description">
                <textarea
                  id="ad-description"
                  className="input-style h-24 resize-none"
                  placeholder="Notas, tamanho, modo de uso…"
                  maxLength={600}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, description: event.target.value }))
                  }
                />
              </Field>

              {/* Foto */}
              <div>
                <span className="mb-1.5 block text-[0.6rem] font-black tracking-widest text-slate-soft uppercase italic">
                  Foto do produto
                </span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={compressing}
                  className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-soft/25 bg-slate-pale transition-colors hover:border-blue disabled:opacity-60"
                >
                  {editableImage ? (
                    <img
                      src={editableImage}
                      alt="Pré-visualização da foto do produto"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-center text-slate-soft">
                      <Camera className="mx-auto mb-2" aria-hidden="true" />
                      <span className="text-[0.6rem] font-bold tracking-widest uppercase">
                        {compressing ? 'Comprimindo…' : 'Carregar Foto'}
                      </span>
                    </span>
                  )}
                </button>
                <p className="mt-1.5 text-[0.55rem] leading-relaxed text-slate-soft/70">
                  A foto é redimensionada e comprimida no próprio aparelho antes de gravar (máx. 800
                  KB). Isso mantém o catálogo rápido no celular das clientes.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => void handleFile(event.target.files?.[0])}
                />
                {editableImage && (
                  <button
                    type="button"
                    onClick={() => setImage('')}
                    className="mt-2 flex items-center gap-1.5 text-[0.6rem] font-bold tracking-widest text-slate-soft uppercase hover:text-rose"
                  >
                    <X size={12} aria-hidden="true" /> Remover foto
                  </button>
                )}
              </div>

              {/* Ocultar */}
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-pale bg-slate-pale/50 p-3.5">
                <input
                  type="checkbox"
                  checked={draft.hidden}
                  onChange={(event) => setDraft((d) => ({ ...d, hidden: event.target.checked }))}
                  className="h-4 w-4 accent-rose"
                />
                <span className="text-[0.65rem] leading-relaxed font-bold text-slate-mid">
                  Ocultar da vitrine (mantém avaliações e histórico)
                </span>
              </label>

              <button
                type="submit"
                disabled={saving || compressing}
                className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-[0.75rem] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={18} aria-hidden="true" />
                {saving ? 'Salvando…' : editingId ? 'Atualizar Produto' : 'Salvar Produto'}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="w-full text-center text-[0.65rem] font-bold tracking-widest text-slate-soft uppercase"
                >
                  Cancelar Edição
                </button>
              )}
            </div>
          </form>

          {/* ── Lista ─────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-[2rem] border border-slate-pale bg-white shadow-sm">
            <div className="border-b border-slate-pale p-5 sm:p-6">
              <div className="relative">
                <label htmlFor="ad-search" className="sr-only">
                  Buscar produto no painel
                </label>
                <Search
                  size={18}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-soft"
                  aria-hidden="true"
                />
                <input
                  id="ad-search"
                  type="search"
                  className="w-full rounded-xl border border-transparent bg-slate-pale py-3 pr-4 pl-12 text-sm font-bold outline-none placeholder:text-slate-soft/50 focus:border-blue/20"
                  placeholder="Buscar produto no painel…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <p className="mt-2 text-[0.6rem] font-bold tracking-wider text-slate-soft uppercase">
                {filtered.length} de {products.length} produtos
              </p>
            </div>

            {filtered.length === 0 ? (
              <p className="p-12 text-center text-sm text-slate-soft italic">
                Nenhum produto encontrado com esse termo.
              </p>
            ) : (
              <ul className="divide-y divide-slate-pale">
                {filtered.map((product) => (
                  <li
                    key={product.fid}
                    className={cn(
                      'flex items-center gap-4 p-4 transition-colors hover:bg-slate-pale/40 sm:p-5',
                      product.hidden && 'opacity-60'
                    )}
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-pale shadow-sm">
                      {product.image && (
                        <img
                          src={product.image}
                          alt=""
                          width={48}
                          height={48}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate italic">
                        {product.name}
                      </span>
                      <span className="block text-xs font-black text-blue italic tabular-nums">
                        {fmt(product.discountPrice || product.price)}
                        {product.discountPrice ? (
                          <span className="ml-2 text-slate-soft line-through">
                            {fmt(product.price)}
                          </span>
                        ) : null}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'hidden shrink-0 rounded-full border px-3 py-1 text-[0.55rem] font-black tracking-widest uppercase sm:block',
                        product.stock > 3
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : product.stock > 0
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-rose-200 bg-rose-50 text-rose-700'
                      )}
                    >
                      {product.stock} un.
                    </span>

                    <span className="flex shrink-0 items-center gap-1">
                      <AdminIconButton
                        label={product.hidden ? 'Mostrar na vitrine' : 'Ocultar da vitrine'}
                        onClick={() => void onToggleHidden(product)}
                      >
                        {product.hidden ? <EyeOff size={17} /> : <Eye size={17} />}
                      </AdminIconButton>
                      <AdminIconButton label={`Editar ${product.name}`} onClick={() => startEdit(product)}>
                        <Edit3 size={17} aria-hidden="true" />
                      </AdminIconButton>
                      <AdminIconButton
                        label={`Excluir ${product.name}`}
                        danger
                        onClick={() =>
                          setConfirmAction({ kind: 'product', id: product.fid ?? '' })
                        }
                      >
                        <Trash2 size={17} />
                      </AdminIconButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {view === 'demandas' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {demands.length === 0 ? (
            <p className="col-span-full rounded-[2rem] border border-slate-pale bg-white py-20 text-center">
              <span className="mb-6 block text-6xl opacity-20" aria-hidden="true">
                📭
              </span>
              <span className="block text-2xl font-black text-slate italic">Tudo limpo por aqui!</span>
              <span className="mt-2 block text-sm text-slate-soft italic">
                Nenhuma solicitação de aviso de estoque pendente.
              </span>
            </p>
          ) : (
            demands.map((demand) => (
              <article
                key={demand.fid}
                className="group relative rounded-[2rem] border border-slate-pale bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <p className="text-[0.6rem] font-black tracking-widest text-rose uppercase italic">
                    {relativeDate(demand.createdAt) || demand.date || 'sem data'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ kind: 'demand', id: demand.fid ?? '' })}
                    className="rounded-xl bg-slate-pale p-2 text-slate-soft transition-colors hover:bg-rose-light hover:text-rose"
                    aria-label={`Excluir solicitação de ${demand.user}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>

                <h3 className="mb-4 text-lg font-black text-slate uppercase italic">
                  {demand.product}
                </h3>

                <dl className="mb-6 space-y-2 rounded-2xl bg-slate-pale p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <dt className="sr-only">Cliente</dt>
                    <dd className="font-bold text-slate-mid">
                      <span aria-hidden="true">👤</span> {demand.user}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="sr-only">WhatsApp</dt>
                    <dd className="font-bold text-slate-mid tabular-nums">
                      <span aria-hidden="true">📱</span> {demand.whatsapp}
                    </dd>
                  </div>
                </dl>

                <a
                  href={`https://wa.me/${demand.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Olá ${demand.user}! O produto "${demand.product}" que você pediu chegou na Chelly Shop ✨`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-[0.65rem] font-black tracking-widest text-white uppercase shadow-lg shadow-green-500/20 transition-colors hover:bg-[#1fb457]"
                >
                  <Phone size={14} aria-hidden="true" /> Contactar Cliente
                </a>
              </article>
            ))
          )}
        </div>
      )}

      {view === 'seguranca' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-slate-pale bg-white p-6 shadow-sm sm:p-8">
            <h3 className="mb-5 flex items-center gap-2 text-sm font-black tracking-widest text-slate uppercase not-italic">
              <ShieldCheck size={18} className="text-green-600" aria-hidden="true" />
              Diagnóstico do ambiente
            </h3>
            <ul className="space-y-3 text-sm">
              <HealthRow
                ok={!integrity.insecureContext}
                label="Conexão segura (HTTPS)"
                hint={
                  integrity.insecureContext
                    ? 'A loja está em HTTP. Service worker, Pix e clipboard não funcionam.'
                    : 'Service worker, clipboard e Pix podem funcionar.'
                }
              />
              <HealthRow
                ok={!integrity.framed}
                label="Fora de iframe suspeito"
                hint={
                  integrity.framed
                    ? 'A página está embutida em outro site (risco de clickjacking).'
                    : 'Nenhum site externo está embutindo a loja.'
                }
              />
              <HealthRow
                ok={!integrity.storageBlocked}
                label="Armazenamento local disponível"
                hint={
                  integrity.storageBlocked
                    ? 'Sacola e favoritos não serão lembrados (modo anônimo ou cookies bloqueados).'
                    : 'Sacola e favoritos são lembrados neste aparelho.'
                }
              />
              <HealthRow
                ok={!integrity.weakCrypto}
                label="Criptografia do navegador"
                hint={
                  integrity.weakCrypto
                    ? 'Web Crypto ausente: navegador muito antigo.'
                    : 'Web Crypto disponível.'
                }
              />
            </ul>

            <p className="mt-6 rounded-2xl bg-slate-pale p-4 text-xs leading-relaxed text-slate-mid italic">
              {securityAdvice()}
            </p>
          </section>

          <section className="rounded-[2rem] border border-slate-pale bg-white p-6 shadow-sm sm:p-8">
            <h3 className="mb-5 text-sm font-black tracking-widest text-slate uppercase not-italic">
              App instalado no aparelho
            </h3>
            {storageUsage ? (
              <>
                <p className="mb-2 text-3xl font-black text-slate italic tabular-nums">
                  {(storageUsage.usage / 1024 / 1024).toFixed(1)} MB
                </p>
                <p className="mb-5 text-xs text-slate-soft">
                  de {(storageUsage.quota / 1024 / 1024).toFixed(0)} MB disponíveis neste aparelho
                </p>
                <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-pale">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-rose to-blue"
                    style={{
                      width: `${Math.min(100, (storageUsage.usage / Math.max(1, storageUsage.quota)) * 100)}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="mb-6 text-xs text-slate-soft">
                Este navegador não informa o espaço usado pelo app.
              </p>
            )}

            <button
              type="button"
              onClick={() => void onClearCache()}
              className="w-full rounded-2xl border-2 border-slate-pale px-5 py-3.5 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase transition-colors hover:border-rose-light hover:text-rose"
            >
              Liberar espaço (limpar cache offline)
            </button>
            <p className="mt-3 text-[0.6rem] leading-relaxed text-slate-soft/70">
              Remove imagens e páginas em cache. O catálogo volta a ser baixado na próxima visita —
              nada de pedido ou favorito é apagado.
            </p>
          </section>
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ *
 * Peças pequenas
 * ------------------------------------------------------------------ */

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[0.6rem] font-black tracking-widest text-slate-soft uppercase italic"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function AdminIconButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-lg p-2 text-slate-soft transition-colors focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none',
        danger ? 'hover:bg-rose-50 hover:text-rose' : 'hover:bg-blue-light hover:text-blue'
      )}
    >
      {children}
    </button>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof Package;
  tone: 'blue' | 'amber' | 'green' | 'rose';
  label: string;
  value: string;
  hint: string;
}) {
  const tones = {
    blue: 'bg-blue-light text-blue',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-700',
    rose: 'bg-rose-light text-rose-dark',
  } as const;

  return (
    <div className="rounded-[1.5rem] border border-slate-pale bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
      <div className="flex items-center gap-3 sm:gap-4">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12',
            tones[tone]
          )}
        >
          <Icon size={19} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <dt className="truncate text-[0.55rem] font-black tracking-widest text-slate-soft uppercase italic">
            {label}
          </dt>
          <dd className="truncate text-lg font-black text-slate italic tabular-nums sm:text-2xl">
            {value}
          </dd>
          <dd className="truncate text-[0.55rem] font-bold text-slate-soft/60">{hint}</dd>
        </span>
      </div>
    </div>
  );
}

function HealthRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-slate-pale p-3.5">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white',
          ok ? 'bg-green-500' : 'bg-amber-500'
        )}
        aria-hidden="true"
      >
        {ok ? <Check size={12} /> : <AlertCircle size={12} />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-slate uppercase not-italic">{label}</span>
        <span className="block text-[0.65rem] leading-relaxed text-slate-soft">{hint}</span>
      </span>
    </li>
  );
}

/** Mantém o tipo de endereço exportado para quem importar do painel. */
export type { StoredAddress };
