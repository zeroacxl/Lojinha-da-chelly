/**
 * Configuração do Google AdSense.
 *
 * ── COMO LIGAR A MONETIZAÇÃO ─────────────────────────────────────────────
 * 1. Crie a conta em https://www.google.com/adsense e cadastre o domínio.
 * 2. Copie o seu "ID de editor" (formato: ca-pub-0000000000000000).
 * 3. Informe-o de UMA destas duas formas:
 *      a) variável de ambiente  ->  VITE_ADSENSE_CLIENT=ca-pub-0000000000000000
 *      b) editando ADSENSE.clientId abaixo (troque a string vazia pelo ID)
 * 4. Crie os blocos de anúncio no painel do AdSense e cole os "slot" aqui.
 * 5. Publique o arquivo public/ads.txt na RAIZ do domínio
 *    (https://seudominio.com/ads.txt) com o seu publisher ID.
 *
 * Enquanto `clientId` estiver vazio NENHUM script do Google é carregado e
 * nenhum espaço de anúncio é reservado na página — a loja fica exatamente
 * como era antes, sem layout quebrado e sem requisições externas.
 */

export interface AdSenseConfig {
  /** ID de editor, ex.: "ca-pub-1234567890123456". Vazio = desligado. */
  clientId: string;
  /**
   * Slots dos blocos de anúncio. Deixe vazio ("") para usar blocos
   * automáticos (recomendado no início — o Google escolhe o lugar).
   */
  slots: {
    /** Banner logo abaixo da vitrine de destaque. */
    topBanner: string;
    /** Banner no meio da grade de produtos. */
    inFeed: string;
    /** Banner antes do rodapé / central de atendimento. */
    bottomBanner: string;
  };
  /**
   * true  -> deixa o Google posicionar os anúncios sozinho (Auto Ads).
   * false -> usa apenas os slots manuais definidos acima.
   */
  autoAds: boolean;
  /** Formatos permitidos nos blocos manuais. */
  format: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  /** Reserve espaço mesmo sem anúncio carregado? Evita "pulo" do layout (CLS). */
  reserveSpace: boolean;
}

export const ADSENSE: AdSenseConfig = {
  clientId: (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || '',
  slots: {
    topBanner: (import.meta.env.VITE_ADSENSE_SLOT_TOP as string | undefined)?.trim() || '',
    inFeed: (import.meta.env.VITE_ADSENSE_SLOT_FEED as string | undefined)?.trim() || '',
    bottomBanner: (import.meta.env.VITE_ADSENSE_SLOT_BOTTOM as string | undefined)?.trim() || '',
  },
  autoAds: true,
  format: 'auto',
  reserveSpace: true,
};

/** true quando há um ID de editor configurado. */
export const adsEnabled = (): boolean => /^ca-pub-\d{6,20}$/.test(ADSENSE.clientId);

/**
 * Política do AdSense + LGPD: o visitante precisa poder saber que a página
 * exibe anúncios e usar cookies. Guardamos a escolha em localStorage
 * (chave em utils/storage.ts).
 */
export const ADS_DISCLOSURE =
  'Este site exibe anúncios do Google AdSense e pode usar cookies para personalizar conteúdo e medir audiência.';
