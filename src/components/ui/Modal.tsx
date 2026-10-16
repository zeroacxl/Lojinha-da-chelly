import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../utils/cn';

/**
 * Modal base acessível.
 *
 * O que faltava antes e agora existe:
 *  - `role="dialog"` + `aria-modal` + `aria-labelledby` (leitor de tela sabe
 *    que abriu uma janela e qual é o título dela);
 *  - foco preso dentro do modal (Tab não escapa para a página atrás);
 *  - foco devolvido ao elemento que abriu o modal ao fechar;
 *  - `Escape` fecha;
 *  - `overflow` do body travado, mas sem "pular" a página (compensamos a barra
 *    de rolagem com padding-right);
 *  - `env(safe-area-inset-*)`: no iPhone o conteúdo não fica sob a barra
 *    inferior;
 *  - uma única implementação — antes cada modal repetia overlay/animação.
 */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Título para `aria-labelledby`. Se não informado, geramos um id vazio. */
  labelledBy?: string;
  maxWidth?: string;
  /** 'center' (dialog central) ou 'right' (gaveta lateral). */
  variant?: 'center' | 'right' | 'bottom';
  className?: string;
  /** Índice z (os modais se sobrepõem em alguns fluxos). */
  zIndex?: number;
  /** Desliga animação (modo econômico / prefers-reduced-motion). */
  reducedMotion?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  maxWidth = 'max-w-5xl',
  variant = 'center',
  className,
  zIndex = 200,
  reducedMotion = false,
}: ModalProps) {
  const generatedId = useId();
  const titleId = labelledBy ?? `modal-title-${generatedId}`;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  /* Trava a rolagem do fundo */
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  /* Guarda quem abriu, foca o modal e devolve o foco ao fechar */
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    }, 40);

    return () => {
      window.clearTimeout(focusTimer);
      restoreFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  /* Escape fecha + Tab fica preso dentro do painel */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const panelVariants = {
    center: {
      initial: reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 24 },
      animate: reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 },
      exit: reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 24 },
      panelClass: cn(
        'relative w-full overflow-hidden rounded-[2rem] bg-white shadow-2xl md:rounded-[2.5rem]',
        maxWidth
      ),
      wrapperClass: 'flex items-end justify-center sm:items-center sm:p-4',
    },
    right: {
      initial: { x: '100%' },
      animate: { x: 0 },
      exit: { x: '100%' },
      panelClass: 'absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl',
      wrapperClass: '',
    },
    bottom: {
      initial: { y: '100%' },
      animate: { y: 0 },
      exit: { y: '100%' },
      panelClass: cn(
        'absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-[2rem] bg-white shadow-2xl',
        maxWidth
      ),
      wrapperClass: 'items-end',
    },
  } as const;

  const v = panelVariants[variant];

  return (
    <AnimatePresence>
      {open && (
        <div
          className={cn('fixed inset-0 flex', v.wrapperClass)}
          style={{
            zIndex,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate/80 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={v.initial}
            animate={v.animate}
            exit={v.exit}
            transition={
              variant === 'right' || variant === 'bottom'
                ? { type: reducedMotion ? 'tween' : 'spring', damping: 28, stiffness: 240, duration: reducedMotion ? 0 : undefined }
                : { duration: reducedMotion ? 0 : 0.25, ease: 'easeOut' }
            }
            className={cn(v.panelClass, className)}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
