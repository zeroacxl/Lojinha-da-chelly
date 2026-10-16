/**
 * PWA: instalação no celular, funcionamento offline e atualização.
 *
 * "Instalar como aplicativo" funciona de duas formas:
 *   1. Prompt nativo (`beforeinstallprompt`) — Android/Chrome, Edge e Safari
 *      desktop. Guardamos o evento e mostramos nosso próprio botão, porque o
 *      mini-infobar do navegador quase ninguém vê.
 *   2. Instruções manuais — iOS Safari não dispara `beforeinstallprompt`,
 *      então mostramos o passo a passo ("Compartilhar → Adicionar à Tela de
 *      Início"). Detectamos iOS para exibir o texto certo.
 *
 * O service worker é registrado com `workbox-window`, que cuida da parte
 * chata: descobrir quando uma versão nova terminou de baixar e oferecer
 * "atualizar agora" sem quebrar a sessão do cliente.
 */

import { Workbox } from 'workbox-window';
import { KEYS, readString, writeString } from './storage';

/* ------------------------------------------------------------------ *
 * Tipos
 * ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

export type InstallState =
  | 'unsupported' // navegador sem suporte a PWA
  | 'prompt-available' // podemos mostrar o botão "Instalar"
  | 'prompt-suppressed' // o usuário já recusou — não insistir
  | 'installed' // rodando como app
  | 'ios-instructions'; // iOS: mostrar o passo a passo

/* ------------------------------------------------------------------ *
 * Detecção de ambiente
 * ------------------------------------------------------------------ */

const ua = (): string => (typeof navigator !== 'undefined' ? navigator.userAgent : '');

/** Rodando já como aplicativo instalado. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
    nav.standalone === true
  );
}

/** iOS (inclusive iPadOS, que se disfarça de Mac com toque). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua()) || iPadOS;
}

export function isAndroid(): boolean {
  return /Android/i.test(ua());
}

/** Navegador antigo sem Service Worker (ex.: Android 4, IE). */
export function supportsPwa(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'caches' in window;
}

/**
 * O app precisa de HTTPS para registrar o SW. Em `localhost` o navegador
 * abre exceção, então o desenvolvimento continua funcionando.
 */
export function canRegisterSw(): boolean {
  if (!supportsPwa()) return false;
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  const host = window.location.hostname;
  return window.location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
}

/* ------------------------------------------------------------------ *
 * Registro do Service Worker + atualização
 * ------------------------------------------------------------------ */

export interface SwRegistrationResult {
  registered: boolean;
  /** true quando existe uma versão nova esperando para assumir. */
  updateReady: boolean;
  /** Recarrega a página aplicando a versão nova. */
  applyUpdate: () => void;
}

let workboxInstance: Workbox | null = null;
let waitingForUpdate = false;

/**
 * Registra `/sw.js` uma única vez.
 * `onUpdateReady` é chamado quando o novo SW terminou de baixar — a UI pode
 * então mostrar "Nova versão disponível: atualizar".
 */
export async function registerServiceWorker(
  onUpdateReady?: () => void
): Promise<SwRegistrationResult> {
  const noop: SwRegistrationResult = {
    registered: false,
    updateReady: false,
    applyUpdate: () => undefined,
  };

  if (!canRegisterSw()) return noop;
  if (workboxInstance) {
    return { registered: true, updateReady: waitingForUpdate, applyUpdate };
  }

  try {
    const wb = new Workbox('/sw.js', { scope: '/' });
    workboxInstance = wb;

    wb.addEventListener('waiting', () => {
      waitingForUpdate = true;
      onUpdateReady?.();
    });

    // O SW novo assumiu o controle: só recarrega se foi a gente que pediu.
    wb.addEventListener('controlling', (event) => {
      if ((event as { isUpdate?: boolean }).isUpdate) window.location.reload();
    });

    // Resposta offline do NavigationRoute não precisa esperar nada.
    wb.addEventListener('activated', () => {
      // noop — mantido para debug futuro
    });

    await wb.register();
    return { registered: true, updateReady: waitingForUpdate, applyUpdate };
  } catch {
    // Falhou (bloqueio de navegador, arquivo ausente): a loja segue normal.
    workboxInstance = null;
    return noop;
  }
}

/** Pede ao SW em espera para assumir e recarrega a página. */
export function applyUpdate(): void {
  waitingForUpdate = false;
  try {
    workboxInstance?.messageSkipWaiting();
  } catch {
    window.location.reload();
    return;
  }
  // Se o `controlling` não chegar em 3s, recarrega na marra.
  window.setTimeout(() => window.location.reload(), 3000);
}

/** Limpa caches antigos (botão "liberar espaço" no painel). */
export async function clearRuntimeCaches(): Promise<boolean> {
  if (!supportsPwa()) return false;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('chelly-')).map((k) => caches.delete(k)));
    return true;
  } catch {
    return false;
  }
}

/** Estimativa de quanto o app ocupa no aparelho (quando o navegador expõe). */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Pede persistência de armazenamento: sem isso o sistema pode apagar o cache
 * do app quando o aparelho fica com pouco espaço.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Prompt de instalação
 * ------------------------------------------------------------------ */

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** Captura o evento nativo de instalação. Chamar uma vez, no boot. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // impede o mini-infobar automático
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('chelly:install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    writeString(KEYS.installDismissed, '0');
    window.dispatchEvent(new CustomEvent('chelly:installed'));
  });
}

/** true quando temos um prompt nativo guardado para mostrar. */
export function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

/**
 * Mostra o diálogo nativo de instalação.
 * Retorna `'accepted'`, `'dismissed'` ou `'unavailable'`.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    deferredPrompt = null;
    return 'unavailable';
  }
}

/** Estado atual para a UI decidir o que mostrar. */
export function getInstallState(): InstallState {
  if (isStandalone()) return 'installed';
  if (!supportsPwa()) return 'unsupported';
  if (deferredPrompt) return 'prompt-available';
  if (isIOS()) return 'ios-instructions';
  if (isInstallSnoozed()) return 'prompt-suppressed';
  return 'unsupported';
}

/**
 * Marca que o usuário dispensou o convite.
 * Gravamos um timestamp (não um boolean) para poder "insistir de novo" depois
 * de alguns dias em vez de nunca mais.
 */
export function markInstallDismissed(days = 7): void {
  writeString(KEYS.installDismissed, String(Date.now() + days * 86_400_000));
}

/** true enquanto o convite estiver no período de snooze. */
export function isInstallSnoozed(): boolean {
  return Number(readString(KEYS.installDismissed) || 0) > Date.now();
}

/* ------------------------------------------------------------------ *
 * Status de rede
 * ------------------------------------------------------------------ */

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/* ------------------------------------------------------------------ *
 * Capacidades do aparelho (usadas para degradar com elegância)
 * ------------------------------------------------------------------ */

export interface DeviceProfile {
  /** Núcleos de CPU (0 quando o navegador não informa). */
  cores: number;
  /** Memória em GB (0 quando não informa). */
  memoryGb: number;
  /** Conexão efetiva: 'slow-2g' | '2g' | '3g' | '4g' | ''. */
  connection: string;
  /** Usuário pediu menos animação no sistema operacional. */
  reducedMotion: boolean;
  /** Tela pequena (celular em retrato). */
  smallScreen: boolean;
  /** Aparelho considerado fraco -> liga o modo econômico. */
  lowEnd: boolean;
}

/**
 * Descobre o que o aparelho aguenta.
 * `lowEnd` liga o "modo econômico": menos animações, menos imagens em
 * paralelo e banner sem autoplay. É isso que faz a loja rodar bem em
 * qualquer aparelho, do topo de linha ao Android de entrada.
 */
export function getDeviceProfile(): DeviceProfile {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
  };

  const cores = nav.hardwareConcurrency ?? 0;
  const memoryGb = nav.deviceMemory ?? 0;
  const connection = nav.connection?.effectiveType ?? '';
  const saveData = nav.connection?.saveData === true;

  let reducedMotion = false;
  try {
    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    reducedMotion = false;
  }

  let smallScreen = false;
  try {
    smallScreen = window.matchMedia?.('(max-width: 640px)').matches === true;
  } catch {
    smallScreen = typeof window !== 'undefined' && window.innerWidth < 640;
  }

  const lowEnd =
    saveData ||
    (cores > 0 && cores <= 2) ||
    (memoryGb > 0 && memoryGb <= 2) ||
    connection === '2g' ||
    connection === 'slow-2g';

  return { cores, memoryGb, connection, reducedMotion, smallScreen, lowEnd };
}
