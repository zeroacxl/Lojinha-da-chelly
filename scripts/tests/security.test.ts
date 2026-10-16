import test from 'node:test';
import assert from 'node:assert/strict';

import * as SEC from '../../src/utils/security.ts';

test('safeEqual compara corretamente', () => {
  assert.equal(SEC.safeEqual('senha123', 'senha123'), true);
  assert.equal(SEC.safeEqual('senha123', 'senha124'), false);
  assert.equal(SEC.safeEqual('', ''), true);
  assert.equal(SEC.safeEqual('abc', 'abcd'), false);
  assert.equal(SEC.safeEqual('abcd', 'abc'), false);
});

test('safeEqual não lança com entrada inválida', () => {
  // Comparação de senha não pode estourar exceção no meio do login.
  assert.equal(SEC.safeEqual(undefined as unknown as string, 'x'), false);
  assert.equal(SEC.safeEqual(null as unknown as string, null as unknown as string), true);
});

test('honeypotTripped detecta preenchimento por robô', () => {
  assert.equal(SEC.honeypotTripped(''), false);
  assert.equal(SEC.honeypotTripped('   '), false);
  assert.equal(SEC.honeypotTripped(undefined), false);
  assert.equal(SEC.honeypotTripped('http://spam.com'), true);
  assert.equal(SEC.honeypotTripped('x'), true);
});

test('constantes de política têm valores sensatos', () => {
  assert.equal(SEC.MAX_LOGIN_ATTEMPTS, 5);
  assert.equal(SEC.ADMIN_SESSION_TTL_MS, 30 * 60 * 1000);
  assert.equal(SEC.LOCKOUT_BASE_MS, 30 * 1000);
  assert.ok(SEC.LOCKOUT_MAX_MS >= SEC.LOCKOUT_BASE_MS);
  assert.equal(SEC.MIN_SUBMISSION_GAP_MS, 5000);
});

test('securityAdvice devolve texto limpo', () => {
  const advice = SEC.securityAdvice();
  assert.ok(advice.length > 0);
  assert.ok(!advice.includes('<'));
});

test('funções de armazenamento não lançam fora do navegador', () => {
  // Em Node não existe window.localStorage. Se algum acesso vazar sem
  // try/catch, a loja quebraria em qualquer contexto sem DOM.
  assert.doesNotThrow(() => SEC.readThrottle());
  assert.doesNotThrow(() => SEC.isLockedOut());
  assert.doesNotThrow(() => SEC.lockoutRemainingMs());
  assert.doesNotThrow(() => SEC.openAdminSession());
  assert.doesNotThrow(() => SEC.touchAdminSession());
  assert.doesNotThrow(() => SEC.closeAdminSession());
  assert.doesNotThrow(() => SEC.hasActiveAdminSession());
  assert.equal(SEC.isLockedOut(), false);
});
