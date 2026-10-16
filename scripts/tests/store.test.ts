import test from 'node:test';
import assert from 'node:assert/strict';
import type { Product } from '../../src/types';

import * as ST from '../../src/data/store.ts';

/** Fábrica de produto para não repetir objeto em cada teste. */
const product = (overrides: Partial<Product> = {}): Product => ({
  fid: 'p1',
  name: 'Essência Baunilha',
  price: 100,
  discountPrice: null,
  stock: 10,
  category: 'perfumes',
  description: 'Fixação longa',
  image: 'data:image/webp;base64,AAA',
  rating: 5,
  comments: [],
  createdAt: null,
  ...overrides,
});

/* ── Normalização de documento ─────────────────────────────────────── */

test('normalizeProduct garante campos utilizáveis a partir de documento vazio', () => {
  const p = ST.normalizeProduct('abc', {});
  assert.equal(p.fid, 'abc');
  assert.equal(p.name, 'Produto sem nome');
  assert.equal(p.price, 0);
  assert.equal(p.discountPrice, null);
  assert.equal(p.stock, 0);
  assert.equal(p.rating, 5);
  assert.deepEqual(p.comments, []);
  assert.equal(typeof p.category, 'string');
});

test('normalizeProduct sanitiza texto vindo do banco', () => {
  const p = ST.normalizeProduct('abc', {
    name: '<script>alert(1)</script>Perfume',
    description: '<b>doce</b>',
  });
  assert.ok(!p.name.includes('<'));
  assert.ok(!p.description.includes('<'));
  assert.equal(p.name, 'alert(1)Perfume');
});

test('normalizeProduct descarta promoção inválida', () => {
  assert.equal(ST.normalizeProduct('a', { price: 100, discountPrice: 150 }).discountPrice, null);
  assert.equal(ST.normalizeProduct('a', { price: 100, discountPrice: 100 }).discountPrice, null);
  assert.equal(ST.normalizeProduct('a', { price: 100, discountPrice: 0 }).discountPrice, null);
  assert.equal(ST.normalizeProduct('a', { price: 100, discountPrice: -20 }).discountPrice, null);
  assert.equal(ST.normalizeProduct('a', { price: 100, discountPrice: 75 }).discountPrice, 75);
});

test('normalizeProduct não aceita estoque negativo nem fracionado', () => {
  assert.equal(ST.normalizeProduct('a', { stock: -5 }).stock, 0);
  assert.equal(ST.normalizeProduct('a', { stock: 3.7 }).stock, 4);
  assert.equal(ST.normalizeProduct('a', { stock: 'abc' }).stock, 0);
});

test('normalizeProduct corrige categoria desconhecida', () => {
  assert.equal(ST.normalizeProduct('a', { category: 'xyz' }).category, 'perfumes');
  assert.equal(ST.normalizeProduct('a', { category: 'make' }).category, 'make');
});

test('normalizeProduct filtra comentário inválido e limita estrelas', () => {
  const p = ST.normalizeProduct('a', {
    comments: [
      { id: 1, user: 'Maria', text: 'Amei', stars: 5, date: '01/01/2026' },
      { id: 2, user: 'Ana', text: '', stars: 4, date: '01/01/2026' }, // texto vazio sai
      { id: 3, user: 'Jo', text: '<b>ok</b>', stars: 99, date: '01/01/2026' },
      null, // documento corrompido não derruba a vitrine
    ],
  });
  assert.equal(p.comments?.length, 2);
  assert.equal(p.comments?.[1].stars, 5); // 99 -> limitado a 5
  assert.ok(!p.comments?.[1].text.includes('<'));
});

test('normalizeDemand limpa contato e nome', () => {
  const d = ST.normalizeDemand('x', {
    product: 'Perfume',
    user: '<script>Ana</script>',
    whatsapp: '(68) 99999-9999',
    date: '01/01/2026',
  });
  // A tag inteira sai junto: nada de "script" sobrando no painel do admin.
  assert.equal(d.user, 'Ana');
  assert.equal(d.product, 'Perfume');
  assert.ok(!d.user.includes('<'));
  assert.ok(!d.user.includes('>'));
  assert.equal(d.whatsapp, '68999999999');
});

test('normalizeDemand tolera documento incompleto', () => {
  const d = ST.normalizeDemand('y', {});
  assert.equal(d.fid, 'y');
  assert.equal(typeof d.user, 'string');
  assert.equal(typeof d.product, 'string');
  assert.equal(d.whatsapp, '');
});

/* ── Preço ─────────────────────────────────────────────────────────── */

test('priceOf devolve o preço efetivo', () => {
  assert.equal(ST.priceOf(product({ price: 100 })), 100);
  assert.equal(ST.priceOf(product({ price: 100, discountPrice: 75 })), 75);
  assert.equal(ST.priceOf(product({ price: 100, discountPrice: 150 })), 100);
  assert.equal(ST.priceOf(product({ price: 'abc' as unknown as number })), 0);
});

/* ── Busca ─────────────────────────────────────────────────────────── */

test('normalizeSearch ignora acento e caixa alta', () => {
  assert.equal(ST.normalizeSearch('Essência'), 'essencia');
  assert.equal(ST.normalizeSearch('  PERFUME  '), 'perfume');
  assert.equal(ST.normalizeSearch(undefined), '');
});

test('filterProducts busca por várias palavras em qualquer campo', () => {
  const list = [
    product({ fid: '1', name: 'Essência Baunilha', description: 'doce e quente' }),
    product({ fid: '2', name: 'Perfume Floral', description: 'leve' }),
  ];
  assert.equal(ST.filterProducts(list, { category: 'todos', search: 'baunilha' }).length, 1);
  assert.equal(ST.filterProducts(list, { category: 'todos', search: 'essencia' }).length, 1);
  assert.equal(ST.filterProducts(list, { category: 'todos', search: 'doce quente' }).length, 1);
  assert.equal(ST.filterProducts(list, { category: 'todos', search: 'perfume floral' }).length, 1);
  assert.equal(ST.filterProducts(list, { category: 'todos', search: 'inexistente' }).length, 0);
  assert.equal(ST.filterProducts(list, { category: 'todos', search: '' }).length, 2);
});

test('filterProducts esconde produto marcado como oculto', () => {
  const list = [product({ fid: '1' }), product({ fid: '2', hidden: true })];
  const result = ST.filterProducts(list, { category: 'todos', search: '' });
  assert.equal(result.length, 1);
  assert.equal(result[0].fid, '1');
});

test('filterProducts respeita categoria e filtros rápidos', () => {
  const list = [
    product({ fid: '1', category: 'perfumes', stock: 5 }),
    product({ fid: '2', category: 'make', stock: 0 }),
    product({ fid: '3', category: 'perfumes', price: 100, discountPrice: 50 }),
  ];
  assert.equal(ST.filterProducts(list, { category: 'perfumes', search: '' }).length, 2);
  assert.equal(ST.filterProducts(list, { category: 'make', search: '' }).length, 1);
  assert.equal(
    ST.filterProducts(list, { category: 'todos', search: '', availableOnly: true }).length,
    2
  );
  assert.equal(
    ST.filterProducts(list, { category: 'todos', search: '', promoOnly: true }).length,
    1
  );
  assert.equal(
    ST.filterProducts(list, {
      category: 'todos',
      search: '',
      favoritesOnly: true,
      favorites: ['3'],
    }).length,
    1
  );
});

/* ── Ordenação ─────────────────────────────────────────────────────── */

test('sortProducts ordena sem alterar a lista original', () => {
  const list = [
    product({ fid: '1', price: 50 }),
    product({ fid: '2', price: 10 }),
    product({ fid: '3', price: 30 }),
  ];
  const original = list.map((p) => p.fid);

  assert.deepEqual(
    ST.sortProducts(list, 'price-asc').map((p) => p.fid),
    ['2', '3', '1']
  );
  assert.deepEqual(
    ST.sortProducts(list, 'price-desc').map((p) => p.fid),
    ['1', '3', '2']
  );
  assert.deepEqual(list.map((p) => p.fid), original);
});

test('sortProducts considera a promoção na ordenação por preço', () => {
  const list = [
    product({ fid: 'cheio', price: 100 }),
    product({ fid: 'promo', price: 200, discountPrice: 20 }),
  ];
  assert.equal(ST.sortProducts(list, 'price-asc')[0].fid, 'promo');
});

test('sortProducts por avaliação e por novidade', () => {
  const list = [
    product({ fid: 'baixa', rating: 3 }),
    product({ fid: 'alta', rating: 5 }),
  ];
  assert.equal(ST.sortProducts(list, 'rating')[0].fid, 'alta');

  const byDate = [
    product({ fid: 'velho', createdAt: new Date(Date.now() - 10 * 86_400_000) }),
    product({ fid: 'novo', createdAt: new Date() }),
  ];
  assert.equal(ST.sortProducts(byDate, 'newest')[0].fid, 'novo');
});

test('sortProducts não quebra com produto sem data', () => {
  const list = [product({ fid: '1', createdAt: null }), product({ fid: '2' })];
  assert.doesNotThrow(() => ST.sortProducts(list, 'newest'));
  assert.equal(ST.sortProducts(list, 'newest').length, 2);
});

/* ── Destaques ─────────────────────────────────────────────────────── */

test('pickFeatured prioriza promoção e exige imagem', () => {
  const list = [
    product({ fid: 'sem-foto', price: 100, discountPrice: 50, image: '' }),
    product({ fid: 'normal', price: 100, rating: 4.0 }),
    product({ fid: 'promo', price: 100, discountPrice: 60 }),
    product({ fid: 'amado', price: 100, rating: 4.9 }),
  ];
  const featured = ST.pickFeatured(list, 4);
  assert.ok(!featured.some((p) => p.fid === 'sem-foto'));
  assert.ok(!featured.some((p) => p.fid === 'normal'));
  assert.equal(featured[0].fid, 'promo');
  assert.ok(featured.length <= 4);
});

test('pickFeatured devolve lista vazia sem produto elegível', () => {
  assert.deepEqual(ST.pickFeatured([], 4), []);
  assert.deepEqual(ST.pickFeatured([product({ image: '' })], 4), []);
});
