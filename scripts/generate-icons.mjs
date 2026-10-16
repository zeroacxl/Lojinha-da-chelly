/**
 * Gera os ícones do PWA (PNG 8-bit RGBA) sem nenhuma dependência externa.
 *
 * Desenha a identidade da Chelly Shop: um "sparkle" (estrela de 4 pontas)
 * branco sobre um degradê diagonal rosa -> azul, com cantos arredondados.
 *
 * Uso:  node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'icons');

/* ------------------------------------------------------------------ *
 * Paleta da marca (mesma do @theme em src/index.css)
 * ------------------------------------------------------------------ */
const ROSE = [244, 63, 94]; // #f43f5e
const BLUE = [59, 130, 246]; // #3b82f6
const SLATE = [15, 23, 42]; // #0f172a
const WHITE = [255, 255, 255];

/* ------------------------------------------------------------------ *
 * Geometria do "sparkle": raio varia com o ângulo (4 pontas).
 * ------------------------------------------------------------------ */
function sparkleRadius(angle, outer, inner) {
  const a = ((angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  const mid = Math.PI / 4;
  // Interpolação suave entre a ponta (a = 0) e o "vale" (a = mid)
  const t = Math.min(a, mid - a) / mid; // 0 na ponta, 1 no vale
  const eased = t * t * (3 - 2 * t); // smoothstep
  return outer + (inner - outer) * eased;
}

function isInsideSparkle(dx, dy, outer, inner) {
  const r = Math.hypot(dx, dy);
  if (r === 0) return true;
  const angle = Math.atan2(dy, dx);
  return r <= sparkleRadius(angle, outer, inner);
}

/** Distância assinada para um retângulo arredondado (negativo = dentro). */
function roundedRectSDF(px, py, halfW, halfH, radius) {
  const qx = Math.abs(px) - (halfW - radius);
  const qy = Math.abs(py) - (halfH - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Renderiza um ícone.
 * @param {number} size        tamanho final em px
 * @param {object} opts
 * @param {boolean} opts.maskable  reserva "safe zone" de 20% (ícone adaptativo)
 * @param {boolean} opts.rounded   aplica cantos arredondados (não-maskable)
 * @param {number[]} opts.background cor de fundo sólida (usa degradê se omitida)
 */
function renderIcon(size, opts = {}) {
  const { maskable = false, rounded = true, background = null } = opts;
  // Renderizamos com supersampling 2x e reduzimos -> bordas suaves de verdade.
  const SS = 2;
  const W = size * SS;
  const H = size * SS;

  // Área útil do desenho: maskable precisa manter tudo dentro dos 80% centrais.
  const safe = maskable ? 0.8 : 1;
  const cornerRadius = maskable ? 0 : size * 0.22 * SS;

  const px = new Uint8Array(W * H * 4);

  // Centro e escala do sparkle
  const cx = W / 2;
  const cy = H / 2;
  const outer = (W * 0.42 * safe) / 2; // raio das pontas
  const inner = outer * 0.26; // raio dos "vales"

  // Sparkle menor (canto superior direito) e (canto inferior esquerdo)
  const miniOuter = outer * 0.34;
  const miniInner = miniOuter * 0.26;
  const miniOffset = outer * 0.92;

  const halfW = W / 2;
  const halfH = H / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dx = x - cx;
      const dy = y - cy;

      // ---- alpha do fundo (cantos arredondados / safe-zone maskable) ----
      let bgAlpha = 1;
      if (rounded && cornerRadius > 0) {
        const d = roundedRectSDF(dx, dy, halfW, halfH, cornerRadius);
        bgAlpha = clamp01(0.5 - d); // antialiasing de 1px
      }
      if (bgAlpha <= 0) {
        px[i + 3] = 0;
        continue;
      }

      // ---- cor de fundo: degradê diagonal rosa -> azul ----
      let r, g, b;
      if (background) {
        [r, g, b] = background;
      } else {
        const t = clamp01((x / W) * 0.65 + (y / H) * 0.35);
        r = lerp(ROSE[0], BLUE[0], t);
        g = lerp(ROSE[1], BLUE[1], t);
        b = lerp(ROSE[2], BLUE[2], t);
      }

      // ---- brilho radial suave no centro (dá profundidade) ----
      const glow = clamp01(1 - Math.hypot(dx, dy) / (W * 0.75));
      r = lerp(r, Math.min(255, r + 60), glow * 0.35);
      g = lerp(g, Math.min(255, g + 60), glow * 0.35);
      b = lerp(b, Math.min(255, b + 60), glow * 0.35);

      // ---- sparkle principal + dois menores ----
      const shapes = [
        { ox: 0, oy: 0, o: outer, in: inner, alpha: 1 },
        { ox: miniOffset, oy: -miniOffset, o: miniOuter, in: miniInner, alpha: 0.85 },
        { ox: -miniOffset, oy: miniOffset, o: miniOuter, in: miniInner, alpha: 0.85 },
      ];

      let coverage = 0;
      let shapeAlpha = 1;
      for (const s of shapes) {
        const ddx = dx - s.ox;
        const ddy = dy - s.oy;
        const dist = Math.hypot(ddx, ddy);
        // só avalia pixels próximos (performance)
        if (dist > s.o * 1.4) continue;
        const angle = Math.atan2(ddy, ddx);
        const edge = sparkleRadius(angle, s.o, s.in);
        const c = clamp01(edge - dist + 0.5) * s.alpha;
        if (c > coverage) {
          coverage = c;
          shapeAlpha = s.alpha;
        }
      }

      if (coverage > 0) {
        r = lerp(r, WHITE[0], coverage * shapeAlpha);
        g = lerp(g, WHITE[1], coverage * shapeAlpha);
        b = lerp(b, WHITE[2], coverage * shapeAlpha);
      }

      px[i] = Math.round(clamp01(r / 255) * 255);
      px[i + 1] = Math.round(clamp01(g / 255) * 255);
      px[i + 2] = Math.round(clamp01(b / 255) * 255);
      px[i + 3] = Math.round(bgAlpha * 255);
    }
  }

  // ---- downscale 2x -> 1x com média de área ----
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const s = ((y * SS + j) * W + (x * SS + i)) * 4;
          const a = px[s + 3] / 255;
          // pré-multiplica para o downscale não criar halo branco
          sr += px[s] * a;
          sg += px[s + 1] * a;
          sb += px[s + 2] * a;
          sa += a;
        }
      }
      const n = SS * SS;
      const alpha = sa / n;
      out[o] = alpha > 0 ? Math.round(sr / sa) : 0;
      out[o + 1] = alpha > 0 ? Math.round(sg / sa) : 0;
      out[o + 2] = alpha > 0 ? Math.round(sb / sa) : 0;
      out[o + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(out, size, size);
}

/* ------------------------------------------------------------------ *
 * Encoder PNG mínimo (RGBA 8-bit, sem interlace)
 * ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // filtro "None" (0) no início de cada scanline
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1
    );
  }

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 * Geração dos arquivos
 * ------------------------------------------------------------------ */
mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'maskable-icon-192x192.png', size: 192, maskable: true },
  { file: 'maskable-icon-512x512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false, background: ROSE },
  { file: 'favicon-96x96.png', size: 96, maskable: false },
];

for (const t of targets) {
  const png = renderIcon(t.size, {
    maskable: t.maskable,
    rounded: !t.maskable,
    background: t.background || null,
  });
  const dest = join(OUT_DIR, t.file);
  writeFileSync(dest, png);
  console.log(`✓ ${t.file.padEnd(28)} ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)} KB`);
}

// favicon.svg vetorial (nítido em qualquer densidade de tela)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f43f5e"/>
      <stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <path fill="#fff" d="M50 14 L57.5 42.5 L86 50 L57.5 57.5 L50 86 L42.5 57.5 L14 50 L42.5 42.5 Z"/>
  <path fill="#fff" opacity=".85" d="M76 16 L79 27 L90 30 L79 33 L76 44 L73 33 L62 30 L73 27 Z"/>
  <path fill="#fff" opacity=".85" d="M24 56 L27 67 L38 70 L27 73 L24 84 L21 73 L10 70 L21 67 Z"/>
</svg>
`;
writeFileSync(join(OUT_DIR, 'favicon.svg'), svg);
console.log(`✓ ${'favicon.svg'.padEnd(28)} vector   ${(svg.length / 1024).toFixed(1)} KB`);

// Ícone monocromático slate (usado em atalhos e splash de alguns SOs)
const mono = renderIcon(512, { maskable: false, rounded: true, background: SLATE });
writeFileSync(join(OUT_DIR, 'icon-mono-512.png'), mono);
console.log(`✓ ${'icon-mono-512.png'.padEnd(28)} 512x512  ${(mono.length / 1024).toFixed(1)} KB`);

console.log('\nÍcones gerados em public/icons/');
