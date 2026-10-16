import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react';
import type { SortMode } from '../../types';
import { CATEGORIES, SITE } from '../../config/site';
import { cn } from '../../utils/cn';
import { LIMITS, sanitizeText } from '../../utils/sanitize';

/**
 * Busca, categorias e ordenação.
 *
 * Melhorias:
 *  - Busca com debounce (250 ms): antes, cada tecla re-filtrava e re-renderizava
 *    a grade inteira. Em celular com 40 produtos isso era visível.
 *  - As categorias são links `<a href="?categoria=…">` de verdade. Assim o
 *    Google indexa cada categoria como uma página (é o que está no sitemap) e
 *    o visitante pode copiar/compartilhar a URL da seção.
 *  - `<label>` associado ao campo de busca + `role="search"`: acessibilidade e
 *    semântica que antes não existiam (o placeholder era a única dica).
 *  - Filtros rápidos (só promoção / só disponível / favoritos) com estado na
 *    URL, então a página volta igual ao recarregar.
 */

interface CatalogControlsProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  sort: SortMode;
  onSortChange: (value: SortMode) => void;
  promoOnly: boolean;
  onPromoOnlyChange: (value: boolean) => void;
  availableOnly: boolean;
  onAvailableOnlyChange: (value: boolean) => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (value: boolean) => void;
  favoritesCount: number;
  totalResults: number;
  totalProducts: number;
  /** Abre o campo de busca quando acionado pela lupa da navbar. */
  openSignal: number;
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'newest', label: 'Lançamentos' },
  { value: 'price-asc', label: 'Menor preço' },
  { value: 'price-desc', label: 'Maior preço' },
  { value: 'rating', label: 'Melhor avaliados' },
];

export const CatalogControls = memo(function CatalogControls({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  promoOnly,
  onPromoOnlyChange,
  availableOnly,
  onAvailableOnlyChange,
  favoritesOnly,
  onFavoritesOnlyChange,
  favoritesCount,
  totalResults,
  totalProducts,
  openSignal,
}: CatalogControlsProps) {
  const [draft, setDraft] = useState(search);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Mantém o rascunho em sincronia quando a busca é limpa por fora.
  useEffect(() => {
    setDraft(search);
  }, [search]);

  // Debounce: só propaga a busca depois que a pessoa parar de digitar.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (draft !== search) onSearchChange(draft);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [draft, search, onSearchChange]);

  // A lupa da navbar abre e foca o campo.
  useEffect(() => {
    if (openSignal === 0) return;
    setShowFilters(true);
    // Espera o campo existir no DOM antes de focar.
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [openSignal]);

  const clearSearch = useCallback(() => {
    setDraft('');
    onSearchChange('');
    inputRef.current?.focus();
  }, [onSearchChange]);

  const hasActiveFilters = Boolean(promoOnly || availableOnly || favoritesOnly || search);

  const clearFilters = useCallback(() => {
    setDraft('');
    onSearchChange('');
    onPromoOnlyChange(false);
    onAvailableOnlyChange(false);
    onFavoritesOnlyChange(false);
    onCategoryChange('todos');
  }, [
    onSearchChange,
    onPromoOnlyChange,
    onAvailableOnlyChange,
    onFavoritesOnlyChange,
    onCategoryChange,
  ]);

  return (
    <section className="mb-8 space-y-4 md:mb-10 md:space-y-6" aria-label="Buscar e filtrar produtos">
      {/* ── Busca ─────────────────────────────────────────────────── */}
      <div role="search" className="group relative">
        <label htmlFor="catalog-search" className="sr-only">
          Buscar produtos na {SITE.name}
        </label>
        <Search
          size={20}
          strokeWidth={2.5}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-slate-soft md:left-6"
        />
        <input
          id="catalog-search"
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="O que você está procurando hoje? ✨"
          maxLength={LIMITS.search}
          className="w-full rounded-3xl border-2 border-slate-pale bg-white py-4 pr-12 pl-14 font-bold text-slate shadow-sm transition-shadow outline-none placeholder:text-slate-soft/50 group-hover:shadow-md focus:border-blue/30 md:py-5 md:pr-14"
          value={draft}
          onChange={(event) => setDraft(sanitizeText(event.target.value, LIMITS.search))}
          onKeyDown={(event) => {
            if (event.key === 'Escape') clearSearch();
            if (event.key === 'Enter') onSearchChange(draft);
          }}
        />
        {draft && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute top-1/2 right-5 -translate-y-1/2 rounded-full p-1 text-slate-soft transition-colors hover:text-rose focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none md:right-6"
            aria-label="Limpar busca"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── Categorias ────────────────────────────────────────────── */}
      <nav aria-label="Categorias de produtos">
        <ul className="scrollbar-hide -mx-1 flex w-full gap-2.5 overflow-x-auto px-1 pb-2 md:gap-3">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            const href = cat.id === 'todos' ? './' : `./?categoria=${encodeURIComponent(cat.id)}`;
            return (
              <li key={cat.id} className="shrink-0">
                <a
                  href={href}
                  onClick={(event) => {
                    // Navegação interna sem recarregar a página.
                    event.preventDefault();
                    onCategoryChange(cat.id);
                  }}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-2xl border-2 border-slate-pale bg-white px-4 py-3 text-[0.6rem] font-black tracking-widest whitespace-nowrap text-slate-soft uppercase transition-colors md:px-6 md:text-[0.65rem]',
                    'focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:outline-none',
                    active && 'border-rose bg-rose text-white shadow-lg shadow-rose/20'
                  )}
                >
                  <span aria-hidden="true">{cat.icon}</span>
                  {cat.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Ordenação + filtros rápidos ───────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-full items-center gap-2 rounded-2xl border-2 border-slate-pale bg-white p-1.5 sm:w-auto">
          <span className="pl-3 text-slate-soft" aria-hidden="true">
            <ArrowUpDown size={14} />
          </span>
          <label htmlFor="catalog-sort" className="sr-only">
            Ordenar produtos por
          </label>
          <select
            id="catalog-sort"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortMode)}
            className="w-full cursor-pointer bg-transparent pr-4 py-2 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase outline-none sm:w-auto"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="catalog-filters"
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-pale bg-white px-4 py-3 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase transition-colors hover:text-blue sm:hidden"
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filtros
          {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-rose" aria-hidden="true" />}
        </button>

        <div
          id="catalog-filters"
          className={cn(
            'flex-wrap items-center gap-2',
            showFilters ? 'flex' : 'hidden sm:flex'
          )}
        >
          <FilterChip
            active={promoOnly}
            onClick={() => onPromoOnlyChange(!promoOnly)}
            label="🔥 Em promoção"
          />
          <FilterChip
            active={availableOnly}
            onClick={() => onAvailableOnlyChange(!availableOnly)}
            label="✔ Disponível"
          />
          <FilterChip
            active={favoritesOnly}
            onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
            label={`💖 Favoritos${favoritesCount > 0 ? ` (${favoritesCount})` : ''}`}
            disabled={favoritesCount === 0}
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full px-3 py-2 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase underline decoration-dotted transition-colors hover:text-rose"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Contagem (também serve de feedback para leitor de tela) ── */}
      <p className="text-[0.65rem] font-bold tracking-wider text-slate-soft uppercase" aria-live="polite">
        {totalResults === totalProducts
          ? `${totalProducts} ${totalProducts === 1 ? 'produto' : 'produtos'}`
          : `${totalResults} de ${totalProducts} ${totalProducts === 1 ? 'produto' : 'produtos'}`}
      </p>
    </section>
  );
});

function FilterChip({
  active,
  onClick,
  label,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'rounded-full border-2 px-4 py-2 text-[0.6rem] font-black tracking-widest whitespace-nowrap uppercase transition-colors',
        'focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-1 focus-visible:outline-none',
        active
          ? 'border-slate bg-slate text-white'
          : 'border-slate-pale bg-white text-slate-soft hover:border-blue-light hover:text-blue',
        disabled && 'cursor-not-allowed opacity-40 hover:border-slate-pale hover:text-slate-soft'
      )}
    >
      {label}
    </button>
  );
}
