import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import type { ToastState } from '../../types';

/**
 * Aviso flutuante.
 *
 * Acessibilidade: a região é `aria-live="polite"`, então leitores de tela
 * anunciam a mensagem sem interromper o que a pessoa estava fazendo. O
 * container fica SEMPRE montado (só o conteúdo entra e sai) — trocar o
 * `aria-live` de lugar faz o anúncio se perder.
 */
export const Toast = memo(function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  const tone = toast.tone ?? 'info';

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[1000] flex justify-center px-4 sm:bottom-10"
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      <AnimatePresence>
        {toast.show && toast.msg && (
          <motion.button
            type="button"
            onClick={onDismiss}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={cn(
              'pointer-events-auto max-w-full truncate rounded-full px-6 py-3 text-sm font-bold shadow-2xl',
              'focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:outline-none',
              tone === 'error'
                ? 'bg-rose text-white'
                : tone === 'success'
                  ? 'bg-slate text-white'
                  : 'bg-slate text-white'
            )}
          >
            {toast.msg}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});
