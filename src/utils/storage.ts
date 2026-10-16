/**
 * Acesso seguro ao armazenamento local.
 *
 * Por que um wrapper?
 *  - `localStorage` pode lançar exceção (modo anônimo do Safari, cota cheia,
 *    cookies bloqueados, página servida de `file://`). Sem o try/catch a loja
 *    inteira quebraria na primeira renderização.
 *  - Centraliza o prefixo das chaves (evita colisão com outros apps no mesmo
 *    domínio) e o parse de JSON (evita `JSON.parse` de valor corrompido).
 */

const PREFIX = 'chelly:';

type StorageArea = 'local' | 'session';

function area(kind: StorageArea): Storage | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    // Testa escrita real: alguns navegadores expõem o objeto mas bloqueiam uso.
    const probe = '__chelly_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readJSON<T>(key: string, fallback: T, kind: StorageArea = 'local'): T {
  try {
    const raw = area(kind)?.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    // Não confiamos cegamente no que está gravado: valida o tipo esperado.
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown, kind: StorageArea = 'local'): boolean {
  try {
    area(kind)?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false; // cota cheia / bloqueado — a app segue funcionando em memória
  }
}

export function readString(key: string, fallback = '', kind: StorageArea = 'local'): string {
  try {
    return area(kind)?.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key: string, value: string, kind: StorageArea = 'local'): boolean {
  try {
    area(kind)?.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string, kind: StorageArea = 'local'): void {
  try {
    area(kind)?.removeItem(PREFIX + key);
  } catch {
    /* noop */
  }
}

/** Chaves usadas pela aplicação (single source of truth). */
export const KEYS = {
  favorites: 'favorites',
  cart: 'cart',
  address: 'address',
  consent: 'consent',
  adminSession: 'admin_session',
  loginThrottle: 'login_throttle',
  installDismissed: 'install_dismissed',
  seenProducts: 'seen_products',
} as const;
