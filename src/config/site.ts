/**
 * Configuração central da loja.
 *
 * Tudo que muda entre ambientes / que o dono da loja pode querer ajustar
 * mora aqui — nada de valor "mágico" espalhado pelos componentes.
 */

/** Domínio público da loja. Troque quando publicar em domínio próprio. */
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'https://lojinha-da-chelly.vercel.app';

export const SITE = {
  name: 'Chelly Shop',
  shortName: 'Chelly',
  /** Aparece no <title>, no manifest e nos dados estruturados (JSON-LD). */
  title: 'Chelly Shop ✨ | Cosméticos, Perfumes e Essências em Rio Branco',
  description:
    'Loja online de cosméticos, perfumes, skincare, maquiagem e cuidados com o cabelo e o corpo em Rio Branco (AC). Compre pelo WhatsApp e pague com Pix.',
  keywords: [
    'cosméticos Rio Branco',
    'perfumes Rio Branco',
    'loja de cosméticos Acre',
    'skincare Rio Branco',
    'maquiagem online',
    'essências e perfumaria',
    'produtos de beleza Acre',
    'comprar perfume pelo WhatsApp',
    'Chelly Shop',
  ],
  locale: 'pt_BR',
  language: 'pt-BR',
  /** Cor da barra do navegador / splash screen do app instalado. */
  themeColor: '#f43f5e',
  backgroundColor: '#ffffff',
  author: 'Chelly Shop',
  /** Cidade/estado usados no texto e nos dados estruturados. */
  address: {
    city: 'Rio Branco',
    state: 'AC',
    country: 'BR',
  },
  social: {
    instagram: (import.meta.env.VITE_INSTAGRAM_URL as string | undefined) || '',
  },
} as const;

/** Categorias exibidas na vitrine. A primeira é sempre o filtro "Todos". */
export const CATEGORIES = [
  { id: 'todos', label: 'Todos', icon: '✨' },
  { id: 'perfumes', label: 'Perfumes', icon: '🌸' },
  { id: 'skincare', label: 'Skincare', icon: '✨' },
  { id: 'make', label: 'Maquiagem', icon: '💄' },
  { id: 'cabelo', label: 'Cabelo', icon: '💆‍♀️' },
  { id: 'corpo', label: 'Corpo', icon: '🧴' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

/**
 * Valores usados apenas quando o documento `settings/config` do Firestore
 * não está acessível (ex.: visitante offline). Não são segredos — a chave Pix
 * e o WhatsApp aparecem na tela de checkout de qualquer forma.
 */
export const FALLBACK = {
  pix: '06515285426',
  /**
   * Mantido exatamente como estava no código original.
   * OBS.: o valor ideal para o link wa.me é o formato internacional sem o
   * zero de discagem — ex.: 5568999999999 (55 + DDD + número).
   * `normalizeWhatsApp()` em utils/format.ts limpa o zero extra na hora de
   * montar o link, então tanto faz qual dos dois formatos vier do Firestore.
   */
  wpp: '5506515285426',
  name: SITE.name,
  city: 'Rio Branco',
} as const;

export const STORE_DEFAULTS = {
  pix: FALLBACK.pix,
  wpp: FALLBACK.wpp,
  name: FALLBACK.name,
  city: FALLBACK.city,
};

export interface StoreConfig {
  pix: string;
  wpp: string;
  name: string;
  city: string;
}
