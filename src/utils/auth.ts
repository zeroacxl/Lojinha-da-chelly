/**
 * Autenticação do painel administrativo.
 *
 * ── O QUE FOI REMOVIDO ───────────────────────────────────────────────────
 * O código anterior tinha uma senha fixa escrita no bundle (`MATport123`),
 * duplicada como string hexadecimal ("\x4d\x41\x54…") para "esconder". O
 * bundle é público: qualquer pessoa que abrir o DevTools ou o arquivo
 * compilado lê as duas. Pior: o `catch` que tratava falha de rede aceitava
 * essa mesma senha — ou seja, se o Firestore estivesse fora do ar, QUALQUER
 * pessoa que conhecesse a string entrava no painel.
 *
 * ── O QUE FICA ───────────────────────────────────────────────────────────
 *  - a senha vem do Firestore (`settings/admin`, campo `password`);
 *  - comparação em tempo constante (`safeEqual`) para não vazar a senha pelo
 *    tempo de resposta;
 *  - rate limit com espera exponencial persistido (`utils/security.ts`);
 *  - sem senha de emergência: se o banco estiver inacessível, ninguém entra.
 *    Isso é o comportamento correto — a disponibilidade do painel não pode
 *    custar a segurança dele.
 *
 * ── AVISO HONESTO ────────────────────────────────────────────────────────
 * Nenhuma senha verificada no navegador protege de verdade: o código roda na
 * máquina de quem visita, e uma pessoa determinada pode simplesmente forçar
 * `isAdmin = true` no estado do React. A proteção REAL são as Security Rules
 * do Firestore, negando `write` em `products`, `demands` e `settings` para
 * quem não estiver autenticado. Veja `SEGURANCA.md` — o passo a passo está lá.
 * Este módulo existe para esconder o painel do visitante comum, não para
 * segurar um invasor.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  isLockedOut,
  lockoutRemainingMs,
  readThrottle,
  registerFailedAttempt,
  resetThrottle,
  safeEqual,
} from './security';

export interface AuthResult {
  ok: boolean;
  message: string;
  attemptsLeft: number;
  lockedUntil: number;
}

const MAX_ATTEMPTS = 5;

/** Devolve o estado atual do limitador (para a UI exibir antes de tentar). */
export function authStatus(): { attemptsLeft: number; lockedUntil: number } {
  const state = readThrottle();
  return {
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - state.attempts),
    lockedUntil: isLockedOut(state) ? lockoutRemainingMs(state) + Date.now() : 0,
  };
}

/**
 * Confere a senha digitada contra `settings/admin`.
 * Sempre devolve um resultado amigável — nunca lança para a UI.
 */
export async function authenticateAdmin(password: string): Promise<AuthResult> {
  const current = authStatus();

  if (current.lockedUntil > Date.now()) {
    const seconds = Math.ceil((current.lockedUntil - Date.now()) / 1000);
    return {
      ok: false,
      message: `Muitas tentativas seguidas. Aguarde ${seconds}s.`,
      attemptsLeft: 0,
      lockedUntil: current.lockedUntil,
    };
  }

  const typed = password.trim();
  if (!typed) {
    return {
      ok: false,
      message: 'Digite a senha do painel.',
      attemptsLeft: current.attemptsLeft,
      lockedUntil: 0,
    };
  }

  try {
    const snapshot = await getDoc(doc(db, 'settings', 'admin'));
    const stored = snapshot.exists() ? String(snapshot.data()?.password ?? '') : '';

    if (!stored) {
      // Sem senha configurada no banco: recusamos em vez de aceitar qualquer coisa.
      return {
        ok: false,
        message:
          'O painel ainda não tem senha definida no Firestore (settings/admin). Configure para liberar o acesso.',
        attemptsLeft: current.attemptsLeft,
        lockedUntil: 0,
      };
    }

    if (safeEqual(typed, stored)) {
      resetThrottle();
      return { ok: true, message: 'Acesso liberado', attemptsLeft: MAX_ATTEMPTS, lockedUntil: 0 };
    }

    const next = registerFailedAttempt();
    if (next.lockedUntil > Date.now()) {
      const seconds = Math.ceil((next.lockedUntil - Date.now()) / 1000);
      return {
        ok: false,
        message: `Senha incorreta. Painel bloqueado por ${seconds}s.`,
        attemptsLeft: 0,
        lockedUntil: next.lockedUntil,
      };
    }
    return {
      ok: false,
      message: `Senha incorreta (${Math.max(0, MAX_ATTEMPTS - next.attempts)}/${MAX_ATTEMPTS} tentativas restantes).`,
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - next.attempts),
      lockedUntil: 0,
    };
  } catch {
    // Rede/Firestore indisponível: recusamos. Não existe "senha de emergência".
    return {
      ok: false,
      message: 'Não foi possível verificar a senha agora. Confira sua conexão e tente de novo.',
      attemptsLeft: current.attemptsLeft,
      lockedUntil: 0,
    };
  }
}
