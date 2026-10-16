import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { SITE } from './config/site';
import { captureInstallPrompt } from './utils/pwa';

/**
 * Ponto de entrada.
 *
 * Responsabilidades extras além de montar o React:
 *  1. Remover a tela de carregamento pintada no `index.html` (o `#boot`) —
 *     assim o usuário nunca vê dois loaders nem um flash branco.
 *  2. Carregar as fontes sem bloquear a primeira pintura. Não usamos o truque
 *     `media="print" onload=…` no HTML porque handler inline é bloqueado pela
 *     nossa CSP; aqui obtemos o mesmo resultado de forma permitida.
 *  3. Capturar o `beforeinstallprompt` o quanto antes — o evento pode disparar
 *     antes do React montar, e se perdermos não conseguimos mais oferecer o
 *     botão "Instalar app".
 *  4. Envolver tudo em ErrorBoundary: uma falha mostra uma tela explicada em
 *     português em vez de um aplicativo em branco.
 */

const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=DM+Sans:wght@400;500;700&display=swap';

function loadFonts(): void {
  if (typeof document === 'undefined') return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_URL;
  document.head.appendChild(link);
}

function hideBootScreen(): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.hidden = true;
  // Remove do DOM depois da transição para não deixar nó inútil.
  window.setTimeout(() => boot.remove(), 400);
}

captureInstallPrompt();

const container = document.getElementById('root');

if (!container) {
  // Sem container não há o que montar — informa em vez de falhar em silêncio.
  document.title = `${SITE.name} — erro de carregamento`;
  document.body.insertAdjacentHTML(
    'beforeend',
    '<p style="font-family:system-ui;padding:2rem;text-align:center">' +
      'Não foi possível iniciar a loja neste navegador. Atualize a página.</p>'
  );
} else {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );

  hideBootScreen();
  // Fontes depois da primeira pintura: o texto aparece na hora com a fonte do
  // sistema e troca suavemente quando a webfont chega (`display=swap`).
  const idle = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;

  if (typeof idle === 'function') idle(loadFonts, { timeout: 2000 });
  else window.setTimeout(loadFonts, 300);
}
