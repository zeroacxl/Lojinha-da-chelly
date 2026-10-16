import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build da Chelly Shop.
 *
 * Decisões importantes:
 *  - SEM `vite-plugin-singlefile`: um arquivo HTML único impede service
 *    worker, manifest, code-splitting e cache de longo prazo (ou seja,
 *    impede o app de instalar no celular e deixa tudo mais lento). O build
 *    agora gera assets separados e versionados por hash.
 *  - `target: 'es2019'`: funciona em Android antigo e iOS 12+, sem exigir
 *    polyfill de optional-chaining/nullish.
 *  - `manualChunks`: separa React, Firebase, animação e ícones. Assim quem já
 *    visitou a loja baixa só o que mudou no próximo deploy.
 *  - PWA com `injectManifest`: o service worker é o nosso (src/sw.ts), então
 *    controlamos exatamente o que entra em cache — e nada do Firestore é
 *    interceptado.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Registramos manualmente em src/utils/pwa.ts para poder oferecer
      // "nova versão disponível" antes de recarregar a página do cliente.
      injectRegister: false,
      registerType: 'prompt',
      // offline.html e o manifest entram no precache: sem isso, instalar o
      // app sem conexão falha (o navegador não acharia o manifest).
      includeAssets: ['manifest.webmanifest', 'icons/*.{png,svg}'],
      manifest: {
        id: '/',
        name: 'Chelly Shop ✨ | Cosméticos & Essências',
        short_name: 'Chelly Shop',
        description:
          'Cosméticos, perfumes, skincare e maquiagem em Rio Branco (AC). Compre pelo WhatsApp e pague com Pix.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        background_color: '#ffffff',
        theme_color: '#f43f5e',
        categories: ['shopping', 'lifestyle', 'beauty'],
        icons: [
          { src: '/icons/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Perfumes',
            short_name: 'Perfumes',
            description: 'Ver a linha de perfumes',
            url: '/?categoria=perfumes',
            icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Skincare',
            short_name: 'Skincare',
            description: 'Ver produtos de skincare',
            url: '/?categoria=skincare',
            icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Ofertas',
            short_name: 'Ofertas',
            description: 'Produtos em promoção',
            url: '/?ordenar=price-asc',
            icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      devOptions: {
        // SW em desenvolvimento: ajuda a testar offline sem sujar o build.
        enabled: false,
        navigateFallback: '/offline.html',
        type: 'module',
      },
      workbox: {
        // Só entram no precache arquivos do build — nada de node_modules solto.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,ico,json}'],
        globDirectory: 'dist',
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/sw\.js$/, /^\/manifest\.webmanifest$/],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // Compatível com a grande maioria dos aparelhos em uso no Brasil.
    target: 'es2019',
    cssTarget: 'chrome63',
    // Sem sourcemap em produção: não vaza o código e o build fica menor.
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 700,
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase') || id.includes('@firebase') || id.includes('@grpc')) {
            return 'vendor-firebase';
          }
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) {
            return 'vendor-motion';
          }
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('qrcode.react') || id.includes('qrcode-generator')) return 'vendor-qrcode';
          if (id.includes('workbox')) return 'vendor-workbox';
          if (
            id.includes('react') ||
            id.includes('scheduler') ||
            id.includes('clsx') ||
            id.includes('tailwind-merge')
          ) {
            return 'vendor-react';
          }
          return 'vendor';
        },
      },
    },
  },
  server: {
    // 0.0.0.0 para funcionar em preview/proxy e em aparelho na mesma rede.
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Permite acessar o dev server por proxy/túnel (o Vite 7 bloqueia hosts
    // desconhecidos por padrão).
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
