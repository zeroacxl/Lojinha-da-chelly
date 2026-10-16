/**
 * Carregamento do Google AdSense.
 *
 * Regras respeitadas aqui:
 *  - o script só é injetado UMA vez e só quando existe ID de editor válido;
 *  - é carregado com `async` + `crossorigin` para não bloquear a renderização;
 *  - cada bloco reserva espaço fixo (evita CLS, que derruba o Core Web Vitals
 *    e, com ele, o posicionamento na busca);
 *  - nunca injetamos anúncio dentro do fluxo de checkout (o passo de
 *    pagamento fica limpo — política do AdSense e boa conversão).
 */

import { ADSENSE, adsEnabled } from '../config/ads';

const SCRIPT_ID = 'google-adsense-sdk';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let loadPromise: Promise<boolean> | null = null;

/**
 * Injeta o SDK do AdSense. Resolve `true` quando o script foi aceito pelo
 * navegador e `false` quando está desligado ou foi bloqueado (adblock/CSP).
 * Chamadas repetidas reutilizam a mesma promessa.
 */
export function loadAdSense(): Promise<boolean> {
  if (!adsEnabled()) return Promise.resolve(false);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }
    if (document.getElementById(SCRIPT_ID)) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
      ADSENSE.clientId
    )}`;

    // Se o AdSense permitir Auto Ads, o próprio SDK insere os blocos.
    if (ADSENSE.autoAds) script.dataset.adClient = ADSENSE.clientId;

    const timeout = window.setTimeout(() => resolve(false), 8000);

    script.onload = () => {
      window.clearTimeout(timeout);
      resolve(true);
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      loadPromise = null; // permite tentar de novo depois
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

/** Enfileira um bloco de anúncio. Silencioso quando o SDK não está ativo. */
export function pushAd(): boolean {
  if (!adsEnabled()) return false;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    return true;
  } catch {
    return false;
  }
}

/** true quando a loja deve exibir espaços de anúncio. */
export function shouldShowAds(): boolean {
  return adsEnabled();
}

/** URL do ads.txt que precisa estar na raiz do domínio. */
export function adsTxtExpectedLine(): string {
  return `google.com, ${ADSENSE.clientId.replace('ca-pub-', '')}, DIRECT, f08c47fec0942fa0`;
}
