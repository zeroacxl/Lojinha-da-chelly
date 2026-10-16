import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, MessageCircle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { waLink } from '../../utils/format';
import { SITE } from '../../config/site';

/**
 * Botões flutuantes: WhatsApp + voltar ao topo.
 *
 * - O scroll é ouvido como `passive` (não bloqueia a rolagem — era uma das
 *   causas de rolagem travada em Android de entrada).
 * - `window.scrollY` é lido dentro do handler, com um limiar, então o
 *   `setState` só roda quando o botão realmente precisa aparecer/desaparecer.
 * - Respeita `env(safe-area-inset-bottom)`: no iPhone não fica sob a barra.
 * - `aria-label` nos dois botões (antes eram só ícones).
 */

interface FloatingActionsProps {
  whatsapp: string;
  className?: string;
}

export const FloatingActions = memo(function FloatingActions({
  whatsapp,
  className,
}: FloatingActionsProps) {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const shouldShow = window.scrollY > 500;
        setShowTop((prev) => (prev === shouldShow ? prev : shouldShow));
        ticking = false;
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const contact = waLink(
    whatsapp,
    `Olá! Vim pelo site da ${SITE.name} e quero saber mais sobre os produtos ✨`
  );

  return (
    <div
      className={cn(
        'fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-3 sm:right-6 sm:bottom-6',
        className
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <AnimatePresence>
        {showTop && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Voltar ao topo da página"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-pale bg-white text-slate shadow-md transition-colors hover:text-blue"
          >
            <ChevronUp size={22} aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      {contact && (
        <a
          href={contact}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Falar com a ${SITE.name} no WhatsApp`}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-lg shadow-green-500/25 transition-transform hover:scale-105 active:scale-95"
        >
          <MessageCircle size={26} aria-hidden="true" />
        </a>
      )}
    </div>
  );
});
