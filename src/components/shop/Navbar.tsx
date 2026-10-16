import { memo } from 'react';
import { Download, Lock, Search, ShoppingCart, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { SparkleLogo } from '../ui/SparkleLogo';
import { SITE } from '../../config/site';

/**
 * Barra de navegação fixa.
 *
 * Melhorias:
 *  - `header`/`nav` semânticos (o Google e leitores de tela entendem a página);
 *  - todos os botões têm `aria-label` — antes eram só ícones, invisíveis para
 *    quem usa leitor de tela;
 *  - respeita `env(safe-area-inset-top)`: no iPhone com notch o conteúdo não
 *    fica mais atrás da barra de status;
 *  - badge da sacola com `aria-live` para anunciar mudança de quantidade;
 *  - botão "instalar app" só aparece quando o aparelho suporta.
 */

interface NavbarProps {
  cartCount: number;
  cartUnits: number;
  isAdmin: boolean;
  canInstall: boolean;
  searchOpen: boolean;
  onOpenCart: () => void;
  onToggleAdmin: () => void;
  onInstall: () => void;
  onToggleSearch: () => void;
  onHome: () => void;
}

export const Navbar = memo(function Navbar({
  cartCount,
  cartUnits,
  isAdmin,
  canInstall,
  searchOpen,
  onOpenCart,
  onToggleAdmin,
  onInstall,
  onToggleSearch,
  onHome,
}: NavbarProps) {
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-slate-pale bg-white/95 backdrop-blur-sm"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <nav
        className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6"
        aria-label="Navegação principal"
      >
        <button
          type="button"
          onClick={onHome}
          className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-blue focus-visible:outline-none"
          aria-label={`${SITE.name} — página inicial`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose to-blue p-2 text-white shadow-lg shadow-rose/20">
            <SparkleLogo title={SITE.name} />
          </span>
          <span className="gradient-text hidden truncate text-xl font-black italic sm:block">
            {SITE.name}
          </span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Busca (abre o campo em telas pequenas) */}
          <button
            type="button"
            onClick={onToggleSearch}
            className="rounded-xl border border-slate-pale bg-slate-pale p-2.5 text-slate-soft transition-colors hover:bg-white hover:text-blue sm:hidden"
            aria-label={searchOpen ? 'Fechar busca' : 'Abrir busca'}
            aria-expanded={searchOpen}
          >
            {searchOpen ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
          </button>

          {/* Instalar como aplicativo */}
          {canInstall && (
            <button
              type="button"
              onClick={onInstall}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-rose to-blue px-3 py-2.5 text-[0.6rem] font-black tracking-widest text-white uppercase shadow-md shadow-rose/20 transition-transform hover:scale-105 active:scale-95"
              aria-label="Instalar a Chelly Shop como aplicativo no celular"
            >
              <Download size={16} aria-hidden="true" />
              <span className="hidden md:inline">Instalar app</span>
            </button>
          )}

          {/* Painel administrativo */}
          <button
            type="button"
            onClick={onToggleAdmin}
            className={cn(
              'rounded-xl border border-slate-pale bg-slate-pale p-2.5 text-slate-soft transition-colors hover:bg-white hover:text-blue',
              isAdmin && 'border-transparent bg-slate text-white hover:bg-slate hover:text-white'
            )}
            aria-label={isAdmin ? 'Sair do painel administrativo' : 'Abrir painel administrativo'}
            aria-pressed={isAdmin}
          >
            <Lock size={18} aria-hidden="true" />
          </button>

          {/* Sacola */}
          <button
            type="button"
            onClick={onOpenCart}
            className="relative rounded-xl border-2 border-blue-light bg-white p-2.5 text-blue shadow-sm transition-transform hover:scale-105 active:scale-95"
            aria-label={`Sacola de compras${cartUnits > 0 ? ` com ${cartUnits} ${cartUnits === 1 ? 'item' : 'itens'}` : ' vazia'}`}
          >
            <ShoppingCart size={20} aria-hidden="true" />
            {cartCount > 0 && (
              <span
                className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-rose text-[10px] font-black text-white"
                aria-live="polite"
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </nav>
    </header>
  );
});
