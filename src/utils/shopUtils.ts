export const fmt = (n: number) => 
  'R$ ' + parseFloat(n.toString()).toFixed(2).replace('.', ',');

export const today = () => new Date().toLocaleDateString('pt-BR');

export const generatePixPayload = (chave: string, valor: number, nome: string, cidade: string) => {
  const c = chave.replace(/\D/g, '');
  const v = parseFloat(valor.toString()).toFixed(2);
  const f = (id: string, val: string) => id + String(val.length).padStart(2, '0') + val;
  
  let p = f('00', '01') + f('26', f('00', 'br.gov.bcb.pix') + f('01', c)) +
          f('52', '0000') + f('53', '986') + f('54', v) + f('58', 'BR') +
          f('59', nome.substring(0, 25)) + f('60', cidade.substring(0, 15)) +
          f('62', f('05', '***')) + '6304';
          
  let crc = 0xFFFF;
  for (let i = 0; i < p.length; i++) {
    crc ^= p.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return p + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

export const compressImage = (fileOrUrl: File | string, maxWidth = 1400): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(url);

      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No context');
      
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      const MAX_BYTES = 800 * 1024;
      const qualities = [0.92, 0.85, 0.78, 0.70, 0.62, 0.54, 0.45];
      let chosen = canvas.toDataURL('image/webp', 0.92);
      for (const q of qualities) {
        const attempt = canvas.toDataURL('image/webp', q);
        chosen = attempt;
        if (attempt.length * 0.75 <= MAX_BYTES) break;
      }
      resolve(chosen);
    };
    img.onerror = reject;
    img.src = url;
  });
};
