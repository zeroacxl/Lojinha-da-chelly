import { memo, useEffect, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { Modal } from '../ui/Modal';

/**
 * Login do painel administrativo.
 *
 * ── O QUE FOI REMOVIDO (e por quê) ───────────────────────────────────────
 * Havia uma "senha de emergência" fixa no código (`MATport123`) e uma segunda
 * cópia dela escondida como string hexadecimal. Qualquer pessoa que abrir o
 * bundle publicado — basta Ver Código-Fonte no navegador — lê as duas e entra
 * no painel para apagar produtos. Ofuscar string não é segurança.
 *
 * Também não existe mais o `catch` que liberava o acesso quando o Firebase
 * estava fora do ar: isso transformava "banco indisponível" em "senha
 * qualquer serve".
 *
 * ── O QUE FICOU / FOI ADICIONADO ─────────────────────────────────────────
 *  - senha vinda do Firestore (`settings/admin`) com comparação em tempo
 *    constante;
 *  - rate limit com espera exponencial persistido em sessionStorage (recarregar
 *    a página não zera mais o bloqueio);
 *  - aviso claro de que a proteção real precisa estar nas Security Rules.
 */

interface AdminLoginModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<{ ok: boolean; message: string }>;
  lockedUntil: number;
  attemptsLeft: number;
  reducedMotion?: boolean;
}

export const AdminLoginModal = memo(function AdminLoginModal({
  open,
  onClose,
  onSubmit,
  lockedUntil,
  attemptsLeft,
  reducedMotion = false,
}: AdminLoginModalProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  /* Relógio só enquanto o modal está aberto (não gasta bateria à toa). */
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (open) {
      setPassword('');
      setMessage('');
      setBusy(false);
    }
  }, [open]);

  const lockedFor = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = lockedFor > 0;

  const submit = async () => {
    if (busy || locked) return;
    if (!password.trim()) {
      setMessage('Digite a senha do painel.');
      return;
    }
    setBusy(true);
    setMessage('');
    const result = await onSubmit(password);
    setBusy(false);
    setPassword('');
    if (!result.ok) setMessage(result.message);
    if (result.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="admin-title"
      maxWidth="max-w-sm"
      zIndex={200}
      reducedMotion={reducedMotion}
    >
      <div className="p-10 text-center sm:p-12">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 rounded-full p-1 text-slate-soft transition-colors hover:text-rose focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
          aria-label="Fechar"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate text-white"
          aria-hidden="true"
        >
          <Lock size={26} />
        </div>

        <h2 id="admin-title" className="mb-2 text-2xl font-black text-slate italic">
          Acesso Administrativo
        </h2>
        <p className="mb-8 text-[0.6rem] font-bold tracking-widest text-slate-soft uppercase">
          Área restrita da loja
        </p>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor="admin-password" className="sr-only">
              Senha do painel
            </label>
            <input
              id="admin-password"
              type="password"
              className="input-style text-center tracking-[0.3em]"
              placeholder="••••••••"
              autoComplete="current-password"
              inputMode="text"
              maxLength={72}
              autoFocus
              disabled={locked || busy}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(message)}
              aria-describedby="admin-help"
            />
          </div>

          <p id="admin-help" className="text-[0.55rem] leading-relaxed text-slate-soft/70">
            {locked
              ? `Bloqueado por segurança. Tente novamente em ${lockedFor}s.`
              : `${attemptsLeft} ${attemptsLeft === 1 ? 'tentativa restante' : 'tentativas restantes'} antes do bloqueio temporário.`}
          </p>

          {message && (
            <p role="alert" className="text-[0.65rem] font-bold text-rose italic">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={locked || busy}
            className="btn-primary w-full py-4 text-[0.75rem] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Verificando…' : locked ? `Aguarde ${lockedFor}s` : 'Acessar Painel'}
          </button>
        </form>

        <p className="mt-6 text-[0.5rem] leading-relaxed tracking-wider text-slate-soft/50 uppercase">
          A senha é verificada no Firestore (<code>settings/admin</code>). Para proteger de verdade,
          restrinja a escrita nas Security Rules — veja SEGURANCA.md.
        </p>
      </div>
    </Modal>
  );
});
