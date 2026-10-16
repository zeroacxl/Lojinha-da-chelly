/**
 * Formatação de valores exibidos na loja.
 * Tudo puro e testável — nenhum efeito colateral, nenhum acesso a DOM.
 */

import { LIMITS, clampPrice, digitsOnly, normalizeWhatsApp, sanitizePixKey, truncateByCodePoint } from './sanitize';

/* ------------------------------------------------------------------ *
 * Moeda
 * ------------------------------------------------------------------ */

const brlCache = new Map<string, Intl.NumberFormat>();

function brlFormatter(minimumFractionDigits: number): Intl.NumberFormat {
  const cached = brlCache.get(String(minimumFractionDigits));
  if (cached) return cached;
  const fmt = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits,
    maximumFractionDigits: 2,
  });
  brlCache.set(String(minimumFractionDigits), fmt);
  return fmt;
}

/**
 * Formata em Real brasileiro.
 * Usa `Intl.NumberFormat` quando disponível (separador de milhar correto:
 * "R$ 1.299,90") e cai num formato manual em navegadores antigos.
 */
export function fmt(value: unknown): string {
  const n = clampPrice(value);
  try {
    return brlFormatter(2).format(n);
  } catch {
    /* Intl indisponível/quebrado -> fallback abaixo */
  }
  return 'R$ ' + n.toFixed(2).replace('.', ',');
}

/** Percentual de desconto arredondado, 0 quando não há promoção. */
export function discountPercent(price: number, discountPrice?: number | null): number {
  const full = clampPrice(price);
  const promo = clampPrice(discountPrice ?? 0);
  if (full <= 0 || promo <= 0 || promo >= full) return 0;
  return Math.round(((full - promo) / full) * 100);
}

/** Preço efetivo cobrado (com promoção quando existir). */
export function finalPrice(price: number, discountPrice?: number | null): number {
  const promo = clampPrice(discountPrice ?? 0);
  return promo > 0 && promo < clampPrice(price) ? promo : clampPrice(price);
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

/** Data de hoje em pt-BR (dd/mm/aaaa) — usada nos registros do Firestore. */
export function today(): string {
  return new Date().toLocaleDateString('pt-BR');
}

/** "há 3 dias" / "hoje" — para selo de novidade e avaliações. */
export function relativeDate(input: unknown): string {
  const date = toDate(input);
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  return `há ${Math.floor(days / 365)} anos`;
}

/** Aceita Timestamp do Firestore (`toMillis()`), Date, ISO string ou número. */
export function toDate(input: unknown): Date | null {
  if (!input) return null;
  try {
    if (typeof (input as { toMillis?: unknown }).toMillis === 'function') {
      return new Date((input as { toMillis: () => number }).toMillis());
    }
    if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
    if (typeof input === 'number' || typeof input === 'string') {
      const d = new Date(input);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    // Timestamp do Firestore depois de um spread ({...doc.data()}): perde os
    // métodos e sobra `{ seconds, nanoseconds }`. Sem este caso, o selo "NOVO"
    // do produto nunca aparecia.
    const raw = input as { seconds?: unknown; nanoseconds?: unknown };
    if (typeof raw.seconds === 'number') {
      const d = new Date(raw.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  } catch {
    /* noop */
  }
  return null;
}

/** true se o produto foi criado nos últimos `days` dias. */
export function isNewerThan(input: unknown, days = 7): boolean {
  const d = toDate(input);
  if (!d) return false;
  const age = Date.now() - d.getTime();
  return age >= 0 && age < days * 86_400_000;
}

/* ------------------------------------------------------------------ *
 * Pix (padrão EMV do Banco Central — BR Code)
 * ------------------------------------------------------------------ */

const CRC16_POLY = 0x1021;
const CRC16_INIT = 0xffff;

function crc16CCITT(payload: string): string {
  let crc = CRC16_INIT;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) & 0xff) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ CRC16_POLY) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Campo EMV: ID (2 dígitos) + tamanho (2 dígitos) + valor. */
function emv(id: string, value: string): string {
  // O manual do BC limita cada campo a 99 caracteres.
  const v = truncateByCodePoint(value, 99);
  return id + String(v.length).padStart(2, '0') + v;
}

/**
 * Gera o "copia e cola" / QR Code Pix estático.
 *
 * Correções importantes em relação à versão anterior:
 *  - aceita chave que NÃO é telefone (e-mail e chave aleatória EVP têm letras
 *    e hífen — o `replace(/\D/g,'') antigo as destruía e o QR ficava inválido);
 *  - usa o valor `0000` no Merchant Category Code, como manda o manual;
 *  - remove acentos dos campos de nome/cidade (o leitor Pix só aceita
 *    caracteres do conjunto alfanumérico);
 *  - aplica o CRC16-CCITT com máscara 0xFFFF em cada passo (sem overflow).
 */
export function generatePixPayload(
  chave: unknown,
  valor: unknown,
  nome: unknown,
  cidade: unknown,
  txid = '***'
): string {
  const key = sanitizePixKey(chave);
  const amount = clampPrice(valor);
  const merchantName = deaccent(String(nome ?? '')).replace(/[^\w\s.-]/g, '').trim().slice(0, 25) || 'CHELLY SHOP';
  const merchantCity = deaccent(String(cidade ?? '')).replace(/[^\w\s.-]/g, '').trim().slice(0, 15) || 'RIO BRANCO';

  if (!key || amount <= 0) return '';

  const gui = emv('00', 'br.gov.bcb.pix');
  const keyField = emv('01', key);
  const merchantAccount = emv('26', gui + keyField);
  const tid = String(txid ?? '').trim().slice(0, 25) || '***';
  const additionalData = emv('62', emv('05', tid));

  const partial =
    emv('00', '01') + // Payload Format Indicator
    merchantAccount +
    emv('52', '0000') + // Merchant Category Code
    emv('53', '986') + // Moeda: BRL
    emv('54', amount.toFixed(2)) + // Valor
    emv('58', 'BR') + // País
    emv('59', merchantName) +
    emv('60', merchantCity) +
    additionalData +
    '6304'; // ID do CRC + tamanho fixo 04

  return partial + crc16CCITT(partial);
}

/** Remove acentos sem depender de normalização Unicode (Android antigo). */
export function deaccent(input: string): string {
  const map: Record<string, string> = {
    á: 'a', à: 'a', ã: 'a', â: 'a', ä: 'a',
    é: 'e', ê: 'e', è: 'e', ë: 'e',
    í: 'i', î: 'i', ì: 'i', ï: 'i',
    ó: 'o', õ: 'o', ô: 'o', ò: 'o', ö: 'o',
    ú: 'u', û: 'u', ù: 'u', ü: 'u',
    ç: 'c', ñ: 'n',
  };
  let out = '';
  for (const ch of input) {
    const lower = ch.toLowerCase();
    const mapped = map[lower];
    if (!mapped) {
      out += ch;
      continue;
    }
    // preserva caixa alta
    out += ch === lower ? mapped : mapped.toUpperCase();
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

/** Link `wa.me` já com o número normalizado. */
export function waLink(phone: unknown, message?: string): string {
  const num = normalizeWhatsApp(phone);
  if (!num) return '';
  const base = `https://wa.me/${num}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/* ------------------------------------------------------------------ *
 * Imagens
 * ------------------------------------------------------------------ */

export const IMAGE_MAX_BYTES = 800 * 1024; // 800 KB por foto de produto

/** Tenta WebP e cai para JPEG quando o navegador não suporta WebP. */
function bestImageMime(canvas: HTMLCanvasElement): 'image/webp' | 'image/jpeg' {
  try {
    return canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
}

/**
 * Redimensiona + comprime a foto do produto antes de gravar no Firestore.
 *
 * Melhorias sobre a versão anterior:
 *  - não chama `toDataURL` 8 vezes (era o maior custo do upload);
 *    usa busca binária sobre a qualidade.
 *  - libera o ObjectURL também em caso de erro (sem vazamento de memória);
 *  - rejeita arquivo grande demais / tipo errado ANTES de carregar a imagem;
 *  - respeita `maxWidth`/`maxHeight` (fotos em retrato não estouram o banco).
 */
export function compressImage(
  fileOrUrl: File | string,
  maxWidth = 1400,
  maxHeight = 1750
): Promise<string> {
  return new Promise((resolve, reject) => {
    const isFile = typeof fileOrUrl !== 'string';

    if (isFile) {
      const file = fileOrUrl as File;
      if (!file.type.startsWith('image/')) {
        reject(new Error('Arquivo não é uma imagem'));
        return;
      }
      // 25 MB de teto: acima disso o navegador trava ao decodificar.
      if (file.size > 25 * 1024 * 1024) {
        reject(new Error('Imagem maior que 25 MB'));
        return;
      }
    }

    const objectUrl = isFile ? URL.createObjectURL(fileOrUrl as File) : null;
    const img = new Image();

    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    img.onload = () => {
      try {
        cleanup();
        if (!img.naturalWidth || !img.naturalHeight) {
          reject(new Error('Imagem vazia'));
          return;
        }

        const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponível neste navegador'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        const mime = bestImageMime(canvas);
        const estimateBytes = (dataUrl: string) => Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

        // Primeiro tenta a qualidade alta; se já couber, paramos aqui.
        let best = canvas.toDataURL(mime, 0.92);
        if (estimateBytes(best) <= IMAGE_MAX_BYTES) {
          resolve(best);
          return;
        }

        // Busca binária pela maior qualidade que cabe no orçamento.
        let low = 0.3;
        let high = 0.92;
        for (let i = 0; i < 5; i++) {
          const mid = (low + high) / 2;
          const attempt = canvas.toDataURL(mime, mid);
          if (estimateBytes(attempt) <= IMAGE_MAX_BYTES) {
            best = attempt;
            low = mid;
          } else {
            high = mid;
          }
        }

        // Ainda acima do teto? Reduz a dimensão e tenta uma última vez.
        if (estimateBytes(best) > IMAGE_MAX_BYTES && w > 700) {
          const small = document.createElement('canvas');
          small.width = Math.round(w * 0.7);
          small.height = Math.round(h * 0.7);
          const sctx = small.getContext('2d');
          if (sctx) {
            sctx.imageSmoothingEnabled = true;
            sctx.drawImage(img, 0, 0, small.width, small.height);
            best = small.toDataURL(mime, 0.7);
          }
        }

        resolve(best);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('Não foi possível carregar a imagem'));
    };

    // `crossOrigin` só é seguro/necessário para URL externa; em blob ele é ignorado.
    if (!isFile) {
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
    }
    img.decoding = 'async';
    img.src = objectUrl ?? String(fileOrUrl);
  });
}

/* ------------------------------------------------------------------ *
 * Texto
 * ------------------------------------------------------------------ */

/** Limita o texto exibido (com reticências) sem partir code points. */
export function ellipsis(input: unknown, maxLength: number): string {
  const s = String(input ?? '');
  const points = Array.from(s);
  return points.length <= maxLength ? s : points.slice(0, Math.max(1, maxLength - 1)).join('') + '…';
}

/** Máscara leve de telefone para exibição: (68) 99999-9999. */
export function formatPhone(input: unknown): string {
  const n = digitsOnly(input);
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return String(input ?? '');
}

/* Reexporta os validadores mais usados junto com os formatadores, para os
 * componentes importarem de um módulo só. */
export { LIMITS, clampPrice, digitsOnly, normalizeWhatsApp, sanitizePixKey };
