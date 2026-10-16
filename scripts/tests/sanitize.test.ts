import test from 'node:test';
import assert from 'node:assert/strict';

import * as S from '../../src/utils/sanitize.ts';

test('sanitizeText remove tag HTML', () => {
  assert.equal(S.sanitizeText('<script>alert(1)</script>Oi', 50), 'alert(1)Oi');
  assert.equal(S.sanitizeText('<b>oi</b>', 50), 'oi');
  assert.equal(S.sanitizeText('<img src=x onerror=alert(1)>oi', 60), 'oi');
});

test('sanitizeText derrota tag reconstruída (bypass clássico)', () => {
  // Depois da primeira remoção, "<scri<script>pt>" vira "<script>".
  // Um filtro de passada única deixaria o payload vivo.
  assert.equal(S.sanitizeText('<scri<script>pt>x', 50), 'ptx');
  assert.equal(S.sanitizeText('<<<<b>>>>oi', 50), 'oi');
  assert.equal(S.sanitizeText('<s<svg/onload=alert(1)>vg>', 80), 'vg');
});

test('sanitizeText remove entidades HTML', () => {
  assert.equal(S.sanitizeText('&lt;b&gt;oi&amp;', 50), 'b oi');
  assert.equal(S.sanitizeText('&#60;script&#62;', 50), 'script');
});

test('sanitizeText remove caracteres invisíveis e de controle', () => {
  assert.equal(S.sanitizeText('a\u200Bb', 50), 'ab'); // zero-width space
  assert.equal(S.sanitizeText('a\u202Eb', 50), 'ab'); // override bidirecional
  assert.equal(S.sanitizeText('a\u0000b\u001Fc', 50), 'abc');
  assert.equal(S.sanitizeText('a\uFEFFb', 50), 'ab'); // BOM
});

test('sanitizeText colapsa espaços e apara', () => {
  assert.equal(S.sanitizeText('   a    b   ', 50), 'a b');
});

test('sanitizeText não parte emoji ao cortar', () => {
  assert.equal(S.sanitizeText('abc💖def', 4), 'abc💖');
  assert.equal(S.sanitizeText('ãéíóú', 3), 'ãéí');
});

test('sanitizeText tolera entrada que não é string', () => {
  assert.equal(S.sanitizeText(undefined, 10), '');
  assert.equal(S.sanitizeText(null, 10), '');
  assert.equal(S.sanitizeText(123, 10), '');
  assert.equal(S.sanitizeText({}, 10), '');
});

test('truncateByCodePoint respeita o limite', () => {
  assert.equal(S.truncateByCodePoint('abcdef', 3), 'abc');
  assert.equal(S.truncateByCodePoint('ab', 5), 'ab');
  assert.equal(S.truncateByCodePoint('ab', 0), '');
});

test('digitsOnly mantém só número', () => {
  assert.equal(S.digitsOnly('(68) 99999-9999'), '68999999999');
  assert.equal(S.digitsOnly('abc'), '');
  assert.equal(S.digitsOnly(null), '');
});

test('normalizeWhatsApp entrega o formato do wa.me', () => {
  assert.equal(S.normalizeWhatsApp('(68) 99999-9999'), '5568999999999');
  assert.equal(S.normalizeWhatsApp('5568999999999'), '5568999999999');
  assert.equal(S.normalizeWhatsApp('55068999999999'), '5568999999999');
  assert.equal(S.normalizeWhatsApp('06833334444'), '556833334444');
  assert.equal(S.normalizeWhatsApp('abc'), '');
});

test('sanitizePixKey aceita os quatro tipos de chave', () => {
  // Telefone / CPF / CNPJ: só dígitos
  assert.equal(S.sanitizePixKey('(68) 99999-9999'), '68999999999');
  assert.equal(S.sanitizePixKey('123.456.789-09'), '12345678909');
  // E-mail: minúsculas, mantém + . _ -
  assert.equal(S.sanitizePixKey('  Loja@Exemplo.COM  '), 'loja@exemplo.com');
  assert.equal(
    S.sanitizePixKey('maria.silva+loja@dominio.com.br'),
    'maria.silva+loja@dominio.com.br'
  );
  // EVP (chave aleatória): UUID preservado em minúsculas
  assert.equal(
    S.sanitizePixKey('7D9F8A1B-2C3E-4F5A-6B7C-8D9E0F1A2B3C'),
    '7d9f8a1b-2c3e-4f5a-6b7c-8d9e0f1a2b3c'
  );
  assert.equal(
    S.sanitizePixKey('7d9f8a1b2c3e4f5a6b7c8d9e0f1a2b3c'),
    '7d9f8a1b-2c3e-4f5a-6b7c-8d9e0f1a2b3c'
  );
});

test('sanitizePixKey rejeita markup e entrada inválida', () => {
  assert.equal(S.sanitizePixKey('<b>123</b>'), '123');
  assert.equal(S.sanitizePixKey(''), '');
  assert.equal(S.sanitizePixKey(123), '');
  assert.equal(S.sanitizePixKey(null), '');
});

test('safeUrl bloqueia protocolo perigoso', () => {
  assert.equal(S.safeUrl('javascript:alert(1)'), '');
  assert.equal(S.safeUrl('JaVaScRiPt:alert(1)'), '');
  assert.equal(S.safeUrl('vbscript:x'), '');
  assert.equal(S.safeUrl('data:text/html,<script>'), '');
  assert.equal(S.safeUrl('file:///etc/passwd'), '');
});

test('safeUrl aceita protocolo seguro e caminho relativo', () => {
  assert.equal(S.safeUrl('https://exemplo.com/a.png'), 'https://exemplo.com/a.png');
  assert.equal(S.safeUrl('http://exemplo.com'), 'http://exemplo.com');
  assert.equal(S.safeUrl('/img/a.png'), '/img/a.png');
  assert.equal(S.safeUrl('#catalogo'), '#catalogo');
  assert.equal(S.safeUrl('mailto:a@b.com'), 'mailto:a@b.com');
});

test('safeImageUrl aceita data:image apenas em base64', () => {
  assert.equal(S.safeImageUrl('data:image/webp;base64,AAA'), 'data:image/webp;base64,AAA');
  assert.equal(S.safeImageUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
  assert.equal(S.safeImageUrl('data:image/svg+xml;base64,AAA'), ''); // SVG pode carregar script
  assert.equal(S.safeImageUrl('data:text/html;base64,AAA'), '');
  // Sem a flag, data: é bloqueado
  assert.equal(S.safeUrl('data:image/webp;base64,AAA'), '');
});

test('clampStars mantém inteiro entre 1 e 5', () => {
  assert.equal(S.clampStars(5), 5);
  assert.equal(S.clampStars(9), 5);
  assert.equal(S.clampStars(0), 1);
  assert.equal(S.clampStars(-3), 1);
  assert.equal(S.clampStars(3.4), 3);
  assert.equal(S.clampStars('x'), 5);
  assert.equal(S.clampStars(undefined), 5);
});

test('clampPrice e clampStock limitam faixa', () => {
  assert.equal(S.clampPrice('12.345'), 12.35);
  assert.equal(S.clampPrice(-50), 0);
  assert.equal(S.clampPrice(1e9), 99999);
  assert.equal(S.clampPrice('abc'), 0);
  assert.equal(S.clampStock(-5), 0);
  assert.equal(S.clampStock(10.6), 11);
  assert.equal(S.clampStock(1e9), 9999);
});

test('sanitizeCategory só aceita categoria conhecida', () => {
  const allowed = ['perfumes', 'skincare', 'make'];
  assert.equal(S.sanitizeCategory('make', allowed), 'make');
  assert.equal(S.sanitizeCategory('xyz', allowed), 'perfumes');
  assert.equal(S.sanitizeCategory(undefined, allowed), 'perfumes');
});

test('isEmail', () => {
  assert.equal(S.isEmail('a@b.co'), true);
  assert.equal(S.isEmail('  maria@dominio.com.br  '), true);
  assert.equal(S.isEmail('a@b'), false);
  assert.equal(S.isEmail('ab.com'), false);
  assert.equal(S.isEmail(''), false);
});
