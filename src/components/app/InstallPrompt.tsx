import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Smartphone, X } from 'lucide-react';
import {
  getInstallState,
  hasInstallPrompt,
  isInstallSnoozed,
  isIOS,
  isStandalone,
  markInstallDismissed,
  promptInstall,
  supportsPwa,
} from '../../utils/pwa';
import { SITE } from '../../config/site';

/**
 * Convite para instalar a loja como aplicativo.
 *
 * Como funciona em cada aparelho:
 *  - Android/Chrome, Edge, Samsung Internet: o navegador dispara
 *    `beforeinstallprompt`. Guardamos o evento e mostramos nosso próprio
 *    convite, que converte muito mais que o infobar nativo.
 *  - iPhone/iPad (Safari): não existe `beforeinstallprompt`. Mostramos o
 *    passo a passo com o ícone "Compartilhar → Adicionar à Tela de Início".
 *    É exatamente assim que se instala um PWA no iOS.
 *  - Desktop: mesmo prompt nativo do Android.
 *  - Navegador sem suporte: nada aparece.
 *
 * Regras de educação com o visitante:
 *  - só aparece depois de 12 segundos ou da segunda visita (nunca no primeiro
 *    segundo, que é quando a pessoa ainda está decidindo se confia na loja);
 *  - se dispensar, não insistimos por 7 dias;
 *  - não aparece dentro do app já instalado.
 */

const DELAY_MS = 12_000;

interface InstallPromptProps {
  /** Abre o guia de instalação (botão da navbar/rodapé). */
  openSignal: number;
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

export const InstallPrompt = memo(function InstallPrompt({
  openSignal,
  onNotify,
}: InstallPromptProps) {
  const [visible, setVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (isStandalone() || !supportsPwa()) return;

    // Convite automático, com atraso e snooze.
    const timer = window.setTimeout(() => {
      if (isInstallSnoozed()) return;
      if (hasInstallPrompt() || isIOS()) setVisible(true);
    }, DELAY_MS);

    // Se o navegador oferecer o prompt depois do timeout, mostra também.
    const onAvailable = () => {
      if (!isInstallSnoozed()) setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setShowGuide(false);
      onNotify('📲 Aplicativo instalado! Agora ele abre direto da tela inicial.', 'success');
    };

    window.addEventListener('chelly:install-available', onAvailable);
    window.addEventListener('chelly:installed', onInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('chelly:install-available', onAvailable);
      window.removeEventListener('chelly:installed', onInstalled);
    };
  }, [onNotify]);

  // Botão "Instalar app" da navbar / rodapé.
  useEffect(() => {
    if (openSignal === 0) return;
    setShowGuide(true);
    setVisible(false);
  }, [openSignal]);

  const install = async () => {
    const result = await promptInstall();
    if (result === 'accepted') {
      setVisible(false);
      setShowGuide(false);
      onNotify('📲 Instalando o aplicativo…', 'success');
    } else if (result === 'dismissed') {
      snooze();
    } else {
      // Sem prompt nativo: mostra o passo a passo do aparelho.
      setShowGuide(true);
      setVisible(false);
    }
  };

  const snooze = () => {
    // Não insistir por 7 dias.
    markInstallDismissed(7);
    setVisible(false);
  };

  return (
    <>
      {/* Barra discreta no rodapé da tela */}
      <AnimatePresence>
        {visible && !showGuide && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed inset-x-3 bottom-3 z-[90] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:left-6 sm:max-w-sm"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            role="region"
            aria-label="Instalar aplicativo"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-slate-pale bg-white p-3 shadow-2xl">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose to-blue text-white"
                aria-hidden="true"
              >
                <Smartphone size={20} />
              </span>
              <p className="min-w-0 flex-1 text-[0.65rem] leading-snug font-bold text-slate">
                Instale a {SITE.name} no celular
                <span className="block text-[0.6rem] font-medium text-slate-soft">
                  Abre como app e funciona sem internet.
                </span>
              </p>
              <button
                type="button"
                onClick={() => void install()}
                className="shrink-0 rounded-xl bg-slate px-3.5 py-2.5 text-[0.55rem] font-black tracking-widest text-white uppercase transition-colors hover:bg-blue"
              >
                Instalar
              </button>
              <button
                type="button"
                onClick={snooze}
                aria-label="Agora não"
                className="shrink-0 rounded-lg p-1.5 text-slate-soft/60 transition-colors hover:text-rose"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guia de instalação (iOS e navegadores sem prompt) */}
      <AnimatePresence>
        {showGuide && (
          <div className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:p-4">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGuide(false)}
              className="absolute inset-0 cursor-default bg-slate/80 backdrop-blur-sm"
              aria-label="Fechar guia de instalação"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="install-title"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-white p-7 shadow-2xl sm:rounded-[2rem]"
              style={{ paddingBottom: 'calc(1.75rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose to-blue text-white"
                    aria-hidden="true"
                  >
                    <Download size={22} />
                  </span>
                  <div>
                    <h2 id="install-title" className="text-xl font-black text-slate italic">
                      Instalar no celular
                    </h2>
                    <p className="text-[0.6rem] font-bold tracking-widest text-slate-soft uppercase">
                      Leva menos de 10 segundos
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="rounded-full p-1.5 text-slate-soft transition-colors hover:text-rose"
                  aria-label="Fechar"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              {getInstallState() === 'prompt-available' ? (
                <ol className="space-y-3 text-sm text-slate-mid">
                  <Step n={1}>Toque em “Instalar aplicativo” abaixo.</Step>
                  <Step n={2}>Confirme em “Instalar” na janela do sistema.</Step>
                  <Step n={3}>O ícone da {SITE.shortName} aparece na sua tela inicial.</Step>
                </ol>
              ) : isIOS() ? (
                <ol className="space-y-3 text-sm text-slate-mid">
                  <Step n={1} icon="⎋">
                    No Safari, toque no botão <strong>Compartilhar</strong> (quadrado com seta para
                    cima), na barra de baixo.
                  </Step>
                  <Step n={2} icon="＋">
                    Role a lista e toque em <strong>“Adicionar à Tela de Início”</strong>.
                  </Step>
                  <Step n={3} icon="✓">
                    Confirme em <strong>“Adicionar”</strong>. O ícone da {SITE.shortName} fica na sua
                    tela inicial e abre em tela cheia, sem a barra do Safari.
                  </Step>
                </ol>
              ) : (
                <ol className="space-y-3 text-sm text-slate-mid">
                  <Step n={1} icon="⋮">
                    Toque no menu do navegador (três pontos ou três linhas), no canto superior.
                  </Step>
                  <Step n={2} icon="＋">
                    Escolha <strong>“Instalar aplicativo”</strong>, <strong>“Adicionar à tela
                    inicial”</strong> ou <strong>“Instalar página”</strong>.
                  </Step>
                  <Step n={3} icon="✓">
                    Confirme. O ícone da {SITE.shortName} aparece junto dos outros apps.
                  </Step>
                </ol>
              )}

              <ul className="mt-6 space-y-2 rounded-2xl bg-slate-pale p-4 text-[0.65rem] leading-relaxed text-slate-mid">
                <li className="flex gap-2">
                  <span aria-hidden="true">⚡</span> Abre mais rápido que o site (fica guardado no
                  aparelho).
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true">📴</span> Você continua vendo a última vitrine mesmo sem
                  sinal.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true">🛍️</span> Sua sacola e seus favoritos não se perdem ao
                  fechar.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true">🪶</span> Não ocupa espaço como um app de loja: são poucos
                  MB, sem instalar nada da Play Store.
                </li>
              </ul>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => void install()}
                  className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-[0.75rem]"
                >
                  <Download size={16} aria-hidden="true" /> Instalar aplicativo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    snooze();
                    setShowGuide(false);
                  }}
                  className="w-full text-center text-[0.6rem] font-bold tracking-widest text-slate-soft uppercase"
                >
                  Agora não
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
});

function Step({
  n,
  icon,
  children,
}: {
  n: number;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate text-xs font-black text-white"
        aria-hidden="true"
      >
        {icon ?? n}
      </span>
      <span className="pt-1 text-[0.8rem] leading-relaxed">{children}</span>
    </li>
  );
}
