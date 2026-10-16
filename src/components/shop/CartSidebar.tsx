import { memo, useMemo, useState } from 'react';
import {
  ChevronRight,
  Copy,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { CartItem, CheckoutStep } from '../../types';
import { cn } from '../../utils/cn';
import { fmt, generatePixPayload, waLink } from '../../utils/format';
import { LIMITS, sanitizeText } from '../../utils/sanitize';
import type { StoreConfig } from '../../config/site';
import { SITE } from '../../config/site';
import { Modal } from '../ui/Modal';
import type { StoredAddress } from '../../data/store';

/**
 * Sacola + checkout em 3 passos.
 *
 * ── CORREÇÃO CRÍTICA ─────────────────────────────────────────────────────
 * Antes, o botão "✅ Finalizar Pedido" mostrava um toast, esvaziava a sacola e
 * fechava a janela — sem mandar nada para a loja. O cliente achava que tinha
 * comprado e a Chelly nunca recebia o pedido. Agora "Finalizar Pedido" É o
 * envio pelo WhatsApp: o mesmo botão abre a conversa com o pedido pronto, e a
 * sacola só é limpa depois que o cliente confirma que enviou.
 *
 * Outras melhorias:
 *  - cada item guarda o preço do momento da adição (`unitPrice`), então uma
 *    mudança de preço no painel não corrompe uma sacola já aberta;
 *  - `cartId` em string única (antes era `Date.now()`, que colide quando dois
 *    itens entram no mesmo milissegundo);
 *  - campo "ponto de referência" no endereço — reduz entrega errada;
 *  - "Pix copia e cola" ao lado do QR Code (muita gente não consegue
 *    fotografar a tela do próprio celular);
 *  - QR Code memoizado: recalcular o CRC16 a cada tecla digitada no endereço
 *    travava o passo de pagamento;
 *  - sem anúncio em nenhuma etapa do pagamento.
 */

interface CartSidebarProps {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  total: number;
  step: CheckoutStep;
  onStepChange: (step: CheckoutStep) => void;
  address: StoredAddress;
  onAddressChange: (patch: Partial<StoredAddress>) => void;
  onUpdateQty: (cartId: string, delta: number) => void;
  onRemove: (cartId: string) => void;
  onClear: () => void;
  store: StoreConfig;
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  reducedMotion?: boolean;
}

const STEPS: CheckoutStep[] = ['cart', 'address', 'pix'];

const STEP_META: Record<CheckoutStep, { icon: string; title: string; hint: string }> = {
  cart: { icon: '🛍️', title: 'Sua Sacola', hint: 'Confira os itens e as quantidades' },
  address: { icon: '📍', title: 'Entrega', hint: 'Onde seu brilho vai chegar' },
  pix: { icon: '💳', title: 'Pagamento', hint: 'Pix ou combinado no WhatsApp' },
};

export const CartSidebar = memo(function CartSidebar({
  open,
  onClose,
  cart,
  total,
  step,
  onStepChange,
  address,
  onAddressChange,
  onUpdateQty,
  onRemove,
  onClear,
  store,
  onNotify,
  reducedMotion = false,
}: CartSidebarProps) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<'key' | 'payload' | null>(null);

  const meta = STEP_META[step];
  const stepIndex = STEPS.indexOf(step);
  const isEmpty = cart.length === 0;

  /* Payload do Pix — memoizado para não recalcular o CRC16 à toa. */
  const pixPayload = useMemo(() => {
    if (step !== 'pix' || total <= 0) return '';
    return generatePixPayload(store.pix, total, store.name || SITE.name, store.city || SITE.address.city);
  }, [step, total, store.pix, store.name, store.city]);

  /* Mensagem do pedido pronta para o WhatsApp. */
  const orderMessage = useMemo(() => {
    if (isEmpty) return '';
    const items = cart
      .map((item) => `• ${item.quantity}x ${item.name} — ${fmt(item.unitPrice * item.quantity)}`)
      .join('\n');
    const addressBlock = [
      address.rua && `${address.rua}${address.numero ? `, ${address.numero}` : ''}`,
      address.bairro,
      address.cidade,
    ]
      .filter(Boolean)
      .join(' - ');

    return [
      `Olá! Quero fechar meu pedido na ${store.name || SITE.name}:`,
      '',
      items,
      '',
      `*Total: ${fmt(total)}*`,
      '',
      addressBlock ? `*Endereço de entrega:*\n${addressBlock}` : '',
      address.referencia ? `*Ponto de referência:* ${address.referencia}` : '',
      '',
      'Forma de pagamento: Pix. Pode confirmar?',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }, [cart, total, address, store.name, isEmpty]);

  const sendOrder = () => {
    const link = waLink(store.wpp, orderMessage);
    if (!link) {
      onNotify('⚠️ WhatsApp da loja indisponível no momento', 'error');
      return;
    }
    // Abre em nova aba: o cliente não perde a sacola se o WhatsApp falhar.
    const opened = window.open(link, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(link);
    setConfirming(true);
  };

  const finishOrder = () => {
    onClear();
    setConfirming(false);
    onStepChange('cart');
    onClose();
    onNotify('🎉 Pedido enviado! Continuamos a conversa no WhatsApp.', 'success');
  };

  const goNext = () => {
    if (isEmpty) return;
    if (step === 'cart') {
      onStepChange('address');
      return;
    }
    if (step === 'address') {
      if (!address.rua.trim() || !address.numero.trim() || !address.bairro.trim()) {
        onNotify('⚠️ Preencha rua, número e bairro', 'error');
        return;
      }
      onStepChange('pix');
      return;
    }
    sendOrder();
  };

  const goBack = () => {
    if (step === 'pix') onStepChange('address');
    else if (step === 'address') onStepChange('cart');
  };

  const copy = async (value: string, which: 'key' | 'payload') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      onNotify(which === 'key' ? '✅ Chave Pix copiada!' : '✅ Código Pix copiado!', 'success');
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      onNotify('⚠️ Não foi possível copiar — selecione o texto manualmente', 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="right"
      labelledBy="cart-title"
      zIndex={100}
      reducedMotion={reducedMotion}
    >
      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-pale p-4 sm:p-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-light text-xl text-blue sm:h-12 sm:w-12"
            aria-hidden="true"
          >
            {meta.icon}
          </span>
          <div className="min-w-0">
            <h2 id="cart-title" className="truncate text-lg font-black text-slate italic sm:text-xl">
              {meta.title}
            </h2>
            <p className="truncate text-[0.6rem] font-bold tracking-wider text-slate-soft uppercase">
              {meta.hint}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-2 text-slate-soft transition-colors hover:text-rose focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
          aria-label="Fechar sacola"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      {/* ── Progresso ─────────────────────────────────────────────── */}
      <ol className="flex gap-2 px-4 py-3 sm:px-6" aria-label="Etapas do pedido">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={step === s ? 'step' : undefined}>
            <span
              className={cn(
                'block h-1 rounded-full transition-colors',
                i < stepIndex ? 'bg-blue' : step === s ? 'bg-rose' : 'bg-slate-pale'
              )}
            />
            <span className="sr-only">{STEP_META[s].title}</span>
          </li>
        ))}
      </ol>

      {/* ── Conteúdo ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
        {step === 'cart' &&
          (isEmpty ? (
            <div className="mt-16 flex flex-col items-center text-center text-slate-soft opacity-40">
              <ShoppingCart size={64} strokeWidth={1} className="mb-4" aria-hidden="true" />
              <p className="text-sm font-black tracking-widest uppercase italic">
                Sua sacola está vazia
              </p>
              <p className="mt-2 text-xs">Adicione produtos para começar o pedido.</p>
            </div>
          ) : (
            <ul className="space-y-5">
              {cart.map((item) => (
                <li key={item.cartId} className="flex gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-pale bg-slate-pale">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        width={80}
                        height={80}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 line-clamp-2 text-xs leading-tight font-black text-slate uppercase italic">
                      {item.name}
                    </h3>
                    <p className="mb-2 font-black text-blue italic">{fmt(item.unitPrice)}</p>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.cartId, -1)}
                        disabled={item.quantity <= 1}
                        aria-label={`Diminuir quantidade de ${item.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-pale text-slate transition-colors hover:bg-slate hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate"
                      >
                        <Minus size={14} aria-hidden="true" />
                      </button>
                      <span className="w-6 text-center text-sm font-black tabular-nums" aria-live="polite">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.cartId, 1)}
                        disabled={item.quantity >= (item.stock ?? 99)}
                        aria-label={`Aumentar quantidade de ${item.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-pale text-slate transition-colors hover:bg-slate hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate"
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                      <span className="ml-auto text-xs font-black text-slate tabular-nums">
                        {fmt(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemove(item.cartId)}
                    aria-label={`Remover ${item.name} da sacola`}
                    className="shrink-0 self-start rounded-lg p-2 text-slate-soft/40 transition-colors hover:text-rose focus-visible:ring-2 focus-visible:ring-rose focus-visible:outline-none"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {step === 'address' && (
          <div className="animate-fade-up space-y-5">
            <AddressField
              id="cart-street"
              label="Rua / Logradouro"
              placeholder="Ex: Av. Brasil"
              value={address.rua}
              maxLength={LIMITS.street}
              onChange={(v) => onAddressChange({ rua: v })}
              autoComplete="address-line1"
            />
            <div className="grid grid-cols-2 gap-4">
              <AddressField
                id="cart-number"
                label="Número"
                placeholder="123"
                value={address.numero}
                maxLength={LIMITS.number}
                inputMode="numeric"
                onChange={(v) => onAddressChange({ numero: v })}
                autoComplete="address-line2"
              />
              <AddressField
                id="cart-district"
                label="Bairro"
                placeholder="Centro"
                value={address.bairro}
                maxLength={LIMITS.district}
                onChange={(v) => onAddressChange({ bairro: v })}
              />
            </div>
            <AddressField
              id="cart-reference"
              label="Ponto de referência (opcional)"
              placeholder="Ex: portão azul, ao lado da padaria"
              value={address.referencia ?? ''}
              maxLength={LIMITS.street}
              onChange={(v) => onAddressChange({ referencia: v })}
            />
            <div>
              <label
                htmlFor="cart-city"
                className="mb-1.5 block text-[0.6rem] font-black tracking-widest text-slate-soft uppercase italic"
              >
                Cidade
              </label>
              <input
                id="cart-city"
                className="input-style cursor-not-allowed bg-slate-pale/60"
                value={`${SITE.address.city} - ${SITE.address.state}`}
                disabled
                readOnly
              />
              <p className="mt-1 text-[0.55rem] font-bold tracking-tight text-rose uppercase italic">
                * Entregamos exclusivamente em {SITE.address.city}.
              </p>
            </div>

            <p className="flex gap-3 rounded-2xl border border-blue-light bg-blue-light/50 p-4 text-xs leading-relaxed font-bold text-blue-dark italic">
              <span aria-hidden="true">🚚</span>
              Confira o endereço antes de avançar: não conseguimos redirecionar um pedido já
              despachado.
            </p>
          </div>
        )}

        {step === 'pix' && (
          <div className="animate-fade-up space-y-5">
            {/* Resumo */}
            <section className="rounded-[1.5rem] border border-slate-pale bg-white p-5">
              <h3 className="mb-3 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase italic">
                Resumo do Pedido
              </h3>
              <ul className="mb-2 max-h-36 space-y-2 overflow-y-auto pr-2 scrollbar-hide">
                {cart.map((item) => (
                  <li
                    key={item.cartId}
                    className="flex justify-between gap-4 border-b border-slate-pale pb-1 text-[0.65rem] last:border-0"
                  >
                    <span className="line-clamp-1 flex-1 font-bold text-slate-mid">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-black text-slate tabular-nums">
                      {fmt(item.unitPrice * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t-2 border-slate-pale pt-2">
                <span className="text-[0.7rem] font-black text-slate uppercase">Total Geral</span>
                <span className="font-black text-blue tabular-nums">{fmt(total)}</span>
              </div>
              {address.rua && (
                <p className="mt-3 text-[0.65rem] leading-relaxed text-slate-soft">
                  <strong className="text-slate-mid">Entrega:</strong> {address.rua}, {address.numero}{' '}
                  — {address.bairro}, {SITE.address.city}
                  {address.referencia ? ` (${address.referencia})` : ''}
                </p>
              )}
            </section>

            {/* Valor */}
            <div className="rounded-[1.5rem] border border-blue-light bg-gradient-to-br from-blue-light to-blue-light/50 p-6 text-center sm:p-8">
              <p className="mb-1 text-[0.6rem] font-black tracking-[0.2em] text-blue/60 uppercase">
                Total a pagar
              </p>
              <p className="text-3xl font-black text-blue-dark italic tabular-nums sm:text-4xl">
                {fmt(total)}
              </p>
            </div>

            {/* QR Code */}
            {pixPayload ? (
              <div className="rounded-[1.5rem] border border-slate-pale bg-white p-4 shadow-inner">
                <div className="flex justify-center">
                  <QRCodeSVG
                    value={pixPayload}
                    size={220}
                    level="H"
                    marginSize={2}
                    title={`QR Code Pix de ${fmt(total)} para ${store.name || SITE.name}`}
                  />
                </div>

                {/* Copia e cola */}
                <div className="mt-4">
                  <p className="mb-2 text-center text-[0.6rem] font-black tracking-widest text-slate-soft uppercase italic">
                    Pix copia e cola
                  </p>
                  <textarea
                    readOnly
                    value={pixPayload}
                    onFocus={(event) => event.target.select()}
                    rows={3}
                    aria-label="Código Pix copia e cola"
                    className="w-full resize-none rounded-2xl border border-slate-pale bg-slate-pale/60 p-3 font-mono text-[0.55rem] break-all text-slate-mid outline-none focus:border-blue-light"
                  />
                  <button
                    type="button"
                    onClick={() => copy(pixPayload, 'payload')}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate py-3 text-[0.65rem] font-black tracking-widest text-white uppercase transition-colors hover:bg-blue"
                  >
                    <Copy size={14} aria-hidden="true" />
                    {copied === 'payload' ? 'Copiado!' : 'Copiar código Pix'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900 italic">
                Não foi possível gerar o QR Code agora. Combine o pagamento direto no WhatsApp — o
                botão abaixo já leva seu pedido pronto.
              </p>
            )}

            {/* Chave */}
            <section className="rounded-[1.5rem] border border-slate-soft/10 bg-slate-pale p-5">
              <h3 className="mb-3 text-center text-[0.6rem] font-black tracking-widest text-slate-soft uppercase italic">
                Chave Pix
              </h3>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-pale bg-white px-4 py-3">
                <span className="min-w-0 truncate font-bold text-slate-mid">{store.pix}</span>
                <button
                  type="button"
                  onClick={() => copy(store.pix, 'key')}
                  aria-label="Copiar chave Pix"
                  className="shrink-0 rounded-lg p-1 text-blue transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
                >
                  <Copy size={18} aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-center text-[0.55rem] text-slate-soft">
                Recebedor: <strong>{store.name || SITE.name}</strong> — confira antes de pagar.
              </p>
            </section>

            <p className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed font-bold text-amber-900 italic">
              <span aria-hidden="true">⏰</span>
              Depois de pagar, envie o comprovante pelo WhatsApp: assim separamos seu pedido na hora.
            </p>
          </div>
        )}
      </div>

      {/* ── Rodapé fixo ───────────────────────────────────────────── */}
      {!isEmpty && (
        <div
          className="rounded-t-[2rem] border-t border-slate-pale bg-slate-pale/80 p-5 shadow-[0_-10px_40px_rgba(0,0,0,0.04)] sm:p-8"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {confirming ? (
            <div className="space-y-3">
              <p className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-xs leading-relaxed font-bold text-green-800">
                <ShoppingBag size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                Abrimos o WhatsApp com seu pedido pronto. Confira a mensagem, envie e confirme aqui
                para limparmos a sacola.
              </p>
              <button
                type="button"
                onClick={finishOrder}
                className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-[0.75rem]"
              >
                ✅ Já enviei o pedido
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={sendOrder}
                  className="flex-1 rounded-2xl border-2 border-slate-pale bg-white py-3 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase transition-colors hover:text-blue"
                >
                  Abrir de novo
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-2xl border-2 border-slate-pale bg-white py-3 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase transition-colors hover:text-rose"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <>
              {step === 'cart' && (
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-[0.65rem] font-black tracking-widest text-slate-soft uppercase italic">
                    Subtotal
                  </span>
                  <span className="text-xl font-black text-slate italic tabular-nums sm:text-2xl">
                    {fmt(total)}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={goNext}
                className={cn(
                  'btn-primary flex w-full items-center justify-center gap-2 py-4 text-[0.75rem]',
                  step === 'pix' && 'bg-[#25D366] shadow-green-500/20 hover:bg-[#1fb457]'
                )}
              >
                {step === 'pix' ? (
                  <>
                    <Phone size={18} aria-hidden="true" /> Enviar pedido no WhatsApp
                  </>
                ) : (
                  <>
                    {step === 'cart' ? 'Próximo Passo' : 'Ir para Pagamento'}
                    <ChevronRight size={18} aria-hidden="true" />
                  </>
                )}
              </button>

              <div className="mt-4 flex items-center justify-between gap-3">
                {step === 'cart' ? (
                  <button
                    type="button"
                    onClick={onClear}
                    className="text-[0.6rem] font-bold tracking-widest text-slate-soft uppercase transition-colors hover:text-rose"
                  >
                    Esvaziar sacola
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goBack}
                    className="text-[0.65rem] font-bold tracking-widest text-slate-soft uppercase transition-colors hover:text-slate"
                  >
                    ← Voltar
                  </button>
                )}
                <span className="text-[0.55rem] font-bold tracking-wider text-slate-soft/60 uppercase">
                  {cart.length} {cart.length === 1 ? 'produto' : 'produtos'}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
});

function AddressField({
  id,
  label,
  placeholder,
  value,
  onChange,
  maxLength,
  inputMode,
  autoComplete,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  inputMode?: 'text' | 'numeric';
  autoComplete?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[0.6rem] font-black tracking-widest text-slate-soft uppercase italic"
      >
        {label}
      </label>
      <input
        id={id}
        className="input-style"
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(event) => onChange(sanitizeText(event.target.value, maxLength))}
      />
    </div>
  );
}
