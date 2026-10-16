import { memo, useCallback, useState } from 'react';
import { Heart, Minus, Plus, Star } from 'lucide-react';
import type { Product } from '../../types';
import { cn } from '../../utils/cn';
import { discountPercent, finalPrice, fmt, isNewerThan } from '../../utils/format';
import { LIMITS, sanitizeText } from '../../utils/sanitize';
import { ellipsis } from '../../utils/format';

/**
 * Card de produto da vitrine.
 *
 * Melhorias aplicadas:
 *  - `React.memo` + callbacks estáveis: com 40 produtos na tela, digitar na
 *    busca deixava de re-renderizar os 40 cards a cada tecla.
 *  - `loading="lazy"` / `decoding="async"` nas fotos: o navegador só baixa o
 *    que está perto da viewport (as fotos são base64 pesadas vindas do
 *    Firestore, então isso é o que mais economiza dados no celular).
 *  - `width`/`height` + `aspect-ratio`: reserva o espaço da imagem e zera o
 *    CLS do card.
 *  - Microdata `schema.org/Product` com preço e disponibilidade: é o que
 *    permite rich snippet na busca, mesmo dentro de uma SPA.
 *  - `prefers-reduced-motion` desliga o zoom da foto no hover.
 *  - Nome/descrição passam por `sanitizeText` antes de ir para a tela.
 */

interface ProductCardProps {
  product: Product;
  isFavorite: boolean;
  /** Índice na grade; usado para priorizar o carregamento das primeiras fotos. */
  index?: number;
  onDetail: (product: Product) => void;
  onAdd: (product: Product, qty: number) => void;
  onNotify: (product: Product) => void;
  onToggleFavorite: (product: Product) => void;
}

function ProductCardBase({
  product,
  isFavorite,
  index = 0,
  onDetail,
  onAdd,
  onNotify,
  onToggleFavorite,
}: ProductCardProps) {
  const [qty, setQty] = useState(1);

  const price = Number(product.price) || 0;
  const promo = Number(product.discountPrice) || 0;
  const isPromo = promo > 0 && promo < price;
  const off = discountPercent(price, promo);
  const effective = finalPrice(price, promo);
  const stock = Math.max(0, Math.round(Number(product.stock) || 0));
  const soldOut = stock <= 0;
  const rating = Number(product.rating) || 5;
  const name = sanitizeText(product.name, LIMITS.name);
  const isNew = !isPromo && isNewerThan(product.createdAt, 7);

  // As 5 primeiras fotos carregam com prioridade; o resto, sob demanda.
  const eager = index < 5;

  const handleDetail = useCallback(() => onDetail(product), [onDetail, product]);
  const handleAdd = useCallback(() => {
    onAdd(product, qty);
    setQty(1);
  }, [onAdd, product, qty]);
  const handleNotify = useCallback(() => onNotify(product), [onNotify, product]);
  const handleFavorite = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onToggleFavorite(product);
    },
    [onToggleFavorite, product]
  );
  const decrease = useCallback(() => setQty((q) => Math.max(1, q - 1)), []);
  const increase = useCallback(() => setQty((q) => Math.min(Math.max(1, stock), q + 1)), [stock]);

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-[1.5rem] border border-slate-pale bg-white shadow-sm transition-colors hover:border-blue/20"
      itemScope
      itemType="https://schema.org/Product"
    >
      <meta itemProp="sku" content={product.fid ?? ''} />
      <meta itemProp="brand" content="Chelly Shop" />

      {/* ── Foto ─────────────────────────────────────────────────── */}
      <div
        className="relative aspect-[4/5] cursor-pointer overflow-hidden bg-slate-pale"
        onClick={handleDetail}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleDetail();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Ver detalhes de ${name || 'produto'}`}
      >
        {isPromo && (
          <span className="animate-pulse-discount absolute top-3 left-3 z-10 rounded-full bg-gradient-to-br from-rose to-rose-dark px-3 py-1 text-[0.6rem] font-black tracking-widest text-white shadow-lg">
            🔥 {off}% OFF
          </span>
        )}
        {isNew && (
          <span className="absolute top-3 left-3 z-10 rounded-full bg-blue px-3 py-1 text-[0.6rem] font-black tracking-widest text-white shadow-lg">
            ✨ NOVO
          </span>
        )}

        <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
          <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[0.65rem] font-black shadow-sm backdrop-blur-md">
            <Star size={10} fill="#facc15" color="#facc15" aria-hidden="true" />
            <span itemProp="aggregateRating" itemScope itemType="https://schema.org/AggregateRating">
              <span itemProp="ratingValue">{rating.toFixed(1)}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={handleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remover ${name} dos favoritos` : `Adicionar ${name} aos favoritos`}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full shadow-lg transition-all',
              'focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-1 focus-visible:outline-none',
              isFavorite ? 'bg-rose text-white' : 'bg-white/90 text-slate-soft hover:text-rose'
            )}
          >
            <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </div>

        {product.image ? (
          <img
            src={product.image}
            alt={name}
            itemProp="image"
            width={400}
            height={500}
            loading={eager ? 'eager' : 'lazy'}
            decoding={eager ? 'sync' : 'async'}
            fetchPriority={eager ? 'high' : 'auto'}
            className="motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-110 h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-4xl text-slate-soft/30"
            aria-hidden="true"
          >
            ✨
          </div>
        )}

        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate/60 p-6 text-center backdrop-blur-[2px]">
            <div>
              <div className="mb-1 text-lg font-black italic leading-tight text-white">Esgotado!</div>
              <div className="text-[0.6rem] font-bold uppercase tracking-widest text-rose-light">
                Em breve mais unidades
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Informações ──────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-4 text-center md:p-5">
        <h3
          itemProp="name"
          className="mb-2 line-clamp-2 min-h-[2.5rem] text-sm leading-tight font-black italic text-slate md:text-base"
        >
          {name || 'Produto'}
        </h3>

        <div className="mb-3">
          <link
            itemProp="availability"
            href={
              soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock'
            }
          />
          {soldOut ? (
            <span className="inline-block rounded-full border border-rose-light bg-rose-light/50 px-3 py-1 text-[0.55rem] font-black uppercase tracking-widest text-rose-dark">
              ✗ Esgotado
            </span>
          ) : stock <= 3 ? (
            <span className="inline-block rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[0.55rem] font-black uppercase tracking-widest text-amber-700">
              ⚡ Últimas {stock} un.
            </span>
          ) : (
            <span className="inline-block rounded-full border border-green-100 bg-green-50 px-3 py-1 text-[0.55rem] font-black uppercase tracking-widest text-green-700">
              ✔ Disponível
            </span>
          )}
        </div>

        <div className="mb-4 flex items-center justify-center gap-2">
          {isPromo && (
            <span className="text-xs font-bold text-slate-soft line-through">{fmt(price)}</span>
          )}
          <span
            className="text-lg font-black italic text-blue md:text-xl"
            itemProp="offers"
            itemScope
            itemType="https://schema.org/Offer"
          >
            <meta itemProp="priceCurrency" content="BRL" />
            <meta itemProp="price" content={effective.toFixed(2)} />
            {fmt(effective)}
          </span>
        </div>

        {product.description && (
          <p itemProp="description" className="sr-only">
            {ellipsis(sanitizeText(product.description, LIMITS.description), 160)}
          </p>
        )}

        <div className="mt-auto space-y-2">
          {soldOut ? (
            <button
              type="button"
              onClick={handleNotify}
              className="w-full rounded-xl border border-rose-200 bg-rose-light py-3 text-[0.6rem] font-black uppercase tracking-[0.2em] text-rose-dark transition-colors hover:bg-rose-200"
            >
              🔔 Me Avise
            </button>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={decrease}
                  disabled={qty <= 1}
                  aria-label="Diminuir quantidade"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-pale text-slate transition-colors hover:bg-slate hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate"
                >
                  <Minus size={12} aria-hidden="true" />
                </button>
                <span className="w-6 text-sm font-black tabular-nums" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={increase}
                  disabled={qty >= stock}
                  aria-label="Aumentar quantidade"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-pale text-slate transition-colors hover:bg-slate hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate"
                >
                  <Plus size={12} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                className="w-full rounded-xl bg-slate py-3 text-[0.6rem] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-blue focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                + Adicionar
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export const ProductCard = memo(ProductCardBase);
