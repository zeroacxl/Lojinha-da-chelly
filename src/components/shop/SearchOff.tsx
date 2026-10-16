import { memo } from 'react';

/** Estado vazio da busca: explica o que aconteceu e oferece a saída. */
export const SearchOff = memo(function SearchOff({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <div className="animate-fade-up py-16 text-center md:py-20">
      <div className="mb-6 text-6xl opacity-20" aria-hidden="true">
        🔍
      </div>
      <h3 className="mb-2 text-2xl font-black text-slate italic">Nenhum brilho encontrado</h3>
      <p className="text-sm text-slate-soft italic">
        Tente outro termo, ou limpe os filtros para ver o catálogo completo.
      </p>
      <button
        type="button"
        onClick={onClearFilters}
        className="mt-8 rounded-2xl bg-slate-pale px-8 py-3 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase transition-colors hover:bg-slate hover:text-white focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Limpar todos os filtros
      </button>
    </div>
  );
});
