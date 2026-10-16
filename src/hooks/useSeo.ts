import { useEffect } from 'react';
import type { Product } from '../types';
import { CATEGORIES, SITE, SITE_URL } from '../config/site';
import { fmt } from '../utils/format';
import { priceOf } from '../data/store';
import {
  applyHomeSeo,
  applyProductSeo,
  applySeo,
  clearProductSeo,
  upsertBreadcrumb,
} from '../utils/seo';

/**
 * Mantém `<title>`, meta description, canonical, Open Graph e JSON-LD em
 * sincronia com o que está na tela.
 *
 * É isto que faz a loja "se destacar nas pesquisas do Google":
 *  - cada categoria ganha título e descrição próprios (quem busca "perfumes em
 *    Rio Branco" cai na aba de perfumes, não numa página genérica);
 *  - cada produto aberto vira uma URL canônica com `schema.org/Product`, o que
 *    habilita rich snippet com preço e nota;
 *  - o catálogo inteiro entra como `ItemList`, ajudando o Google a entender
 *    que existe conteúdo relevante além da home;
 *  - a trilha (BreadcrumbList) aparece como navegação clicável no resultado.
 */

interface UseSeoOptions {
  products: Product[];
  category: string;
  search: string;
  selectedProduct: Product | null;
  loading: boolean;
}

export function useSeo({ products, category, search, selectedProduct, loading }: UseSeoOptions) {
  /* Home / catálogo completo -> JSON-LD de Store, WebSite e ItemList. */
  useEffect(() => {
    if (loading || selectedProduct) return;
    if (category !== 'todos' || search) return;
    applyHomeSeo(products);
  }, [loading, products, category, search, selectedProduct]);

  /* Produto aberto -> schema de produto + canonical própria. */
  useEffect(() => {
    if (!selectedProduct) {
      clearProductSeo();
      return;
    }
    applyProductSeo(selectedProduct);
  }, [selectedProduct]);

  /* Categoria ou busca -> título/descrição específicos + trilha. */
  useEffect(() => {
    if (loading || selectedProduct) return;
    if (category === 'todos' && !search) return;

    const cat = CATEGORIES.find((c) => c.id === category);
    const count = products.length;
    const cheapest = count > 0 ? Math.min(...products.map(priceOf)) : 0;

    const url = new URL(window.location.href);
    url.search = '';
    if (category !== 'todos') url.searchParams.set('categoria', category);
    if (search) url.searchParams.set('q', search);
    const canonical = url.toString();

    const title = search
      ? `Busca por “${search}” — ${SITE.name}`
      : `${cat?.label ?? 'Catálogo'} em ${SITE.address.city} | ${SITE.name}`;

    const description = search
      ? `Resultados para “${search}” na ${SITE.name}: ${count} ${
          count === 1 ? 'produto encontrado' : 'produtos encontrados'
        } com entrega em ${SITE.address.city} - ${SITE.address.state}.`
      : `${cat?.label ?? 'Produtos'} de beleza em ${SITE.address.city} - ${SITE.address.state}. ${
          count > 0 ? `${count} itens disponíveis` : 'Catálogo atualizado em tempo real'
        }${cheapest > 0 ? ` a partir de ${fmt(cheapest)}` : ''}. Peça pelo WhatsApp e pague com Pix.`;

    applySeo({ title, description, canonical });

    upsertBreadcrumb([
      { name: 'Início', url: SITE_URL },
      ...(cat && cat.id !== 'todos' ? [{ name: cat.label, url: canonical }] : []),
      ...(search ? [{ name: `Busca: ${search}`, url: canonical }] : []),
    ]);
  }, [category, search, loading, products, selectedProduct]);

  /* Título chamativo quando a aba perde o foco.
     Não atrapalha SEO: o robô lê o HTML estático, não o título em runtime. */
  useEffect(() => {
    let base = '';

    const onVisibility = () => {
      if (document.hidden) {
        base = document.title;
        document.title = '💖 Volta aqui! Sua sacola está te esperando';
      } else if (base) {
        document.title = base;
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (base) document.title = base;
    };
  }, []);
}
