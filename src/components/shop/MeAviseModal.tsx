import { memo, useCallback, useEffect, useState } from 'react';
import { Send, X } from 'lucide-react';
import type { Product } from '../../types';
import { digitsOnly, formatPhone } from '../../utils/format';
import { LIMITS, sanitizeText } from '../../utils/sanitize';
import { honeypotTripped } from '../../utils/security';
import { Modal } from '../ui/Modal';

/**
 * "Me avise quando chegar" — captura de demanda para produto esgotado.
 *
 * Melhorias:
 *  - campos controlados pelo React (antes lia via `document.getElementById`,
 *    o que não limpa o formulário e falha se o modal for remontado);
 *  - validação real de celular brasileiro (10 ou 11 dígitos após o DDD), com
 *    máscara enquanto digita — reduz cadastro errado e, portanto, demanda
 *    inútil no painel;
 *  - honeypot + limite de envios por minuto (anti-spam no Firestore, que é
 *    cobrado por escrita);
 *  - consentimento explícito LGPD: a loja só pode guardar nome/WhatsApp com
 *    uma base legal, e o consentimento é a mais simples.
 */

interface MeAviseModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { product: Product; user: string; whatsapp: string }) => Promise<boolean>;
  /** Segundos restantes de espera; > 0 desliga o botão. */
  cooldown: number;
  reducedMotion?: boolean;
}

export const MeAviseModal = memo(function MeAviseModal({
  product,
  open,
  onClose,
  onSubmit,
  cooldown,
  reducedMotion = false,
}: MeAviseModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setSending(false);
    }
  }, [open, product?.fid]);

  const digits = digitsOnly(phone);
  const phoneValid = digits.length === 10 || digits.length === 11;
  const nameValid = sanitizeText(name, LIMITS.userName).length >= 2;
  const canSubmit = nameValid && phoneValid && consent && !sending && cooldown === 0;

  const submit = useCallback(async () => {
    if (!product) return;
    if (honeypotTripped(honeypot)) return; // robô
    if (!nameValid) return setError('Informe seu nome (mínimo 2 letras).');
    if (!phoneValid) return setError('Informe um celular válido com DDD.');
    if (!consent) return setError('É preciso autorizar o contato para podermos avisar você.');

    setSending(true);
    setError('');
    const ok = await onSubmit({
      product,
      user: sanitizeText(name, LIMITS.userName),
      whatsapp: digits,
    });
    setSending(false);
    if (ok) {
      setName('');
      setPhone('');
      setConsent(false);
      setHoneypot('');
    }
  }, [product, honeypot, nameValid, phoneValid, consent, name, digits, onSubmit]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="meavise-title"
      maxWidth="max-w-sm"
      zIndex={200}
      reducedMotion={reducedMotion}
    >
      <div className="p-8 text-center sm:p-10">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 rounded-full p-1 text-slate-soft transition-colors hover:text-rose focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
          aria-label="Fechar"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-light text-3xl shadow-lg shadow-rose/10"
          aria-hidden="true"
        >
          🔔
        </div>

        <h2 id="meavise-title" className="mb-2 text-3xl font-black text-slate italic">
          Me Avise!
        </h2>
        <p className="mb-7 text-[0.7rem] leading-relaxed font-bold tracking-widest text-slate-soft uppercase">
          O item{' '}
          <span className="text-rose italic normal-case">
            {product ? sanitizeText(product.name, 40) : ''}
          </span>{' '}
          está esgotado. Deixe seu contato:
        </p>

        <form
          className="space-y-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor="meavise-name" className="sr-only">
              Seu nome
            </label>
            <input
              id="meavise-name"
              className="input-style"
              placeholder="Seu Nome"
              autoComplete="name"
              maxLength={LIMITS.userName}
              value={name}
              onChange={(event) => setName(sanitizeText(event.target.value, LIMITS.userName))}
              aria-invalid={name.length > 0 && !nameValid}
            />
          </div>

          <div>
            <label htmlFor="meavise-phone" className="sr-only">
              Seu WhatsApp com DDD
            </label>
            <input
              id="meavise-phone"
              className="input-style"
              placeholder="(68) 99999-9999"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={LIMITS.phone}
              value={phone}
              onChange={(event) => setPhone(maskPhone(event.target.value))}
              aria-invalid={phone.length > 0 && !phoneValid}
            />
            {digits.length > 0 && (
              <p className="mt-1 text-[0.55rem] font-bold text-slate-soft/60">
                {phoneValid ? `✓ ${formatPhone(digits)}` : `${digits.length}/11 dígitos (com DDD)`}
              </p>
            )}
          </div>

          {/* Honeypot — humano não vê, robô preenche. */}
          <div aria-hidden="true" className="hidden">
            <label htmlFor="meavise-hp">Não preencha</label>
            <input
              id="meavise-hp"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </div>

          {/* Consentimento LGPD */}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-pale bg-slate-pale/50 p-3.5">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-rose"
            />
            <span className="text-[0.6rem] leading-relaxed font-bold text-slate-mid">
              Autorizo a {''}
              <strong>Chelly Shop</strong> a usar meu nome e WhatsApp apenas para avisar quando este
              produto voltar ao estoque. Sei que posso pedir a exclusão a qualquer momento.
            </span>
          </label>

          {(error || cooldown > 0) && (
            <p role="alert" className="text-[0.65rem] font-bold text-rose italic">
              {error || `Aguarde ${cooldown}s para enviar outra solicitação.`}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-4 text-[0.75rem] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={16} aria-hidden="true" />
            {sending ? 'Enviando…' : 'Enviar Solicitação'}
          </button>
        </form>
      </div>
    </Modal>
  );
});

/** Máscara brasileira enquanto digita: (68) 99999-9999. */
function maskPhone(input: string): string {
  const d = digitsOnly(input).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
