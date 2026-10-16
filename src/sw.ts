/// <reference lib="webworker" />
/**
 * Service Worker da Chelly Shop.
 *
 * Estratégia (pensada para aparelho fraco + internet ruim, típico do uso no
 * Acre):
 *   • PRECACHE — todos os arquivos do build entram na instalação. Depois de
 *     aberto uma vez, o app carrega instantaneamente e funciona offline.
 *   • NAVIGATION — network-first com timeout curto: online pega a versão nova,
 *     offline cai no cache e, se nem isso existir, na página offline.html.
 *   • IMAGEM DE PRODUTO — as fotos ficam em base64 dentro do Firestore, então
 *     não há CDN para cachear; ainda assim qualquer imagem externa passa por
 *     stale-while-revalidate com teto de 60 entradas (não estoura a cota).
 *   • FIREBASE — não interceptamos `firestore.googleapis.com`: o SDK já cuida
 *     da própria persistência offline. Assim nada do Firebase é alterado.
 *   • ADS — requisições de anúncio nunca são cacheadas (política do AdSense).
 */

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

const RUNTIME_CACHE = 'chelly-runtime-v1';
const IMAGE_CACHE = 'chelly-images-v1';
const OFFLINE_URL = '/offline.html';

/* ------------------------------------------------------------------ *
 * Precache do build
 * ------------------------------------------------------------------ */
// `self.__WB_MANIFEST` é substituído pelo vite-plugin-pwa na compilação.
precacheAndRoute(self.__WB_MANIFEST);

// Remove caches de builds anteriores (evita acúmulo no aparelho).
cleanupOutdatedCaches();

/* ------------------------------------------------------------------ *
 * Navegação: network-first, caindo para o cache/offline
 * ------------------------------------------------------------------ */
const navigationHandler = new NetworkFirst({
  cacheName: RUNTIME_CACHE,
  networkTimeoutSeconds: 4, // 4G ruim não fica girando: cai logo no cache
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 }),
  ],
});

registerRoute(
  new NavigationRoute(async (options) => {
    try {
      return await navigationHandler.handle(options);
    } catch {
      const cached = await caches.match(OFFLINE_URL);
      if (cached) return cached;
      return new Response(
        '<!doctype html><html lang="pt-BR"><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>Chelly Shop — offline</title>' +
          '<body style="margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#fff;' +
          'display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px">' +
          '<div><h1 style="font-size:1.5rem">Você está sem conexão</h1>' +
          '<p style="opacity:.7;font-size:.9rem">Reconecte-se para ver os produtos.</p></div></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
  })
);

// `/offline.html` sempre do precache.
registerRoute(({ url }) => url.pathname === OFFLINE_URL, createHandlerBoundToURL(OFFLINE_URL));

/* ------------------------------------------------------------------ *
 * Recursos estáticos do próprio domínio (CSS/JS/fonts)
 * ------------------------------------------------------------------ */
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    ['style', 'script', 'worker', 'font'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: RUNTIME_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

/* ------------------------------------------------------------------ *
 * Imagens externas (fotos hospedadas fora, avatares etc.)
 * ------------------------------------------------------------------ */
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' && url.origin !== self.location.origin,
  new StaleWhileRevalidate({
    cacheName: IMAGE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60, // 60 fotos ~ teto saudável para celular
        maxAgeSeconds: 60 * 60 * 24 * 14,
        purgeOnQuotaError: true, // libera espaço se o aparelho encher
      }),
    ],
  })
);

/* ------------------------------------------------------------------ *
 * Nunca cachear: Firestore, AdSense e analytics
 * ------------------------------------------------------------------ */
const NEVER_CACHE = [
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'googlesyndication.com',
  'doubleclick.net',
  'google-analytics.com',
  'googletagmanager.com',
];

registerRoute(
  ({ url }) => NEVER_CACHE.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)),
  new NetworkOnly()
);

/* ------------------------------------------------------------------ *
 * Ciclo de vida
 * ------------------------------------------------------------------ */
self.addEventListener('install', (event) => {
  // Ativa sem esperar todas as abas fecharem.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Avisa as abas abertas que existe uma versão nova pronta.
      const all = await self.clients.matchAll({ type: 'window' });
      all.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
    })()
  );
});

// Permite que a página dispare ações no SW (ex.: limpar cache).
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null;
  if (!data?.type) return;

  if (data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }

  if (data.type === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(
      (async () => {
        for (const name of [RUNTIME_CACHE, IMAGE_CACHE]) {
          await caches.delete(name);
        }
      })()
    );
  }
});
