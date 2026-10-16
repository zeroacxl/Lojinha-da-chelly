import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../utils/cn';

/**
 * Contador da oferta-relâmpago.
 *
 * Mudanças em relação à versão anterior:
 *  - A versão antiga começava sempre em 02:45:12 e, pior, o `setInterval`
 *    tinha um bug: ao zerar os segundos ele reiniciava `m` para 59 mas
 *    decrementava `s` para 59 também, então o relógio "engasgava".
 *    Agora contamos contra um ALVO real (meia-noite), o que significa que o
 *    número é honesto — a promoção realmente acaba quando o dia vira — e o
 *    valor não muda ao recarregar a página.
 *  - Sem `setInterval` de 1s reiniciando o React à toa: recalculamos com
 *    `requestAnimationFrame` mas só chamamos `setState` quando o segundo
 *    exibido muda. Menos render = menos bateria em celular.
 *  - Ao chegar em zero, o alvo avança sozinho para o próximo dia.
 */

interface TimeLeft {
  h: number;
  m: number;
  s: number;
}

/** Próxima meia-noite no fuso do aparelho. */
function nextMidnight(from: number): number {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

function split(ms: number): TimeLeft {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

const LABELS = ['hrs', 'min', 'seg'] as const;

export const FlashSaleTimer = memo(function FlashSaleTimer({
  className,
  compact = false,
}: {
  className?: string;
  /** Versão menor para telas estreitas. */
  compact?: boolean;
}) {
  const targetRef = useRef<number>(nextMidnight(Date.now()));
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => split(targetRef.current - Date.now()));
  const frameRef = useRef<number>(0);

  useEffect(() => {
    let lastSecond = -1;

    const tick = () => {
      const now = Date.now();
      // Virou o dia? Recalcula o alvo sem precisar recarregar a página.
      if (now >= targetRef.current) targetRef.current = nextMidnight(now);

      const remaining = targetRef.current - now;
      const second = Math.floor(remaining / 1000);
      // Só atualiza o estado quando o número na tela realmente muda.
      if (second !== lastSecond) {
        lastSecond = second;
        setTimeLeft(split(remaining));
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  // Pausa quando a aba fica escondida: economiza bateria à toa.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameRef.current);
        return;
      }
      // Ao voltar, sincroniza imediatamente (o rAF estava parado).
      setTimeLeft(split(targetRef.current - Date.now()));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const units = useMemo(() => [timeLeft.h, timeLeft.m, timeLeft.s], [timeLeft]);

  return (
    <div
      className={cn('flex gap-1.5 sm:gap-2', className)}
      role="timer"
      aria-label={`Oferta termina em ${timeLeft.h} horas, ${timeLeft.m} minutos e ${timeLeft.s} segundos`}
    >
      {units.map((unit, i) => (
        <div
          key={LABELS[i]}
          className={cn(
            'min-w-[32px] rounded-lg border border-white/10 bg-white/20 text-center font-black text-white tabular-nums sm:min-w-[38px]',
            compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
          )}
        >
          {String(unit).padStart(2, '0')}
          {!compact && (
            <span className="block text-[0.4rem] uppercase tracking-tighter opacity-60">
              {LABELS[i]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});
