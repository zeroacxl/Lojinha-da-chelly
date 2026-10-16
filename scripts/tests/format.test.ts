import test from 'node:test';
import assert from 'node:assert/strict';

import * as F from '../../src/utils/format.ts';

/** O Intl pt-BR pode usar espaço comum, U+00A0 ou U+202F após "R$". */
const money = (v: unknown) => F.fmt(v).replace(/\s+/g, ' ');

test('fmt formata em Real brasileiro', () => {
  assert.equal(money(10), 'R$ 10,00');
  assert.equal(money(0.5), 'R$ 0,50');
  assert.equal(money(1299.9), 'R$ 1.299,90');
  assert.equal(money(99999), 'R$ 99.999,00');
});

test('fmt nunca devolve valor inválido', () => {
  assert.equal(money(-5), 'R$ 0,00');
  assert.equal(money('abc'), 'R$ 0,00');
  assert.equal(money(undefined), 'R$ 0,00');
  assert.equal(money(NaN), 'R$ 0,00');
  assert.equal(money(1e9), 'R$ 99.999,00');
});

test('discountPercent calcula a promoção', () => {
  assert.equal(F.discountPercent(100, 75), 25);
  assert.equal(F.discountPercent(89.9, 44.95), 50);
  assert.equal(F.discountPercent(100, 99), 1);
});

test('discountPercent devolve 0 quando não há promoção real', () => {
  assert.equal(F.discountPercent(100, 0), 0);
  assert.equal(F.discountPercent(100, null), 0);
  assert.equal(F.discountPercent(100, undefined), 0);
  // Promoção maior ou igual ao preço não é desconto — era exibido como "-20%"
  assert.equal(F.discountPercent(50, 80), 0);
  assert.equal(F.discountPercent(50, 50), 0);
  assert.equal(F.discountPercent(0, 10), 0);
});

test('finalPrice escolhe o preço cobrado', () => {
  assert.equal(F.finalPrice(100, 75), 75);
  assert.equal(F.finalPrice(100, null), 100);
  assert.equal(F.finalPrice(100, 0), 100);
  assert.equal(F.finalPrice(100, 150), 100);
});

test('today devolve data em pt-BR', () => {
  assert.match(F.today(), /^\d{2}\/\d{2}\/\d{4}$/);
});

test('toDate aceita os formatos que vêm do Firestore', () => {
  // Timestamp vivo (com método)
  assert.equal(F.toDate({ toMillis: () => 1700000000000 })?.getTime(), 1700000000000);
  // Timestamp serializado por {...doc.data()} — perde os métodos
  assert.equal(F.toDate({ seconds: 1700000000, nanoseconds: 0 })?.getTime(), 1700000000000);
  assert.equal(F.toDate(new Date(1700000000000))?.getTime(), 1700000000000);
  assert.equal(F.toDate(1700000000000)?.getTime(), 1700000000000);
  assert.equal(F.toDate('2024-01-15T10:00:00Z')?.getUTCFullYear(), 2024);
});

test('toDate devolve null para lixo', () => {
  assert.equal(F.toDate({}), null);
  assert.equal(F.toDate(null), null);
  assert.equal(F.toDate(undefined), null);
  assert.equal(F.toDate('não é data'), null);
  assert.equal(F.toDate({ seconds: 'x' }), null);
});

test('isNewerThan marca produto novo', () => {
  const day = 86_400_000;
  assert.equal(F.isNewerThan(new Date(Date.now() - day), 7), true);
  assert.equal(F.isNewerThan({ seconds: Math.floor((Date.now() - day) / 1000) }, 7), true);
  assert.equal(F.isNewerThan(new Date(Date.now() - 30 * day), 7), false);
  // Data no futuro não pode virar "NOVO" para sempre
  assert.equal(F.isNewerThan(new Date(Date.now() + 10 * day), 7), false);
  assert.equal(F.isNewerThan(null, 7), false);
});

test('relativeDate descreve a distância', () => {
  const day = 86_400_000;
  assert.equal(F.relativeDate(new Date()), 'hoje');
  assert.equal(F.relativeDate(new Date(Date.now() - day)), 'ontem');
  assert.equal(F.relativeDate(new Date(Date.now() - 3 * day)), 'há 3 dias');
  assert.equal(F.relativeDate(new Date(Date.now() - 60 * day)), 'há 2 meses');
  assert.equal(F.relativeDate(new Date(Date.now() - 400 * day)), 'há 1 anos');
  assert.equal(F.relativeDate(null), '');
});

test('deaccent remove acento preservando caixa alta', () => {
  assert.equal(F.deaccent('São Paulo'), 'Sao Paulo');
  assert.equal(F.deaccent('ÁÉÍÓÚÇ'), 'AEIOUC');
  assert.equal(F.deaccent('áéíóúç'), 'aeiouc');
  assert.equal(F.deaccent('sem acento'), 'sem acento');
});

test('waLink monta o link do WhatsApp', () => {
  assert.equal(F.waLink('(68) 99999-9999'), 'https://wa.me/5568999999999');
  assert.equal(
    F.waLink('55068999999999', 'olá mundo'),
    'https://wa.me/5568999999999?text=ol%C3%A1%20mundo'
  );
  assert.equal(F.waLink(''), '');
  assert.equal(F.waLink('abc'), '');
});

test('formatPhone aplica a máscara brasileira', () => {
  assert.equal(F.formatPhone('68999999999'), '(68) 99999-9999');
  assert.equal(F.formatPhone('6833334444'), '(68) 3333-4444');
  assert.equal(F.formatPhone('123'), '123');
});

test('ellipsis corta sem partir code point', () => {
  assert.equal(F.ellipsis('abcdefghij', 5), 'abcd…');
  assert.equal(F.ellipsis('abc', 5), 'abc');
  assert.equal(F.ellipsis('💖💖💖', 2), '💖…');
  assert.equal(F.ellipsis(null, 5), '');
});
