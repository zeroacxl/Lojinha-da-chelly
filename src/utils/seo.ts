/**
 * SEO: metadados do documento + dados estruturados (JSON-LD).
 *
 * A loja é uma SPA, então o Google renderiza o JavaScript — mas quem decide o
 * que aparece no resultado da busca é o HTML inicial. Por isso:
 *   1. `index.html` já nasce com title, description, canonical, Open Graph,
 *      Twitter Card e o JSON-LD da loja (o robô lê sem executar JS);
 *   2. este módulo ATUALIZA essas tags quando o usuário abre um produto ou
 *      troca de categoria — assim cada tela tem título/descrição próprios,
 *      que é o que gera clique em busca.
 *
 * Nenhuma função aqui escreve HTML de usuário sem escapar: o JSON-LD é
 * montado com `JSON.stringify` e o resultado tem `<` escapado, evitando que
 * um nome de produto malicioso feche a tag `<script>`.
 */

import { SITE, SITE_URL } from '../config/site';
import type { Product } from '../types';
import { ellipsis, finalPrice, fmt } from './format';
import { sanitizeCategory, sanitizeText } from './sanitize';

/* ------------------------------------------------------------------ *
 * Helpers de DOM
 * ------------------------------------------------------------------ */

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string): void {
  if (!href) return;
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setTitle(title: string): void {
  if (title) document.title = title;
}

/** Remove `<` para não permitir fuga da tag script dentro do JSON-LD. */
function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function upsertJsonLd(id: string, data: unknown): void {
  const scriptId = `ld-${id}`;
  let el = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = scriptId;
    document.head.appendChild(el);
  }
  el.textContent = safeJsonLd(data);
}

function removeJsonLd(id: string): void {
  document.getElementById(`ld-${id}`)?.remove();
}

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

/** Organização/loja — aparece no painel de conhecimento do Google. */
export function storeSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': ['Store', 'OnlineBusiness'],
    '@id': `${SITE_URL}/#store`,
    name: SITE.name,
    description: SITE.description,
    url: SITE_URL,
    image: `${SITE_URL}/icons/pwa-512x512.png`,
    logo: `${SITE_URL}/icons/favicon.svg`,
    priceRange: '$$',
    currenciesAccepted: 'BRL',
    paymentAccepted: 'Pix, WhatsApp',
    areaServed: {
      '@type': 'City',
      name: SITE.address.city,
      address: {
        '@type': 'PostalAddress',
        addressLocality: SITE.address.city,
        addressRegion: SITE.address.state,
        addressCountry: SITE.address.country,
      },
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: SITE.address.city,
      addressRegion: SITE.address.state,
      addressCountry: SITE.address.country,
    },
    availableLanguage: 'pt-BR',
  };
}

/** Página inicial — ajuda o Google a entender a hierarquia do site. */
export function websiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE.title,
    description: SITE.description,
    inLanguage: SITE.language,
    publisher: { '@id': `${SITE_URL}/#store` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Lista de produtos — pode gerar rich results com preço e nota. */
export function productListSchema(products: Product[]): Record<string, unknown> | null {
  if (!products.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE_URL}/#catalog`,
    name: `Catálogo ${SITE.name}`,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 60).map((p, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/?produto=${encodeURIComponent(p.fid ?? '')}`,
      name: sanitizeText(p.name, 80),
    })),
  };
}

/** Produto individual — alimenta rich snippet de preço/disponibilidade/nota. */
export function productSchema(product: Product): Record<string, unknown> | null {
  if (!product?.name) return null;
  const price = finalPrice(product.price, product.discountPrice);
  const stock = Number(product.stock) || 0;
  const comments = Array.isArray(product.comments) ? product.comments : [];
  const ratingValue = Number(product.rating) || 0;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${SITE_URL}/?produto=${encodeURIComponent(product.fid ?? '')}#product`,
    name: sanitizeText(product.name, 80),
    description: sanitizeText(product.description || SITE.description, 300),
    image: product.image ? [product.image] : [`${SITE_URL}/icons/pwa-512x512.png`],
    brand: { '@type': 'Brand', name: SITE.name },
    category: sanitizeCategory(product.category, ['perfumes', 'skincare', 'make', 'cabelo', 'corpo']),
    sku: product.fid || undefined,
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/?produto=${encodeURIComponent(product.fid ?? '')}`,
      priceCurrency: 'BRL',
      price: price.toFixed(2),
      priceValidUntil: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${SITE_URL}/#store` },
    },
    ...(ratingValue > 0 && comments.length > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: ratingValue.toFixed(1),
            reviewCount: comments.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/** Breadcrumb — aparece como trilha clicável no resultado da busca. */
export function breadcrumbSchema(trail: { name: string; url: string }[]): Record<string, unknown> | null {
  if (!trail.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: sanitizeText(item.name, 60),
      item: item.url,
    })),
  };
}

/** Escreve (ou remove) a trilha de navegação no head. */
export function upsertBreadcrumb(trail: { name: string; url: string }[]): void {
  const schema = breadcrumbSchema(trail);
  if (schema) upsertJsonLd('breadcrumb', schema);
  else removeJsonLd('breadcrumb');
}

/* ------------------------------------------------------------------ *
 * Aplicação no documento
 * ------------------------------------------------------------------ */

export interface SeoState {
  title: string;
  description: string;
  canonical: string;
  image?: string;
}

/** Escreve title/description/canonical/OG/Twitter de uma vez. */
export function applySeo({ title, description, canonical, image }: SeoState): void {
  const safeTitle = sanitizeText(title, 70) || SITE.title;
  const safeDescription = sanitizeText(description, 165) || SITE.description;
  const url = canonical || SITE_URL;
  const img = image || `${SITE_URL}/icons/pwa-512x512.png`;

  setTitle(safeTitle);
  setMeta('meta[name="description"]', 'name', 'description', safeDescription);
  setMeta('meta[property="og:title"]', 'property', 'og:title', safeTitle);
  setMeta('meta[property="og:description"]', 'property', 'og:description', safeDescription);
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);
  setMeta('meta[property="og:image"]', 'property', 'og:image', img);
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', safeTitle);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', safeDescription);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', img);
  setLink('canonical', url);
}

/** SEO da vitrine (estado padrão). */
export function applyHomeSeo(products: Product[] = []): void {
  const cheapest = products.length
    ? Math.min(...products.map((p) => finalPrice(p.price, p.discountPrice)))
    : 0;
  const extra =
    products.length > 0
      ? ` ${products.length} produtos disponíveis${cheapest > 0 ? ` a partir de ${fmt(cheapest)}` : ''}.`
      : '';

  applySeo({
    title: SITE.title,
    description: `${SITE.description}${extra}`.slice(0, 165),
    canonical: SITE_URL,
  });

  upsertJsonLd('store', storeSchema());
  upsertJsonLd('website', websiteSchema());

  const list = productListSchema(products);
  if (list) upsertJsonLd('catalog', list);
  else removeJsonLd('catalog');

  upsertJsonLd(
    'breadcrumb',
    breadcrumbSchema([
      { name: 'Início', url: SITE_URL },
      { name: 'Catálogo', url: `${SITE_URL}/#catalogo` },
    ])
  );
}

/** SEO de um produto aberto no modal — gera URL própria e rich snippet. */
export function applyProductSeo(product: Product): void {
  const name = sanitizeText(product.name, 60);
  const price = finalPrice(product.price, product.discountPrice);
  const url = `${SITE_URL}/?produto=${encodeURIComponent(product.fid ?? '')}`;
  applySeo({
    title: `${name} — ${fmt(price)} | ${SITE.name}`,
    description: ellipsis(
      sanitizeText(product.description, 200) ||
        `${name} por ${fmt(price)} na ${SITE.name}, com entrega em ${SITE.address.city} - ${SITE.address.state}. Pague com Pix ou combine pelo WhatsApp.`,
      160
    ),
    canonical: url,
    image: product.image || undefined,
  });

  const schema = productSchema(product);
  if (schema) upsertJsonLd('product', schema);

  upsertJsonLd(
    'breadcrumb',
    breadcrumbSchema([
      { name: 'Início', url: SITE_URL },
      { name: 'Catálogo', url: `${SITE_URL}/#catalogo` },
      { name: name || 'Produto', url },
    ])
  );
}

/** Volta ao SEO da vitrine ao fechar o modal. */
export function clearProductSeo(): void {
  removeJsonLd('product');
}
