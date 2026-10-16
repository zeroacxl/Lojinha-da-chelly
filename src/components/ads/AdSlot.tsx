import { memo, useEffect, useRef, useState } from 'react';
import { ADSENSE, adsEnabled } from '../../config/ads';
import { loadAdSense, pushAd } from '../../utils/adsense';
import { cn } from '../../utils/cn';

/**
 * Bloco de anúncio do Google AdSense.
 *
 * Decisões que mantêm a loja rápida e dentro da política do Google:
 *
 *  1. Sem ID de editor configurado -> renderiza `null`. Não reserva espaço,
 *     não cria `<ins>`, não faz requisição. A loja fica idêntica à atual.
 *  2. Carregamento preguiçoso: o script do AdSense só entra quando o bloco
 *     chega perto da viewport (IntersectionObserver). Anúncio fora da tela não
 *     pode atrasar o que o cliente quer ver.
 *  3. Altura fixa + `overflow:hidden`: evita o "pulo" do layout (CLS) quando
 *     o anúncio aparece e impede que um anúncio maior empurre o botão de
 *     comprar para baixo.
 *  4. Nunca é usado dentro do fluxo de pagamento — ver `AdPlacement`.
 *  5. Rótulo "Publicidade": transparência exigida pelo Conar, pela LGPD e
 *     pela própria política do AdSense.
 */

export type AdSlotVariant = 'horizontal' | 'inFeed' | 'rectangle';

/** Alturas reservadas por formato (px). */
const HEIGHTS: Record<AdSlotVariant, { mobile: number; desktop: number }> = {
  horizontal: { mobile: 100, desktop: 90 },
  inFeed: { mobile: 250, desktop: 250 },
  rectangle: { mobile: 280, desktop: 280 },
};

/** Quantidade mínima de blocos que precisam existir para a CSS fazer sentido. */
let styleInjected = false;

/**
 * Injeta UMA vez a regra que adapta a altura reservada em telas grandes.
 * (Ficando em JS, evitamos um <style> por anúncio no DOM.)
 */
function injectResponsiveStyle(): void {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;

  const css = Object.entries(HEIGHTS)
    .map(
      ([variant, h]) =>
        `@media (min-width: 768px){.ad-slot[data-ad-variant="${variant}"]{min-height:${h.desktop}px}}` +
        `.ad-slot[data-ad-variant="${variant}"]{min-height:${h.mobile}px}`
    )
    .join('');

  const style = document.createElement('style');
  style.dataset.chellyAds = 'true';
  style.textContent = css;
  document.head.appendChild(style);
}

export const AdSlot = memo(function AdSlot({
  slot,
  variant = 'horizontal',
  className,
  label = 'Publicidade',
}: {
  /** ID do bloco criado no painel do AdSense. Vazio = anúncio automático. */
  slot?: string;
  variant?: AdSlotVariant;
  className?: string;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const enabled = adsEnabled();
  const height = HEIGHTS[variant];

  /* Observa a aproximação da viewport para só então carregar o anúncio. */
  useEffect(() => {
    if (!enabled || nearViewport) return;
    const node = containerRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true); // navegador antigo: sem otimização
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px 0px' } // dispara 400px antes de aparecer
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, nearViewport]);

  /* Injeta o SDK (uma única vez na página) e pede o preenchimento do bloco. */
  useEffect(() => {
    if (!enabled || !nearViewport || pushed.current) return;
    injectResponsiveStyle();
    let cancelled = false;

    void (async () => {
      const ok = await loadAdSense();
      if (cancelled) return;
      if (!ok) {
        // AdBlock / CSP / sem rede: recolhe o espaço em vez de deixar buraco.
        setCollapsed(!ADSENSE.reserveSpace);
        return;
      }
      if (!insRef.current || pushed.current) return;
      pushed.current = true;
      if (!pushAd()) setCollapsed(!ADSENSE.reserveSpace);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, nearViewport]);

  if (!enabled || collapsed) return null;

  return (
    <div
      ref={containerRef}
      className={cn('ad-slot w-full overflow-hidden', className)}
      data-ad-variant={variant}
      style={{ minHeight: height.mobile }}
    >
      <p className="mb-1 text-center text-[0.5rem] font-bold uppercase tracking-[0.25em] text-slate-soft/50">
        {label}
      </p>
      <ins
        ref={insRef}
        className="adsbygoogle block w-full overflow-hidden"
        style={{ display: 'block', height: height.mobile }}
        data-ad-client={ADSENSE.clientId}
        {...(slot ? { 'data-ad-slot': slot } : {})}
        data-ad-format={ADSENSE.format}
        data-full-width-responsive="true"
      />
    </div>
  );
});

/**
 * Onde os anúncios podem aparecer.
 *
 * `checkout` está de propósito FORA da lista: interromper o pagamento com
 * anúncio derruba a conversão e pode ser interpretado pelo revisor do AdSense
 * como anúncio que interfere na navegação.
 */
export const AdPlacement = {
  /** Logo abaixo da vitrine de destaque. */
  hero: 'hero',
  /** No meio da grade de produtos (a cada N itens). */
  feed: 'feed',
  /** Antes da central de atendimento. */
  footer: 'footer',
} as const;

export type AdPlacementKey = (typeof AdPlacement)[keyof typeof AdPlacement];

/** De quantos em quantos produtos inserir um anúncio na grade. */
export const FEED_AD_INTERVAL = 9;
