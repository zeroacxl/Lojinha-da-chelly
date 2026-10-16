/**
 * Sanitização e validação de entrada.
 *
 * Regra de ouro: NENHUM dado digitado pelo usuário (ou vindo do Firestore)
 * entra na tela sem passar por aqui. React já escapa texto, mas nós também
 * aplicamos uma CSP sem `unsafe-inline`, cortamos tamanho e removemos
 * caracteres de controle — isso protege de:
 *   • XSS armazenado via avaliação de produto / nome de produto
 *   • injeção de HTML em campos curtos
 *   • abuso de cota (payload de 1 MB escrito no Firestore)
 *   • URL maliciosa em `javascript:` / `data:` vinda de um campo de imagem
 */

/** Limites de tamanho por campo (em caracteres). */
export const LIMITS = {
  name: 60,
  description: 600,
  comment: 500,
  userName: 40,
  search: 50,
  street: 80,
  district: 60,
  city: 40,
  number: 10,
  phone: 15,
  pixKey: 77, // maior chave Pix possível (e-mail/EVP cabem folgados)
} as const;

/** Remove tags, caracteres de controle/invisíveis e normaliza espaços. */
export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return '';

  let out = input;

  // Tags HTML/XML.
  // Passamos várias vezes porque uma tag quebrada se reconstrói sozinha:
  // "<scri<script>pt>" vira "<script>" depois da primeira remoção — foi assim
  // que filtros ingênuos de fórum foram burlados por anos.
  for (let i = 0; i < 6 && out.includes('<'); i++) {
    const stripped = out.replace(/<[^>]*>/g, '');
    if (stripped === out) break;
    out = stripped;
  }
  // O que sobrou são "<" e ">" soltos (nunca formaram tag). Sem eles não há
  // como montar markup nem confundir um leitor de tela.
  out = out.replace(/[<>]/g, '');

  out = out
    // caracteres de controle, BOM, zero-width e bidirecionais (spoofing)
    .replace(/[\u0000-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    // entidades HTML comuns -> texto puro (evita "&lt;script&gt;" sobreviver)
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, ' ');

  // Colapsa espaços repetidos e aparas as pontas.
  out = out.replace(/\s{2,}/g, ' ').trim();

  // Corta por código (não por unidade UTF-16) para não partir emoji ao meio.
  return truncateByCodePoint(out, maxLength);
}

/** Corta respeitando code points (emoji e acentos não viram lixo). */
export function truncateByCodePoint(input: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  const points = Array.from(input);
  return points.length <= maxLength ? points.join('') : points.slice(0, maxLength).join('');
}

/** Mantém apenas dígitos. */
export function digitsOnly(input: unknown): string {
  return typeof input === 'string' ? input.replace(/\D/g, '') : '';
}

/**
 * Número de WhatsApp no formato internacional exigido pelo wa.me:
 * 55 + DDD + número, sem o zero de discagem e sem símbolos.
 * Aceita entrada bagunçada ("(68) 99999-9999", "068999999999", "556899999999").
 */
export function normalizeWhatsApp(input: unknown): string {
  let n = digitsOnly(input);
  if (!n) return '';

  // Remove zeros de discagem à esquerda.
  n = n.replace(/^0+/, '');

  // Sem código do país -> assume Brasil.
  if (n.length <= 11) n = '55' + n;
  // "550DDD..." -> o zero sobrou depois do 55.
  else if (n.startsWith('550')) n = '55' + n.slice(3);

  return n.slice(0, 15);
}

/**
 * Chave Pix: aceita CPF/CNPJ/telefone (só dígitos) ou e-mail/EVP aleatória.
 * Nunca deixa passar tag, espaço ou caractere de controle.
 */
export function sanitizePixKey(input: unknown): string {
  if (typeof input !== 'string') return '';
  const raw = input.trim();
  if (!raw) return '';

  // E-mail: sempre minúsculas (o Pix não diferencia caixa).
  if (raw.includes('@')) {
    return raw.toLowerCase().replace(/[^\w.@+-]/g, '').slice(0, LIMITS.pixKey);
  }

  // Chave aleatória (EVP): UUID canônico em minúsculas.
  // Importante reconhecer antes do caso numérico — senão as letras somem.
  const evp = raw.toLowerCase().match(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/
  );
  if (evp) {
    const hex = evp[0].replace(/-/g, '');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Telefone, CPF ou CNPJ: apenas dígitos.
  return raw.replace(/\D/g, '').slice(0, LIMITS.pixKey);
}

/** Protocolos permitidos em links/imagens vindos de dados externos. */
const SAFE_URL_PROTOCOLS = ['https:', 'http:', 'mailto:', 'tel:'];

/**
 * Devolve a URL apenas se o protocolo for seguro.
 * Bloqueia `javascript:`, `data:`, `vbscript:` etc.
 */
export function safeUrl(input: unknown, allowDataImage = false): string {
  if (typeof input !== 'string') return '';
  const value = input.trim().replace(/[\u0000-\u001F\u007F]/g, '');
  if (!value) return '';

  // URLs relativas e âncoras são inofensivas.
  if (value.startsWith('/') || value.startsWith('#') || value.startsWith('.')) return value;

  // `data:` não tem hostname: checamos direto, sem precisar de base.
  if (value.toLowerCase().startsWith('data:')) {
    if (!allowDataImage) return '';
    return /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(value) ? value : '';
  }

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : undefined;
    const url = new URL(value, base);
    return SAFE_URL_PROTOCOLS.includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}

/**
 * Imagem de produto: aceitamos https/http e `data:image/*`
 * (o painel administrativo comprime a foto e grava em base64 no Firestore).
 */
export function safeImageUrl(input: unknown): string {
  return safeUrl(input, true);
}

/** true quando a string parece um e-mail válido. */
export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(input.trim());
}

/** Estrelas de avaliação sempre entre 1 e 5, inteiro. */
export function clampStars(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 5;
  return Math.min(5, Math.max(1, n));
}

/** Número finito, não-negativo e dentro de um teto razoável. */
export function clampNumber(value: unknown, min = 0, max = 1_000_000): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Quantidade em estoque: inteiro entre 0 e 9999. */
export function clampStock(value: unknown): number {
  return Math.round(clampNumber(value, 0, 9999));
}

/** Preço: 2 casas, entre 0 e 99.999,99. */
export function clampPrice(value: unknown): number {
  const n = clampNumber(value, 0, 99999);
  return Math.round(n * 100) / 100;
}

/** Categoria válida (impede gravar categoria inexistente no banco). */
export function sanitizeCategory(value: unknown, allowed: readonly string[]): string {
  const v = typeof value === 'string' ? value.trim() : '';
  return allowed.includes(v) ? v : allowed[0];
}
