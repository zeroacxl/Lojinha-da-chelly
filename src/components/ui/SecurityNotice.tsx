import { memo } from 'react';

/**
 * Tela exibida quando a loja detecta que está dentro de um iframe de origem
 * desconhecida (clickjacking).
 *
 * Substitui o antigo "GuardBotOverlay". A diferença essencial: não acusamos o
 * visitante de ataque nem apagamos os dados dele — apenas explicamos o que
 * aconteceu e damos o caminho de volta. Na prática o caso real é alguém ter
 * embutido a loja num frame, e quem perde seria a própria loja.
 */
export const SecurityNotice = memo(function SecurityNotice() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate p-8 text-center text-white">
      <div
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-rose text-4xl"
        aria-hidden="true"
      >
        🛡️
      </div>
      <h1 className="mb-4 text-2xl font-black italic md:text-3xl">Página protegida</h1>
      <p className="max-w-sm text-[0.7rem] font-bold uppercase tracking-widest text-white/60">
        A Chelly Shop não pode ser exibida dentro de outro site. Abra o endereço diretamente no
        navegador para continuar comprando com segurança.
      </p>
      <a
        href="/"
        target="_top"
        rel="noopener noreferrer"
        className="mt-8 rounded-2xl bg-white px-8 py-3 text-[0.7rem] font-black uppercase tracking-widest text-slate transition-transform active:scale-95"
      >
        Abrir a loja
      </a>
      <p className="mt-8 font-mono text-[0.5rem] text-white/25">EMBED_BLOCKED · frame-ancestors</p>
    </div>
  );
});

/**
 * Alias mantido para compatibilidade com imports antigos.
 * @deprecated use `SecurityNotice`
 */
export const GuardBotOverlay = SecurityNotice;
