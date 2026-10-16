import { memo } from 'react';
import { cn } from '../../utils/cn';

/**
 * Logotipo "sparkle" da Chelly Shop.
 *
 * SVG único com três estrelas em vez de três <svg> empilhados: menos nós no
 * DOM, menos trabalho de layout e um ponto só para mudar o desenho.
 */
export const SparkleLogo = memo(function SparkleLogo({
  className,
  title,
}: {
  className?: string;
  /** Preenchido, o SVG vira imagem acessível; vazio, é decorativo. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('h-full w-full', className)}
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {/* Estrela principal */}
      <path d="M50 4 L58 42 L96 50 L58 58 L50 96 L42 58 L4 50 L42 42 Z" />
      {/* Estrela canto superior direito */}
      <path d="M78 8 L81.5 21 L94.5 24.5 L81.5 28 L78 41 L74.5 28 L61.5 24.5 L74.5 21 Z" opacity="0.8" />
      {/* Estrela canto inferior esquerdo */}
      <path d="M22 59 L25.5 72 L38.5 75.5 L25.5 79 L22 92 L18.5 79 L5.5 75.5 L18.5 72 Z" opacity="0.8" />
    </svg>
  );
});
