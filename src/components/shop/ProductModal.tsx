import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Heart, Minus, Plus, Share2, Star, X } from 'lucide-react';
import type { Comment, Product } from '../../types';
import { CATEGORIES } from '../../config/site';
import { cn } from '../../utils/cn';
import { discountPercent, finalPrice, fmt } from '../../utils/format';
import { LIMITS, clampStars, sanitizeText } from '../../utils/sanitize';
import { honeypotTripped } from '../../utils/security';
import { Modal } from '../ui/Modal';

/**
 * Ficha do produto (modal).
 *
 * Melhorias:
 *  - Formulário de avaliação com estado controlado do React. Antes lia o valor
 *    com `document.getElementById(...).value`, o que escapa do fluxo do React,
 *    não limpa depois de enviar e quebra se o campo não existir.
 *  - Honeypot anti-spam: um campo invisível que só robô preenche.
 *  - Estrelas clicáveis (não só `<select>`), com `aria-label` em cada uma.
 *  - "Você também pode gostar" mostra produtos da mesma categoria E, se não
 *    houver, os mais bem avaliados — antes podia aparecer vazio.
 *  - `Escape` fecha, foco preso, `role="dialog"` (herdado do Modal).
 *  - Quantidade limitada ao estoque real e reiniciada ao trocar de produto.
 */

interface ProductModalProps {
  product: Product | null;
  products: Product[];
  isFavorite: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
  onAdd: (product: Product, qty: number) => void;
  onNotifyRequest: (product: Product) => void;
  onToggleFavorite: (product: Product) => void;
  onShare: (product: Product) => void;
  onSubmitComment: (product: Product, comment: Omit<Comment, 'id' | 'date'>) => Promise<boolean>;
  reducedMotion?: boolean;
}

interface ReviewDraft {
  user: string;
  text: string;
  stars: number;
  /** Campo invisível — se vier preenchido, é robô. */
  website: string;
}

const EMPTY_DRAFT: ReviewDraft = { user: '', text: '', stars: 5, website: '' };

export const ProductModal = memo(function ProductModal({
  product,
  products,
  isFavorite,
  onClose,
  onSelect,
  onAdd,
  onNotifyRequest,
  onToggleFavorite,
  onShare,
  onSubmitComment,
  reducedMotion = false,
}: ProductModalProps) {
  const [draft, setDraft] = useState<ReviewDraft>(EMPTY_DRAFT);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const stock = Math.max(0, Math.round(Number(product?.stock) || 0));
  const price = Number(product?.price) || 0;
  const off = discountPercent(price, product?.discountPrice);
  const effective = product ? finalPrice(price, product.discountPrice) : 0;
  const rating = Number(product?.rating) || 5;
  const comments = useMemo(() => product?.comments ?? [], [product]);

  // Trocou de produto -> zera quantidade e rascunho da avaliação.
  useEffect(() => {
    setQty(1);
    setDraft(EMPTY_DRAFT);
  }, [product?.fid]);

  const related = useMemo(() => {
    if (!product) return [];
    const sameCategory = products.filter(
      (p) => p.fid !== product.fid && p.category === product.category && p.image
    );
    if (sameCategory.length >= 3) return sameCategory.slice(0, 3);
    // Completa com os mais bem avaliados da loja.
    const others = products
      .filter((p) => p.fid !== product.fid && p.image && !sameCategory.includes(p))
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    return [...sameCategory, ...others].slice(0, 3);
  }, [product, products]);

  const distribution = useMemo(() => {
    const counts = [5, 4, 3, 2, 1].map(
      (star) => comments.filter((c) => c.stars === star).length
    );
    const total = comments.length;
    return counts.map((count, i) => ({
      star: 5 - i,
      count,
      percent: total > 0 ? (count / total) * 100 : 5 - i === 5 ? 100 : 0,
    }));
  }, [comments]);

  const submitReview = useCallback(async () => {
    if (!product || submitting) return;
    if (honeypotTripped(draft.website)) return; // robô: ignora silenciosamente

    const user = sanitizeText(draft.user, LIMITS.userName);
    const text = sanitizeText(draft.text, LIMITS.comment);
    if (user.length < 2 || text.length < 3) return;

    setSubmitting(true);
    const ok = await onSubmitComment(product, {
      user,
      text,
      stars: clampStars(draft.stars),
    });
    setSubmitting(false);
    if (ok) setDraft(EMPTY_DRAFT);
  }, [product, submitting, draft, onSubmitComment]);

  if (!product) return null;

  const name = sanitizeText(product.name, LIMITS.name);
  const categoryLabel = CATEGORIES.find((c) => c.id === product.category)?.label ?? 'Produto';

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      labelledBy="product-title"
      maxWidth="max-w-5xl"
      zIndex={110}
      reducedMotion={reducedMotion}
      className="flex max-h-[92vh] flex-col md:max-h-[90vh] md:flex-row"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-soft shadow-lg backdrop-blur transition-all hover:text-rose hover:scale-105 focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
        aria-label="Fechar detalhes do produto"
      >
        <X size={20} aria-hidden="true" />
      </button>

      {/* ── Foto ──────────────────────────────────────────────────── */}
      <div className="relative h-[260px] shrink-0 bg-slate-pale sm:h-[320px] md:h-auto md:w-[45%]">
        {product.image ? (
          <img
            src={product.image}
            alt={name}
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl text-slate-soft/25">
            ✨
          </div>
        )}

        {off > 0 && (
          <span className="absolute top-4 left-4 rounded-full bg-rose px-3 py-1.5 text-[0.6rem] font-black tracking-widest text-white shadow-lg">
            🔥 {off}% OFF
          </span>
        )}

        <div className="absolute bottom-4 left-4 hidden rounded-[1.5rem] bg-white/95 p-4 shadow-2xl backdrop-blur-xl sm:block">
          <StarRow value={rating} size={14} />
          <p className="mt-1 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase italic">
            {comments.length} {comments.length === 1 ? 'avaliação' : 'avaliações'} de clientes
          </p>
        </div>
      </div>

      {/* ── Conteúdo ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-6 sm:p-8 md:p-12">
        <div className="mb-8">
          <p className="mb-3 block text-[0.6rem] font-black tracking-[0.3em] text-blue uppercase italic">
            {categoryLabel}
          </p>
          <h2
            id="product-title"
            className="mb-4 text-3xl leading-none font-black text-slate italic sm:text-4xl md:text-5xl"
          >
            {name}
          </h2>

          <div className="mb-6 flex flex-wrap items-baseline gap-3 sm:gap-4">
            {off > 0 && (
              <span className="text-lg font-black text-slate-soft line-through tabular-nums">
                {fmt(price)}
              </span>
            )}
            <span className="text-3xl font-black text-rose italic tabular-nums sm:text-4xl">
              {fmt(effective)}
            </span>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onToggleFavorite(product)}
              aria-pressed={isFavorite}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3 text-[0.6rem] font-black tracking-widest uppercase transition-colors',
                'focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none',
                isFavorite
                  ? 'border-rose bg-rose text-white shadow-lg shadow-rose/20'
                  : 'border-slate-pale bg-white text-slate-soft hover:border-rose-light hover:text-rose'
              )}
            >
              <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
              {isFavorite ? 'Favoritado' : 'Favoritar'}
            </button>
            <button
              type="button"
              onClick={() => onShare(product)}
              className="rounded-2xl border-2 border-slate-pale bg-white px-5 py-3 text-slate-soft transition-colors hover:border-blue-light hover:text-blue focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
              aria-label={`Compartilhar ${name}`}
            >
              <Share2 size={16} aria-hidden="true" />
            </button>
          </div>

          {product.description && (
            <p className="mb-8 rounded-3xl border border-slate-pale bg-slate-pale p-5 text-sm leading-relaxed text-slate-mid italic">
              {sanitizeText(product.description, LIMITS.description)}
            </p>
          )}

          {/* ── Compra / esgotado ───────────────────────────────────── */}
          {stock > 0 ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <span className="text-[0.6rem] font-black tracking-widest text-slate-soft uppercase">
                  Quantidade
                </span>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="Diminuir quantidade"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-slate-pale text-slate transition-colors hover:bg-slate hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate"
                  >
                    <Minus size={18} aria-hidden="true" />
                  </button>
                  <span className="w-7 text-center text-xl font-black tabular-nums" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(stock, q + 1))}
                    disabled={qty >= stock}
                    aria-label="Aumentar quantidade"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-slate-pale text-slate transition-colors hover:bg-slate hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate"
                  >
                    <Plus size={18} aria-hidden="true" />
                  </button>
                </div>
                <span className="text-[0.6rem] font-bold text-slate-soft">
                  {stock <= 3 ? `só restam ${stock}` : `máx. ${stock}`}
                </span>
              </div>

              <div className="rounded-2xl bg-slate-pale p-4 text-sm font-bold text-slate-mid">
                <span className="text-slate-soft">Total: </span>
                <span className="text-lg font-black text-blue italic tabular-nums">
                  {fmt(effective * qty)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  onAdd(product, qty);
                  onClose();
                }}
                className="btn-primary w-full rounded-[1.5rem] py-5 text-[0.8rem]"
              >
                + Adicionar à Sacola
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm leading-relaxed font-bold text-rose-dark italic">
                🌸 Esse produto está esgotado, mas logo teremos mais. Quer ser avisada assim que
                chegar?
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNotifyRequest(product);
                }}
                className="w-full rounded-[1.5rem] bg-rose py-5 text-[0.75rem] font-black tracking-widest text-white uppercase shadow-xl shadow-rose/20 transition-transform active:scale-[0.98]"
              >
                🔔 Me Avise quando chegar
              </button>
            </div>
          )}
        </div>

        {/* ── Avaliações ──────────────────────────────────────────── */}
        <section className="border-t-2 border-slate-pale pt-8" aria-labelledby="reviews-title">
          <h3 id="reviews-title" className="mb-6 text-xl font-black text-slate italic">
            Feedbacks 💬
          </h3>

          <div className="mb-8 flex flex-col items-center gap-6 rounded-[1.5rem] border border-slate-pale bg-slate-pale/50 p-5 sm:flex-row sm:p-6">
            <div className="text-center">
              <p className="mb-1 text-4xl font-black text-slate italic tabular-nums">
                {rating.toFixed(1)}
              </p>
              <StarRow value={rating} size={14} />
              <p className="mt-2 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase">
                {comments.length} {comments.length === 1 ? 'avaliação' : 'avaliações'}
              </p>
            </div>
            <ul className="w-full flex-1 space-y-2">
              {distribution.map((row) => (
                <li key={row.star} className="flex items-center gap-3">
                  <span className="w-6 text-[0.6rem] font-black text-slate-soft tabular-nums">
                    {row.star}★
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full border border-slate-pale bg-white">
                    <span
                      className="block h-full rounded-full bg-amber-400 transition-[width] duration-500"
                      style={{ width: `${row.percent}%` }}
                    />
                  </span>
                  <span className="w-5 text-right text-[0.6rem] font-bold text-slate-soft/60 tabular-nums">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Formulário */}
          <form
            className="mb-8 rounded-[1.5rem] border border-slate-pale bg-slate-pale p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submitReview();
            }}
          >
            <div className="mb-4 flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="review-name" className="sr-only">
                  Seu nome
                </label>
                <input
                  id="review-name"
                  className="input-style"
                  placeholder="Seu Nome"
                  maxLength={LIMITS.userName}
                  autoComplete="name"
                  value={draft.user}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, user: sanitizeText(event.target.value, LIMITS.userName) }))
                  }
                />
              </div>

              <fieldset className="rounded-2xl border-2 border-slate-pale bg-white px-4 py-2.5">
                <legend className="sr-only">Quantas estrelas você dá</legend>
                <div className="flex items-center gap-2">
                  <span className="text-[0.6rem] font-black tracking-widest text-slate-soft uppercase">
                    Nota
                  </span>
                  <div className="flex gap-1" role="radiogroup" aria-label="Estrelas">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={draft.stars === star}
                        aria-label={`${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                        onClick={() => setDraft((d) => ({ ...d, stars: star }))}
                        className="rounded p-0.5 transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
                      >
                        <Star
                          size={18}
                          fill={star <= draft.stars ? '#facc15' : 'none'}
                          color={star <= draft.stars ? '#facc15' : '#e2e8f0'}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </fieldset>
            </div>

            {/* Honeypot: invisível para humanos, irresistível para robôs. */}
            <div aria-hidden="true" className="hidden">
              <label htmlFor="review-website">Não preencha este campo</label>
              <input
                id="review-website"
                tabIndex={-1}
                autoComplete="off"
                value={draft.website}
                onChange={(event) => setDraft((d) => ({ ...d, website: event.target.value }))}
              />
            </div>

            <label htmlFor="review-text" className="sr-only">
              Sua avaliação
            </label>
            <textarea
              id="review-text"
              className="input-style mb-3 h-24 resize-none"
              placeholder="O que você achou deste produto?"
              maxLength={LIMITS.comment}
              value={draft.text}
              onChange={(event) =>
                setDraft((d) => ({ ...d, text: sanitizeText(event.target.value, LIMITS.comment) }))
              }
            />
            <div className="mb-3 flex justify-between text-[0.55rem] font-bold text-slate-soft/60">
              <span>Sem palavrões nem links — avaliações com propaganda são removidas.</span>
              <span className="tabular-nums">
                {Array.from(draft.text).length}/{LIMITS.comment}
              </span>
            </div>
            <button
              type="submit"
              disabled={submitting || draft.user.trim().length < 2 || draft.text.trim().length < 3}
              className="w-full rounded-2xl bg-blue py-3.5 text-[0.7rem] font-black tracking-widest text-white uppercase shadow-lg shadow-blue/20 transition-colors hover:bg-slate disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Publicando…' : 'Publicar Avaliação'}
            </button>
          </form>

          {/* Lista */}
          {comments.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-soft italic">
              Seja a primeira pessoa a avaliar! ✨
            </p>
          ) : (
            <ul className="space-y-6">
              {comments.map((comment, index) => (
                <li
                  key={comment.id || `${comment.user}-${index}`}
                  className="border-b-2 border-slate-pale pb-5 last:border-0"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="truncate text-[0.7rem] font-black text-slate uppercase italic">
                      {comment.user}
                    </span>
                    <StarRow value={comment.stars} size={10} />
                  </div>
                  <p className="text-sm leading-relaxed text-slate-mid italic">“{comment.text}”</p>
                  {comment.date && (
                    <span className="mt-3 inline-block rounded bg-slate-soft/5 px-2 py-0.5 text-[0.6rem] font-black text-slate-soft/40 uppercase">
                      {comment.date}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Relacionados ────────────────────────────────────────── */}
        {related.length > 0 && (
          <section className="mt-10 border-t-2 border-slate-pale pt-8" aria-labelledby="related-title">
            <h3 id="related-title" className="mb-6 text-xl font-black text-slate italic">
              Você também pode gostar ✨
            </h3>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {related.map((item) => (
                <li key={item.fid}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="group w-full text-left focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <span className="mb-3 block aspect-square overflow-hidden rounded-2xl bg-slate-pale">
                      <img
                        src={item.image}
                        alt={sanitizeText(item.name, 60)}
                        width={200}
                        height={200}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform motion-safe:group-hover:scale-110"
                      />
                    </span>
                    <span className="line-clamp-1 block text-[0.65rem] font-black text-slate uppercase italic">
                      {sanitizeText(item.name, 60)}
                    </span>
                    <span className="text-xs font-black text-blue italic tabular-nums">
                      {fmt(finalPrice(item.price, item.discountPrice))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
});

/** Linha de estrelas (só apresentação). */
function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span
      className="flex gap-0.5"
      role="img"
      aria-label={`Nota ${Number(value).toFixed(1)} de 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= rounded ? '#facc15' : 'none'}
          color={i <= rounded ? '#facc15' : '#e2e8f0'}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
