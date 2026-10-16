import { memo } from 'react';
import { cn } from '../../utils/cn';

/**
 * Placeholder com o MESMO tamanho do card real.
 *
 * Isso importa para o CLS (Cumulative Layout Shift): se o esqueleto tem a
 * mesma altura do produto, a página não "pula" quando os dados chegam. CLS
 * alto derruba o Core Web Vitals e, com ele, a posição na busca.
 */
export const SkeletonCard = memo(function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-skeleton flex flex-col overflow-hidden rounded-[1.5rem] border border-slate-pale bg-white shadow-sm',
        className
      )}
      aria-hidden="true"
    >
      <div className="aspect-[4/5] bg-slate-pale" />
      <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">
        <div className="mx-auto h-4 w-3/4 rounded bg-slate-pale" />
        <div className="mx-auto h-3 w-1/2 rounded bg-slate-pale" />
        <div className="mx-auto h-6 w-2/3 rounded bg-slate-pale" />
        <div className="mt-auto h-10 w-full rounded-xl bg-slate-pale" />
      </div>
    </div>
  );
});

/** Grade de esqueletos no formato da vitrine. */
export function SkeletonGrid({ count = 10 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 md:gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      role="status"
      aria-live="polite"
      aria-label="Carregando produtos"
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
