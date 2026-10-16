import test from 'node:test';
import assert from 'node:assert/strict';

import * as F from '../../src/utils/format.ts';

/**
 * Testes do gerador de QR Code Pix.
 *
 * O Pix usa o padrão EMV do Banco Central: uma sequência de campos
 * `ID(2) + TAMANHO(2) + VALOR`, terminando no ID 63 com o CRC16-CCITT.
 * Um payload com CRC errado ou tamanho declarado errado é **recusado pelo
 * banco do cliente** — a venda simplesmente não acontece.
 */

/** CRC16-CCITT (0xFFFF inicial, polinômio 0x1021) independente da implementação. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) & 0xff) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

interface TlvField {
  id: string;
  len: number;
  value: string;
  sub?: TlvField[];
}

/** Percorre a cadeia EMV validando tamanho declarado de cada campo. */
function parseTlv(raw: string): TlvField[] {
  const out: TlvField[] = [];
  let i = 0;
  while (i + 4 <= raw.length) {
    const id = raw.slice(i, i + 2);
    const len = Number.parseInt(raw.slice(i + 2, i + 4), 10);
    assert.ok(Number.isFinite(len), `tamanho inválido no campo ${id}`);
    assert.ok(len <= 99, `campo ${id} acima do teto EMV (99)`);
    assert.ok(i + 4 + len <= raw.length, `campo ${id} truncado`);
    const value = raw.slice(i + 4, i + 4 + len);
    out.push({
      id,
      len,
      value,
      sub: id === '26' || id === '62' ? parseTlv(value) : undefined,
    });
    i += 4 + len;
  }
  assert.equal(i, raw.length, 'sobraram bytes fora de campo TLV');
  return out;
}

const byId = (fields: TlvField[], id: string) => fields.find((f) => f.id === id)?.value;

function assertValidPayload(payload: string) {
  assert.ok(payload.length > 0, 'payload vazio');
  assert.match(payload, /^[\x20-\x7E]+$/, 'payload com caractere fora do conjunto EMV');

  const body = payload.slice(0, -4);
  const crc = payload.slice(-4);
  assert.equal(crc, crc16(body), 'CRC16 não confere');

  const fields = parseTlv(payload);
  assert.equal(byId(fields, '00'), '01', 'Payload Format Indicator');
  assert.equal(byId(fields, '52'), '0000', 'Merchant Category Code');
  assert.equal(byId(fields, '53'), '986', 'moeda deve ser BRL');
  assert.equal(byId(fields, '58'), 'BR', 'país');
  assert.match(byId(fields, '54') ?? '', /^\d+\.\d{2}$/, 'valor com 2 casas');

  const name = byId(fields, '59') ?? '';
  const city = byId(fields, '60') ?? '';
  assert.ok(name.length > 0 && name.length <= 25, 'nome do recebedor (59)');
  assert.ok(city.length > 0 && city.length <= 15, 'cidade (60)');
  assert.doesNotMatch(name, /[^\x20-\x7E]/, 'nome com acento quebra o leitor Pix');
  assert.doesNotMatch(city, /[^\x20-\x7E]/, 'cidade com acento quebra o leitor Pix');

  const merchantAccount = fields.find((f) => f.id === '26');
  assert.ok(merchantAccount?.sub, 'campo 26 precisa ser composto');
  assert.equal(byId(merchantAccount.sub!, '00'), 'br.gov.bcb.pix', 'GUI do Pix');
  assert.ok((byId(merchantAccount.sub!, '01') ?? '').length > 0, 'chave Pix ausente');

  assert.ok(payload.includes('6304'), 'campo de CRC (63) ausente');
  return { fields, name, city, key: byId(merchantAccount.sub!, '01')! };
}

test('payload válido com chave telefone', () => {
  const { key } = assertValidPayload(
    F.generatePixPayload('68999999999', 89.9, 'Chelly Shop', 'Rio Branco')
  );
  assert.equal(key, '68999999999');
});

test('payload válido com chave CPF', () => {
  const { key } = assertValidPayload(
    F.generatePixPayload('123.456.789-09', 10, 'Maria da Silva', 'São Paulo')
  );
  assert.equal(key, '12345678909');
});

test('payload válido com chave e-mail', () => {
  // Regressão: o replace(/\D/g,'') antigo transformava "loja@exemplo.com" em
  // "lojaexemplocom" e o banco recusava o QR Code.
  const { key } = assertValidPayload(
    F.generatePixPayload('loja@exemplo.com', 1299.9, 'Chelly', 'Rio Branco')
  );
  assert.equal(key, 'loja@exemplo.com');
});

test('payload válido com chave aleatória (EVP)', () => {
  // Regressão: UUID era destruído pela remoção de tudo que não é dígito.
  const evp = '7d9f8a1b-2c3e-4f5a-6b7c-8d9e0f1a2b3c';
  const { key } = assertValidPayload(F.generatePixPayload(evp, 25, 'Chelly', 'Rio Branco'));
  assert.equal(key, evp);
});

test('remove acento do nome e da cidade do recebedor', () => {
  const { name, city } = assertValidPayload(
    F.generatePixPayload('68999999999', 10, 'Chelly Cosméticos', 'São Luís do Maranhão')
  );
  assert.equal(name, 'Chelly Cosmeticos');
  assert.equal(city, 'Sao Luis do Mar'); // limitado a 15 pelo manual do BC
});

test('trunca nome do recebedor em 25 caracteres', () => {
  const { name } = assertValidPayload(
    F.generatePixPayload(
      '68999999999',
      10,
      'Nome Muito Longo Que Ultrapassa o Limite Permitido',
      'Rio Branco'
    )
  );
  assert.ok(name.length <= 25);
});

test('valor sempre com duas casas', () => {
  const { fields } = assertValidPayload(
    F.generatePixPayload('68999999999', 10, 'Chelly', 'Rio Branco')
  );
  assert.equal(byId(fields, '54'), '10.00');
});

test('aceita txid customizado', () => {
  const payload = F.generatePixPayload('68999999999', 42, 'Chelly', 'Rio Branco', 'PEDIDO123');
  assert.ok(payload.includes('PEDIDO123'));
  assertValidPayload(payload);
});

test('rejeita entrada inválida em vez de gerar QR quebrado', () => {
  assert.equal(F.generatePixPayload('', 10, 'Chelly', 'Rio Branco'), '');
  assert.equal(F.generatePixPayload('68999999999', 0, 'Chelly', 'Rio Branco'), '');
  assert.equal(F.generatePixPayload('68999999999', -50, 'Chelly', 'Rio Branco'), '');
  assert.equal(F.generatePixPayload(null, 10, 'Chelly', 'Rio Branco'), '');
  assert.equal(F.generatePixPayload('68999999999', 'abc', 'Chelly', 'Rio Branco'), '');
});

test('payload é determinístico (mesmo CRC para a mesma entrada)', () => {
  const a = F.generatePixPayload('68999999999', 89.9, 'Chelly Shop', 'Rio Branco');
  const b = F.generatePixPayload('68999999999', 89.9, 'Chelly Shop', 'Rio Branco');
  assert.equal(a, b);
  assert.equal(a.slice(-4), 'F012'); // valor de referência validado no EMV
});
