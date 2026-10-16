import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Product } from '../../types';
import { cn } from '../../utils/cn';
import { priceOf } from '../../data/store';
import { discountPercent, fmt } from '../../utils/format';
import { sanitizeText } from '../../utils/sanitize';
import { FlashSaleTimer } from '../ui/FlashSaleTimer';

/**
 * Banner principal (carrossel de ofertas).
 *
 * Correções e melhorias:
 *  - A versão anterior acessava `featuredPerfumes[currentBanner]` sem checar o
 *    índice. Quando o catálogo mudava (produto apagado no painel, filtro),
 *    `currentBanner` ficava maior que a lista e a loja quebrava com
 *    "Cannot read properties of undefined". Agora o índice é sempre derivado
 *    com `% length`.
 *  - Autoplay pausa quando: a aba fica escondida, o usuário passa o mouse por
 *    cima, o aparelho está no modo econômico ou o sistema pede menos animação.
 *    Carrossel que roda sozinho sem parar é o motivo nº 1 de CLS alto.
 *  - `aria-roledescription="carousel"` + controles nomeados: quem usa leitor
 *    de tela consegue saber o que é e parar o giro.
 *  - Pré-carrega a próxima imagem para a troca não piscar.
 */

interface HeroBannerProps {
  products: Product[];
  onSelect: (product: Product) => void;
  /** Desliga autoplay/parallax (aparelho fraco ou prefers-reduced-motion). */
  economical?: boolean;
  intervalMs?: number;
}

const SWIPE_THRESHOLD = 40;

export const HeroBanner = memo(function HeroBanner({
  products,
  onSelect,
  economical = false,
  intervalMs = 6000,
}: HeroBannerProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Índice sempre dentro da lista — mesmo se ela encolher.
  const count = products.length;
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0;
  const current = count > 0 ? products[safeIndex] : null;

  const goNext = useCallback(() => {
    setIndex((prev) => (count > 0 ? (prev + 1) % count : 0));
  }, [count]);

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  /* Autoplay */
  useEffect(() => {
    if (count < 2 || paused || economical) return;
    const timer = window.setInterval(goNext, intervalMs);
    return () => window.clearInterval(timer);
  }, [count, paused, economical, goNext, intervalMs]);

  /* Pausa quando a aba está escondida (não gasta bateria à toa) */
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /* Pré-carrega a próxima foto para a transição não piscar */
  useEffect(() => {
    if (count < 2) return;
    const next = products[(safeIndex + 1) % count];
    if (!next?.image) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = next.image;
  }, [safeIndex, count, products]);

  /* Arrastar no celular troca de oferta */
  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const delta = (event.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    goTo(safeIndex + (delta < 0 ? 1 : -1));
  };

  if (!current) return null;

  const price = priceOf(current);
  const full = Number(current.price) || 0;
  const off = discountPercent(full, current.discountPrice);
  const hasPromo = off > 0;
  const name = sanitizeText(current.name, 60);

  return (
    <section
      className="group relative mb-10 h-[340px] overflow-hidden rounded-[2rem] shadow-lg md:mb-12 md:h-[500px] md:rounded-[2.5rem]"
      aria-roledescription="carrossel"
      aria-label="Ofertas em destaque"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current.fid ?? safeIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: economical ? 0 : 0.45 }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0 z-10 bg-gradient-to-r from-slate via-slate/70 to-transparent" />
          {current.image && (
            <img
              src={current.image}
              alt={name}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          )}

          <div className="absolute inset-0 z-20 flex flex-col justify-center px-6 sm:px-10 md:px-20">
            <div className="max-w-2xl">
              <div className="mb-4 flex flex-wrap items-center gap-3 sm:mb-6 sm:gap-4">
                <span className="inline-block rounded-full bg-rose px-3 py-1.5 text-[0.55rem] font-black tracking-[0.25em] text-white uppercase shadow-lg shadow-rose/20 italic sm:px-4 sm:text-[0.65rem] sm:tracking-[0.3em]">
                  🔥 Oferta Imperdível
                </span>
                <FlashSaleTimer compact />
              </div>

              <h2 className="mb-3 text-3xl leading-[1.05] font-black text-white italic drop-shadow-2xl sm:mb-4 md:text-6xl lg:text-7xl">
                {name}
              </h2>

              <div className="mb-6 flex flex-wrap items-center gap-3 sm:gap-4 md:mb-8">
                <div className="flex flex-col">
                  {hasPromo && (
                    <span className="text-base font-bold text-white/40 line-through sm:text-lg">
                      De: {fmt(full)}
                    </span>
                  )}
                  <span className="text-3xl font-black text-white italic sm:text-4xl md:text-5xl">
                    {hasPromo ? 'Por: ' : ''}
                    {fmt(price)}
                  </span>
                </div>
                {hasPromo && (
                  <span className="rounded-2xl bg-white px-3 py-2 text-lg font-black text-slate shadow-xl italic md:px-4 md:text-xl">
                    −{off}%
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSelect(current)}
                className="rounded-2xl bg-white px-6 py-4 text-[0.65rem] font-black tracking-[0.2em] text-slate uppercase shadow-2xl transition-colors hover:bg-rose hover:text-white active:scale-95 sm:px-10 sm:py-5 sm:text-[0.8rem]"
              >
                Aproveitar Agora ✨
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Indicadores + controle do autoplay */}
      {count > 1 && (
        <div className="absolute right-4 bottom-4 z-30 flex items-center gap-3 sm:right-10 sm:bottom-10">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30"
            aria-label={paused ? 'Retomar rotação das ofertas' : 'Pausar rotação das ofertas'}
            aria-pressed={paused}
          >
            <span className="text-xs" aria-hidden="true">
              {paused ? '▶' : '❚❚'}
            </span>
          </button>
          <div className="flex gap-2" role="tablist" aria-label="Escolher oferta">
            {products.map((product, idx) => (
              <button
                key={product.fid ?? idx}
                type="button"
                role="tab"
                aria-selected={idx === safeIndex}
                aria-label={`Oferta ${idx + 1} de ${count}: ${sanitizeText(product.name, 40)}`}
                onClick={() => goTo(idx)}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-500',
                  idx === safeIndex ? 'w-10 bg-white' : 'w-4 bg-white/30 hover:bg-white/60'
                )}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
});
