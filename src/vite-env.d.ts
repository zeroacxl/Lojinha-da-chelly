/// <reference types="vite/client" />

/**
 * Variáveis de ambiente usadas pela loja.
 *
 * Crie um arquivo `.env` na raiz do projeto (já ignorado pelo Git) com:
 *
 *   VITE_SITE_URL=https://seudominio.com
 *   VITE_ADSENSE_CLIENT=ca-pub-0000000000000000
 *   VITE_ADSENSE_SLOT_TOP=
 *   VITE_ADSENSE_SLOT_FEED=
 *   VITE_ADSENSE_SLOT_BOTTOM=
 *   VITE_INSTAGRAM_URL=https://instagram.com/seuperfil
 *
 * Nada aqui é segredo: qualquer `VITE_*` vai para o bundle público. Nunca
 * coloque chave privada de API nestas variáveis.
 */
interface ImportMetaEnv {
  /** Domínio público da loja (canonical, sitemap, Open Graph). */
  readonly VITE_SITE_URL?: string;
  /** ID de editor do AdSense, ex.: ca-pub-0000000000000000. */
  readonly VITE_ADSENSE_CLIENT?: string;
  /** Slots de anúncio (opcionais; vazio = blocos automáticos). */
  readonly VITE_ADSENSE_SLOT_TOP?: string;
  readonly VITE_ADSENSE_SLOT_FEED?: string;
  readonly VITE_ADSENSE_SLOT_BOTTOM?: string;
  /** Perfil do Instagram exibido no rodapé/central de atendimento. */
  readonly VITE_INSTAGRAM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
