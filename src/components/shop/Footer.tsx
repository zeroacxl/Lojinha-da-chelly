import { memo } from 'react';
import { CATEGORIES, SITE } from '../../config/site';
import { adsEnabled } from '../../config/ads';
import { SparkleLogo } from '../ui/SparkleLogo';

/**
 * Rodapé.
 *
 * Serve a três propósitos ao mesmo tempo:
 *  1. SEO — links internos com texto descritivo para cada categoria e um
 *     parágrafo com termos que o cliente realmente busca ("perfume em Rio
 *     Branco", "pagar com Pix"). Texto natural, sem keyword stuffing.
 *  2. Confiança/legal — LGPD, privacidade e termos. O revisor do AdSense
 *     procura exatamente isto antes de aprovar a conta.
 *  3. Transparência de anúncios — o aviso só aparece quando o AdSense está
 *     configurado.
 */

interface FooterProps {
  onCategory: (id: string) => void;
  onOpenPolicy: (kind: 'privacy' | 'terms') => void;
  onInstall?: () => void;
  canInstall?: boolean;
}

export const Footer = memo(function Footer({
  onCategory,
  onOpenPolicy,
  onInstall,
  canInstall = false,
}: FooterProps) {
  const year = new Date().getFullYear();
  const showAdsNotice = adsEnabled();

  return (
    <footer className="mt-16 border-t border-slate-pale pt-12 md:mt-20" aria-labelledby="footer-title">
      <h2 id="footer-title" className="sr-only">
        Informações da loja e navegação
      </h2>

      <div className="grid gap-10 md:grid-cols-[1.4fr,1fr,1fr]">
        {/* Marca + texto indexável */}
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose to-blue p-1.5 text-white">
              <SparkleLogo />
            </span>
            <span className="text-base font-black text-slate italic">{SITE.name}</span>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-slate-soft">
            Loja de cosméticos, perfumes, essências, skincare e maquiagem em {SITE.address.city} —{' '}
            {SITE.address.state}. O pedido é combinado pelo WhatsApp e o pagamento é feito com Pix,
            com QR Code gerado na hora. Também entregamos produtos para cabelo e cuidados com o
            corpo.
          </p>

          {canInstall && onInstall && (
            <button
              type="button"
              onClick={onInstall}
              className="mt-5 rounded-2xl border-2 border-slate-pale px-5 py-2.5 text-[0.6rem] font-black tracking-widest text-slate-soft uppercase transition-colors hover:border-blue-light hover:text-blue"
            >
              📲 Instalar no celular
            </button>
          )}
        </div>

        {/* Categorias — links internos */}
        <nav aria-label="Categorias">
          <h3 className="mb-4 text-[0.6rem] font-black tracking-[0.25em] text-slate uppercase not-italic">
            Categorias
          </h3>
          <ul className="space-y-2.5">
            {CATEGORIES.filter((c) => c.id !== 'todos').map((cat) => (
              <li key={cat.id}>
                <a
                  href={`./?categoria=${encodeURIComponent(cat.id)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onCategory(cat.id);
                  }}
                  className="text-xs font-bold text-slate-soft transition-colors hover:text-blue"
                >
                  {cat.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Institucional */}
        <nav aria-label="Institucional">
          <h3 className="mb-4 text-[0.6rem] font-black tracking-[0.25em] text-slate uppercase not-italic">
            Institucional
          </h3>
          <ul className="space-y-2.5">
            <li>
              <button
                type="button"
                onClick={() => onOpenPolicy('privacy')}
                className="text-xs font-bold text-slate-soft transition-colors hover:text-blue"
              >
                Política de Privacidade
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onOpenPolicy('terms')}
                className="text-xs font-bold text-slate-soft transition-colors hover:text-blue"
              >
                Termos de Uso
              </button>
            </li>
            <li>
              <a
                href="#catalogo"
                className="text-xs font-bold text-slate-soft transition-colors hover:text-blue"
              >
                Ver todos os produtos
              </a>
            </li>
            <li>
              <span className="text-xs font-bold text-slate-soft">
                Atendimento em {SITE.address.city} - {SITE.address.state}
              </span>
            </li>
          </ul>
        </nav>
      </div>

      {showAdsNotice && (
        <p className="mt-10 rounded-2xl bg-slate-pale p-4 text-[0.65rem] leading-relaxed text-slate-soft">
          <strong className="text-slate">Sobre anúncios:</strong> este site exibe anúncios do Google
          AdSense. O Google e seus parceiros usam cookies para exibir anúncios com base nas suas
          visitas anteriores a este e a outros sites. Você pode desativar a personalização de
          anúncios em{' '}
          <a
            href="https://www.google.com/settings/ads"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-blue underline"
          >
            Configurações de Anúncios do Google
          </a>
          .
        </p>
      )}

      <div className="mt-8 flex flex-col items-center gap-2 border-t border-slate-pale pt-6 pb-10 text-center">
        <p className="text-[0.6rem] font-bold tracking-[0.2em] text-slate-soft/60 uppercase">
          © {year} {SITE.name} — Todos os direitos reservados
        </p>
        <p className="text-[0.55rem] tracking-wider text-slate-soft/40 uppercase">
          CNPJ/MF sob responsabilidade do lojista · {SITE.address.city}, {SITE.address.state} ·
          Brasil
        </p>
      </div>
    </footer>
  );
});
