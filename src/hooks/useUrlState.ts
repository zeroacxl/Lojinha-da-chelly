import { useCallback, useEffect, useRef } from 'react';
import type { SortMode } from '../types';

/**
 * Estado da vitrine refletido na URL.
 *
 * Por que isto importa (e antes não existia):
 *  - CADA categoria vira uma URL própria (`/?categoria=perfumes`). O Google
 *    passa a ter páginas diferentes para indexar em vez de uma única SPA, e é
 *    isso que está no sitemap.xml.
 *  - O botão "voltar" do celular volta para a categoria anterior em vez de
 *    fechar a loja inteira (queixa clássica de PWA).
 *  - A cliente pode copiar o link de uma busca e mandar no WhatsApp — o link
 *    abre exatamente na mesma tela.
 *  - Atalhos do ícone do app instalado (`shortcuts` no manifest) funcionam,
 *    porque eles apontam para `/?categoria=…`.
 *
 * Usamos `history.replaceState` ao navegar internamente (não empilha dezenas
 * de entradas) e ouvimos `popstate` para o botão voltar funcionar.
 */

export interface UrlState {
  category: string;
  search: string;
  sort: SortMode;
  product: string;
}

const VALID_SORTS: SortMode[] = ['newest', 'price-asc', 'price-desc', 'rating'];

function readUrl(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get('ordenar') as SortMode | null;
  return {
    category: params.get('categoria') || 'todos',
    search: params.get('q') || '',
    sort: sort && VALID_SORTS.includes(sort) ? sort : 'newest',
    product: params.get('produto') || '',
  };
}

function serialize(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.category && state.category !== 'todos') params.set('categoria', state.category);
  if (state.search) params.set('q', state.search);
  if (state.sort && state.sort !== 'newest') params.set('ordenar', state.sort);
  if (state.product) params.set('produto', state.product);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
}

export function useUrlState(onState: (state: UrlState) => void) {
  const lastSerialized = useRef<string>(serialize(readUrl()));

  /* Botão voltar / avançar do navegador. */
  useEffect(() => {
    const handlePop = () => {
      const state = readUrl();
      lastSerialized.current = serialize(state);
      onState(state);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [onState]);

  /** Escreve o estado na URL sem recarregar a página. */
  const push = useCallback((state: UrlState) => {
    const url = serialize(state);
    if (url === lastSerialized.current) return;
    lastSerialized.current = url;
    try {
      window.history.replaceState(state, '', url);
    } catch {
      /* Some navegadores bloqueiam em sandbox — a loja segue funcionando. */
    }
  }, []);

  return { push, read: readUrl };
}
