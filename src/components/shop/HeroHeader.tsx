import { memo } from 'react';
import { MapPin } from 'lucide-react';
import { CATEGORIES, SITE } from '../../config/site';

/**
 * Faixa institucional.
 *
 * Mudança de SEO importante: aqui mora o `<h1>` da página (nome da loja + o
 * que ela vende + cidade). Antes a página inteira não tinha nenhum `<h1>` —
 * o Google usa a hierarquia de títulos para entender o assunto, e sem `<h1>`
 * a loja competia por termos errados.
 */

const HIGHLIGHTS = CATEGORIES.filter((c) => c.id !== 'todos').slice(0, 4);

export const HeroHeader = memo(function HeroHeader({ productCount }: { productCount: number }) {
  return (
    <header className="relative mb-10 flex flex-col items-center justify-between gap-8 overflow-hidden rounded-[2rem] bg-slate p-8 text-white md:flex-row md:p-12">
      <div className="relative z-10 text-center md:text-left">
        <span className="mb-4 inline-block rounded-full border border-blue/20 bg-blue/20 px-4 py-1.5 text-[0.6rem] font-black tracking-[0.25em] text-blue-light uppercase italic">
          💎 Curadoria {SITE.name}
        </span>

        <h1 className="mb-4 text-3xl leading-[1.15] font-black italic sm:text-4xl md:text-5xl lg:text-6xl">
          Cosméticos e essências com{' '}
          <span className="text-blue">elegância em cada detalhe</span>
        </h1>

        <p className="mx-auto max-w-sm text-sm text-white/60 md:mx-0">
          Perfumes, skincare, maquiagem e cuidados pessoais selecionados um a um.
          {productCount > 0 ? ` ${productCount} produtos prontos para entrega.` : ''}
        </p>

        <div className="mt-6 inline-flex w-fit items-center gap-2 rounded-lg border border-rose/20 bg-rose/10 px-3 py-1.5 text-[0.6rem] font-bold tracking-widest text-rose-light uppercase">
          <MapPin size={12} strokeWidth={3} aria-hidden="true" />
          Entregas exclusivas em {SITE.address.city} - {SITE.address.state}
        </div>
      </div>

      <ul className="relative z-10 grid w-full grid-cols-2 gap-3 sm:gap-4 md:w-auto">
        {HIGHLIGHTS.map((cat) => (
          <li
            key={cat.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm"
          >
            <div className="mb-1 text-2xl" aria-hidden="true">
              {cat.icon}
            </div>
            <span className="text-[0.6rem] font-bold tracking-wider text-white/70 uppercase">
              {cat.label}
            </span>
          </li>
        ))}
      </ul>

      {/* Brilhos decorativos — fora do fluxo de acessibilidade */}
      <div
        className="pointer-events-none absolute -top-[60px] -right-[60px] h-80 w-80 rounded-full bg-blue/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-[-80px] left-[30%] h-60 w-60 rounded-full bg-rose/10 blur-3xl"
        aria-hidden="true"
      />
    </header>
  );
});
