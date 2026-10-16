import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudOff, RefreshCw, X } from 'lucide-react';

/**
 * Avisos finos no topo da tela: sem internet / nova versão do app.
 *
 * Sem isto, uma cliente com sinal fraco vê o catálogo "congelado" e acha que a
 * loja quebrou. Com isto, ela sabe exatamente o que está acontecendo e tem um
 * botão.
 */

interface StatusBannerProps {
  offline: boolean;
  updateReady: boolean;
  onApplyUpdate: () => void;
  onDismissUpdate: () => void;
}

export const StatusBanner = memo(function StatusBanner({
  offline,
  updateReady,
  onApplyUpdate,
  onDismissUpdate,
}: StatusBannerProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[95] flex flex-col items-center gap-2 px-3"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 76px)' }}
      aria-live="polite"
    >
      <AnimatePresence>
        {offline && (
          <motion.p
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-[0.6rem] font-black tracking-widest text-white uppercase shadow-lg"
          >
            <CloudOff size={13} aria-hidden="true" />
            Sem conexão — mostrando o catálogo salvo
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {updateReady && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate py-2 pr-2 pl-4 text-white shadow-xl"
          >
            <span className="text-[0.6rem] font-black tracking-widest uppercase">
              Nova versão do app
            </span>
            <button
              type="button"
              onClick={onApplyUpdate}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[0.55rem] font-black tracking-widest text-slate uppercase transition-colors hover:bg-blue hover:text-white"
            >
              <RefreshCw size={11} aria-hidden="true" /> Atualizar
            </button>
            <button
              type="button"
              onClick={onDismissUpdate}
              aria-label="Depois"
              className="rounded-full p-1.5 text-white/50 transition-colors hover:text-white"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
