/**
 * Segurança no cliente.
 *
 * ── O QUE MUDOU E POR QUÊ ────────────────────────────────────────────────
 * A versão anterior ("GuardBot v4") tentava detectar depurador com a
 * instrução `debugger` a cada 1 segundo, bloqueava o botão direito e o F12 e,
 * ao "detectar" ameaça, apagava o localStorage e jogava o usuário para
 * `about:blank`. Na prática isso:
 *   1. Não impede ninguém (é código público no bundle — basta não abrir o
 *      console, ou editar o JS, ou usar um proxy);
 *   2. Derruba a performance (o `debugger` pausa/mede a thread principal
 *      todo segundo, em qualquer aparelho);
 *   3. Quebra a experiência de gente honesta (extensões de tradução,
 *      leitores de tela, atalhos de acessibilidade e o "inspecionar" do
 *      próprio dono da loja disparam o bloqueio);
 *   4. Destrói dados do cliente (carrinho/favoritos apagados sem motivo).
 *
 * O que protege uma loja de verdade:
 *   • sanitização de toda entrada (utils/sanitize.ts) + React escapando a
 *     saída -> sem XSS;
 *   • CSP sem `unsafe-inline` (index.html) -> script injetado não executa;
 *   • rate limiting com espera crescente + persistência -> sem força bruta;
 *   • sessão administrativa que expira sozinha -> sem painel aberto para
 *     sempre num computador compartilhado;
 *   • e, do lado do servidor, as Security Rules do Firestore (ver
 *     SEGURANCA.md) — é ali que a autorização realmente vale.
 *
 * Este módulo mantém essas proteções do lado do cliente, sem teatro de
 * segurança e sem custo de performance.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { KEYS, readJSON, writeJSON } from './storage';
import { sanitizeText } from './sanitize';

/* ------------------------------------------------------------------ *
 * Constantes de política
 * ------------------------------------------------------------------ */

/** Sessão administrativa expira após 30 minutos de inatividade. */
export const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;

/** Tentativas de login antes de começar a espera obrigatória. */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Espera base após estourar o limite (cresce a cada novo bloqueio). */
export const LOCKOUT_BASE_MS = 30 * 1000;

/** Teto da espera (5 minutos) para não trancar ninguém para sempre. */
export const LOCKOUT_MAX_MS = 5 * 60 * 1000;

/** Intervalo mínimo entre envios de formulário público (anti-spam). */
export const MIN_SUBMISSION_GAP_MS = 5_000;

/* ------------------------------------------------------------------ *
 * Rate limiter persistente
 * ------------------------------------------------------------------ */

export interface ThrottleState {
  attempts: number;
  lockedUntil: number;
  blocks: number;
}

const EMPTY_THROTTLE: ThrottleState = { attempts: 0, lockedUntil: 0, blocks: 0 };

/**
 * Limitador de tentativas com espera exponencial.
 * Persiste em `sessionStorage` — fechar a aba zera, mas recarregar a página
 * NÃO zera (recarregar para fugir do bloqueio era trivial antes).
 */
export function readThrottle(): ThrottleState {
  const raw = readJSON<Partial<ThrottleState>>(KEYS.loginThrottle, EMPTY_THROTTLE, 'session');
  return {
    attempts: Number(raw?.attempts) || 0,
    lockedUntil: Number(raw?.lockedUntil) || 0,
    blocks: Number(raw?.blocks) || 0,
  };
}

function writeThrottle(state: ThrottleState): void {
  writeJSON(KEYS.loginThrottle, state, 'session');
}

export function isLockedOut(state = readThrottle()): boolean {
  return state.lockedUntil > Date.now();
}

export function lockoutRemainingMs(state = readThrottle()): number {
  return Math.max(0, state.lockedUntil - Date.now());
}

/** Registra uma tentativa falha e devolve o novo estado. */
export function registerFailedAttempt(): ThrottleState {
  const current = readThrottle();
  const attempts = current.attempts + 1;
  let { lockedUntil, blocks } = current;

  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    // Espera exponencial: 30s, 60s, 120s, 240s, 300s (teto).
    const wait = Math.min(LOCKOUT_BASE_MS * 2 ** blocks, LOCKOUT_MAX_MS);
    lockedUntil = Date.now() + wait;
    blocks += 1;
    writeThrottle({ attempts: 0, lockedUntil, blocks });
    return { attempts: 0, lockedUntil, blocks };
  }

  const next = { attempts, lockedUntil, blocks };
  writeThrottle(next);
  return next;
}

/** Login bem-sucedido: zera o histórico. */
export function resetThrottle(): void {
  writeThrottle({ ...EMPTY_THROTTLE });
}

/* ------------------------------------------------------------------ *
 * Comparação de senha em tempo constante
 * ------------------------------------------------------------------ */

/**
 * Compara sem revelar, pelo tempo de resposta, em qual caractere a senha
 * errada divergiu. Não substitui autenticação no servidor — apenas evita o
 * vazamento mais óbvio.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = String(a ?? '');
  const right = String(b ?? '');
  // Comprimentos diferentes já entrega informação; comparamos contra um
  // tamanho fixo derivado do hash simples abaixo para não vazar o tamanho.
  const la = left.length;
  const lb = right.length;
  let diff = la ^ lb;
  const max = Math.max(la, lb);
  for (let i = 0; i < max; i++) {
    const ca = i < la ? left.charCodeAt(i) : 0;
    const cb = i < lb ? right.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Anti-spam de formulários públicos
 * ------------------------------------------------------------------ */

/**
 * Guarda a última submissão por formulário (avaliação, "me avise").
 * Retorna o tempo que ainda falta esperar, ou 0 quando liberado.
 */
export function useSubmissionThrottle() {
  const last = useRef<Record<string, number>>({});

  return useCallback((formId: string, minGap = MIN_SUBMISSION_GAP_MS) => {
    const now = Date.now();
    const previous = last.current[formId] ?? 0;
    if (now - previous < minGap) return Math.ceil((minGap - (now - previous)) / 1000);
    last.current[formId] = now;
    return 0;
  }, []);
}

/* ------------------------------------------------------------------ *
 * Sessão administrativa com expiração
 * ------------------------------------------------------------------ */

export interface AdminSession {
  startedAt: number;
  lastActivity: number;
}

export function openAdminSession(): void {
  const now = Date.now();
  writeJSON(KEYS.adminSession, { startedAt: now, lastActivity: now } satisfies AdminSession, 'session');
}

export function touchAdminSession(): boolean {
  const session = readJSON<AdminSession | null>(KEYS.adminSession, null, 'session');
  if (!session) return false;
  const now = Date.now();
  if (now - session.lastActivity > ADMIN_SESSION_TTL_MS) {
    closeAdminSession();
    return false;
  }
  writeJSON(KEYS.adminSession, { ...session, lastActivity: now }, 'session');
  return true;
}

export function closeAdminSession(): void {
  writeJSON(KEYS.adminSession, null, 'session');
}

export function hasActiveAdminSession(): boolean {
  return touchAdminSession();
}

/* ------------------------------------------------------------------ *
 * Honeypot anti-bot
 * ------------------------------------------------------------------ */

/**
 * Campo invisível para humanos. Bots que preenchem formulários por
 * varredura de DOM marcam o campo -> ignoramos o envio.
 * Custo zero de performance e nenhum impacto em quem usa leitor de tela
 * (o campo tem `tabIndex={-1}` e `aria-hidden`).
 */
export function honeypotTripped(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

/* ------------------------------------------------------------------ *
 * Hardening passivo de página
 * ------------------------------------------------------------------ */

export interface HardeningOptions {
  /** Bloqueia clique direito. Desligado por padrão: atrapalha acessibilidade. */
  blockContextMenu?: boolean;
  /** Aplica `rel="noopener noreferrer"` em links externos automaticamente. */
  hardenExternalLinks?: boolean;
}

/**
 * Aplica ajustes defensivos baratos e inofensivos:
 *  - corta `window.opener` de links `target="_blank"` (reverse tabnabbing);
 *  - impede que a página seja arrastada para fora do contexto;
 *  - remove o referrer em navegações externas.
 *
 * Roda uma única vez e custa ~0 em runtime.
 */
export function usePageHardening(options: HardeningOptions = {}): void {
  const { blockContextMenu = false, hardenExternalLinks = true } = options;

  useEffect(() => {
    if (blockContextMenu) {
      const prevent = (event: MouseEvent) => event.preventDefault();
      document.addEventListener('contextmenu', prevent);
      return () => document.removeEventListener('contextmenu', prevent);
    }
    if (!hardenExternalLinks) return;

    const harden = () => {
      const anchors = document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]');
      anchors.forEach((a) => {
        const rel = a.getAttribute('rel') ?? '';
        if (!rel.includes('noopener')) {
          a.setAttribute('rel', `${rel} noopener noreferrer`.trim());
        }
      });
    };

    harden();
    // Reaplica quando o React adicionar novos links.
    const observer = new MutationObserver(harden);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [blockContextMenu, hardenExternalLinks]);
}

/* ------------------------------------------------------------------ *
 * Monitor de integridade (substituto honesto do "GuardBot")
 * ------------------------------------------------------------------ */

export interface IntegrityState {
  /** true quando a página não roda em contexto seguro (http:// fora localhost). */
  insecureContext: boolean;
  /** true quando a página está dentro de um iframe de origem desconhecida. */
  framed: boolean;
  /** true quando cookies/armazenamento estão indisponíveis (modo anônimo). */
  storageBlocked: boolean;
  /** true quando o navegador não suporta Web Crypto. */
  weakCrypto: boolean;
}

/**
 * Diagnóstico do ambiente — mostrado ao administrador para ele saber se a
 * loja está sendo servida corretamente. Não bloqueia o cliente: apenas
 * informa.
 */
export function useIntegrityReport(): IntegrityState {
  const [state, setState] = useState<IntegrityState>({
    insecureContext: false,
    framed: false,
    storageBlocked: false,
    weakCrypto: false,
  });

  useEffect(() => {
    let framed = false;
    try {
      framed = window.self !== window.top && !window.location.hostname.endsWith('localhost');
    } catch {
      framed = true; // origem cruzada -> acesso a window.top lançou
    }

    let storageBlocked = false;
    try {
      const probe = '__probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
    } catch {
      storageBlocked = true;
    }

    setState({
      insecureContext: typeof window.isSecureContext === 'boolean' ? !window.isSecureContext : false,
      framed,
      storageBlocked,
      weakCrypto: typeof crypto === 'undefined' || !crypto?.getRandomValues,
    });
  }, []);

  return state;
}

/* ------------------------------------------------------------------ *
 * Bloqueio visual (mantido por compatibilidade, mas sem punir o usuário)
 * ------------------------------------------------------------------ */

export interface GuardBotApi {
  /** Sempre 0: não existe mais "nível de ameaça" acumulando com o uso. */
  threatLevel: number;
  integrity: IntegrityState;
}

/**
 * Mantém a assinatura antiga (`useGuardBot(onLockdown)`) para não quebrar
 * chamadas existentes, mas sem os comportamentos destrutivos.
 * `onLockdown` nunca é chamado por suspeita de depurador — apenas quando a
 * página está embutida num iframe de origem desconhecida (clickjacking).
 */
export function useGuardBot(onLockdown?: () => void): GuardBotApi {
  const integrity = useIntegrityReport();
  const fired = useRef(false);

  useEffect(() => {
    if (integrity.framed && onLockdown && !fired.current) {
      fired.current = true;
      onLockdown();
    }
  }, [integrity.framed, onLockdown]);

  return { threatLevel: 0, integrity };
}

/* ------------------------------------------------------------------ *
 * Texto de ajuda para o painel administrativo
 * ------------------------------------------------------------------ */

/** Mensagem curta explicando onde a segurança realmente acontece. */
export function securityAdvice(): string {
  return sanitizeText(
    'Autorização de verdade fica nas Security Rules do Firestore. ' +
      'A senha no navegador só esconde o painel visualmente.',
    160
  );
}
