import { memo } from 'react';
import { Phone, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { SITE } from '../../config/site';
import { waLink } from '../../utils/format';

/**
 * Central de atendimento + selos de confiança.
 *
 * - Os selos (Pix, entrega local, compra protegida) não são enfeite: são o que
 *   responde às três objeções que mais travam uma primeira compra em loja
 *   pequena. Também viram texto indexável.
 * - O botão do Instagram deixa de ser `href="#"` (link morto, ruim para SEO e
 *   para acessibilidade): se não houver perfil configurado, ele não aparece.
 * - `rel="noopener noreferrer"` em todo link externo (anti reverse-tabnabbing).
 */

interface SupportSectionProps {
  whatsapp: string;
  instagramUrl?: string;
}

const TRUST_ITEMS = [
  {
    icon: Wallet,
    title: 'Pagamento via Pix',
    text: 'QR Code gerado na hora, sem taxa e sem cadastro em site de terceiro.',
  },
  {
    icon: Truck,
    title: `Entrega em ${SITE.address.city}`,
    text: 'Entregamos exclusivamente na cidade, então seu pedido chega rápido.',
  },
  {
    icon: ShieldCheck,
    title: 'Compra combinada no WhatsApp',
    text: 'Você fala com uma pessoa de verdade antes de pagar. Sem surpresa.',
  },
] as const;

export const SupportSection = memo(function SupportSection({
  whatsapp,
  instagramUrl,
}: SupportSectionProps) {
  const contact = waLink(whatsapp);

  return (
    <section
      className="relative mt-16 overflow-hidden rounded-[2rem] border border-slate-pale bg-white p-8 text-center shadow-sm md:mt-24 md:rounded-[3rem] md:p-16"
      aria-labelledby="support-title"
    >
      <div className="relative z-10">
        <span className="mb-4 block text-[0.6rem] font-black tracking-[0.3em] text-blue uppercase italic md:text-[0.65rem]">
          Central de Atendimento
        </span>
        <h2
          id="support-title"
          className="mb-6 text-3xl font-black text-slate italic md:text-5xl"
        >
          Precisa de ajuda com
          <br className="hidden sm:block" /> seu pedido?
        </h2>
        <p className="mx-auto mb-10 max-w-lg text-sm text-slate-soft italic">
          Tiramos dúvidas sobre produtos, prazos de entrega e formas de pagamento. Resposta no mesmo
          dia, de segunda a sábado.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          {contact && (
            <a
              href={contact}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex w-full items-center justify-center gap-3 px-8 py-5 text-[0.7rem] sm:w-auto sm:px-10 sm:text-[0.8rem]"
            >
              <Phone size={18} aria-hidden="true" /> Chamar no WhatsApp
            </a>
          )}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-pale px-8 py-5 text-[0.65rem] font-black tracking-widest text-slate-soft uppercase transition-colors hover:bg-slate-pale sm:w-auto sm:px-10 sm:text-[0.7rem]"
            >
              <InstagramGlyph /> Seguir no Instagram
            </a>
          )}
        </div>

        {/* Selos de confiança */}
        <ul className="mt-12 grid gap-4 text-left sm:grid-cols-3 sm:gap-6">
          {TRUST_ITEMS.map((item) => (
            <li
              key={item.title}
              className="rounded-2xl border border-slate-pale bg-slate-pale/40 p-5"
            >
              <item.icon size={20} className="mb-3 text-blue" aria-hidden="true" />
              <h3 className="mb-1 text-xs font-black tracking-wider text-slate uppercase not-italic">
                {item.title}
              </h3>
              <p className="text-xs leading-relaxed text-slate-soft">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>

      <div
        className="pointer-events-none absolute top-0 right-0 h-64 w-64 bg-blue-light/20 blur-[100px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 bg-rose-light/20 blur-[100px]"
        aria-hidden="true"
      />
    </section>
  );
});


/**
 * Glifo do Instagram desenhado à mão.
 *
 * A versão do `lucide-react` usada aqui (1.x) não exporta mais ícones de marca
 * (Instagram, Facebook etc.) — bibliotecas de ícone removeram logos por questão
 * de marca registrada. Desenhar o glifo localmente evita adicionar uma
 * dependência só por um ícone.
 */
function InstagramGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
