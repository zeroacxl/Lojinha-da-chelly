import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import type { Comment, Demand, Product } from '../types';
import { LIMITS, clampPrice, clampStars, clampStock, sanitizeCategory, sanitizeText } from '../utils/sanitize';
import { digitsOnly, today } from '../utils/format';
import { KNOWN_CATEGORIES, normalizeProduct } from './store';

/**
 * Escritas no Firestore.
 *
 * Tudo que SAI do aparelho para o banco passa por aqui, com validação antes de
 * gravar. Isso resolve três problemas reais:
 *  1. `NaN`, `undefined` e strings gigantes iam para o banco (o Firestore
 *     rejeita `undefined` e documentos >1 MB, então o admin via só "erro ao
 *     salvar" sem saber o motivo);
 *  2. não havia tratamento de erro por tipo (permissão negada, offline,
 *     índice ausente caíam todos no mesmo `catch` mudo);
 *  3. a avaliação era gravada reescrevendo o array inteiro de comentários, o
 *     que faz duas clientes avaliando ao mesmo tempo perderem uma avaliação.
 *     Agora usamos `arrayUnion`, que é atômico.
 *
 * Nada aqui muda a configuração do Firebase — só usa o `db` já exportado.
 */

export interface WriteResult {
  ok: boolean;
  message: string;
}

const ok = (message: string): WriteResult => ({ ok: true, message });
const fail = (message: string): WriteResult => ({ ok: false, message });

/** Traduz erros do Firestore em português útil. */
function describeError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'permission-denied') {
    return 'Sem permissão no Firestore. Confira as Security Rules.';
  }
  if (code === 'unavailable') {
    return 'Sem conexão com o servidor. Tente novamente em instantes.';
  }
  if (code === 'not-found') {
    return 'Este item não existe mais no catálogo.';
  }
  if (code === 'invalid-argument') {
    return 'Dados inválidos — confira os campos e tente de novo.';
  }
  if (code === 'failed-precondition') {
    return 'Falta um índice no Firestore para esta consulta.';
  }
  const message = (error as Error)?.message;
  return message ? message.slice(0, 120) : 'Erro inesperado ao gravar.';
}

export interface ProductPayload {
  fid?: string;
  name: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  category: string;
  description: string;
  image: string;
  hidden: boolean;
}

/** Cria ou atualiza um produto. */
export async function saveProduct(payload: ProductPayload): Promise<WriteResult> {
  const name = sanitizeText(payload.name, LIMITS.name);
  if (name.length < 2) return fail('Informe um nome com pelo menos 2 caracteres.');

  const price = clampPrice(payload.price);
  if (price <= 0) return fail('O preço precisa ser maior que zero.');

  const discount = clampPrice(payload.discountPrice ?? 0);
  const category = sanitizeCategory(payload.category, KNOWN_CATEGORIES);
  const description = sanitizeText(payload.description, LIMITS.description);
  const image = typeof payload.image === 'string' ? payload.image : '';
  const stock = clampStock(payload.stock);

  // Documento do Firestore tem teto de 1 MB; a foto em base64 é o que pesa.
  if (image.length > 1_200_000) {
    return fail('A foto ficou grande demais. Escolha outra imagem ou recorte antes.');
  }

  const data = {
    name,
    price,
    discountPrice: discount > 0 && discount < price ? discount : null,
    stock,
    category,
    description,
    image,
    hidden: payload.hidden === true,
    updatedAt: serverTimestamp(),
  };

  try {
    if (payload.fid) {
      await updateDoc(doc(db, 'products', payload.fid), data);
      return ok('Produto atualizado');
    }
    await addDoc(collection(db, 'products'), {
      ...data,
      createdAt: serverTimestamp(),
      rating: 5,
      comments: [],
    });
    return ok('Produto criado');
  } catch (error) {
    return fail(describeError(error));
  }
}

/** Remove um produto. */
export async function removeProduct(fid?: string): Promise<WriteResult> {
  if (!fid) return fail('Produto sem identificador.');
  try {
    await deleteDoc(doc(db, 'products', fid));
    return ok('Produto removido');
  } catch (error) {
    return fail(describeError(error));
  }
}

/** Oculta/mostra na vitrine sem perder avaliações. */
export async function toggleProductHidden(product: Product): Promise<WriteResult> {
  if (!product.fid) return fail('Produto sem identificador.');
  try {
    await updateDoc(doc(db, 'products', product.fid), {
      hidden: product.hidden !== true,
      updatedAt: serverTimestamp(),
    });
    return ok(product.hidden ? 'Produto visível na vitrine' : 'Produto oculto da vitrine');
  } catch (error) {
    return fail(describeError(error));
  }
}

/**
 * Publica uma avaliação.
 *
 * `arrayUnion` é atômico: duas pessoas avaliando ao mesmo tempo não se
 * sobrescrevem. Como efeito, a média precisa ser recalculada a partir do array
 * que já está no documento local (o snapshot em tempo real corrige em seguida).
 */
export async function addProductComment(
  product: Product,
  comment: Omit<Comment, 'id' | 'date'>
): Promise<WriteResult> {
  if (!product.fid) return fail('Produto sem identificador.');

  const user = sanitizeText(comment.user, LIMITS.userName);
  const text = sanitizeText(comment.text, LIMITS.comment);
  if (user.length < 2) return fail('Informe seu nome.');
  if (text.length < 3) return fail('Escreva uma avaliação com pelo menos 3 caracteres.');

  // Bloqueio simples de spam: link ou muitas maiúsculas seguidas.
  if (/https?:\/\/|www\./i.test(text)) return fail('Avaliações não podem conter links.');

  const entry = {
    id: Date.now(),
    user,
    text,
    stars: clampStars(comment.stars),
    date: today(),
  };

  const existing = Array.isArray(product.comments) ? product.comments : [];
  const updated = [...existing, entry];
  const average =
    updated.reduce((sum, c) => sum + clampStars(c.stars), 0) / Math.max(1, updated.length);

  try {
    await updateDoc(doc(db, 'products', product.fid), {
      // arrayUnion evita perder avaliação em escrita concorrente
      comments: arrayUnion(entry),
      rating: Math.round(Math.min(5, Math.max(1, average)) * 10) / 10,
      updatedAt: serverTimestamp(),
    });
    return ok('Avaliação publicada');
  } catch (error) {
    return fail(describeError(error));
  }
}

/** Registra uma solicitação de "me avise". */
export async function addDemand(payload: {
  product: Product;
  user: string;
  whatsapp: string;
}): Promise<WriteResult> {
  const user = sanitizeText(payload.user, LIMITS.userName);
  const whatsapp = digitsOnly(payload.whatsapp);

  if (user.length < 2) return fail('Informe seu nome.');
  if (whatsapp.length < 10 || whatsapp.length > 13) {
    return fail('Informe um WhatsApp válido com DDD.');
  }
  if (!payload.product?.fid) return fail('Produto indisponível.');

  const data: Omit<Demand, 'fid'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
    product: sanitizeText(payload.product.name, LIMITS.name),
    productId: payload.product.fid,
    user,
    whatsapp,
    date: today(),
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, 'demands'), data);
    return ok('Solicitação registrada');
  } catch (error) {
    return fail(describeError(error));
  }
}

/** Remove (arquiva) uma solicitação. */
export async function removeDemand(fid?: string): Promise<WriteResult> {
  if (!fid) return fail('Solicitação sem identificador.');
  try {
    await deleteDoc(doc(db, 'demands', fid));
    return ok('Solicitação removida');
  } catch (error) {
    return fail(describeError(error));
  }
}

export { describeError, normalizeProduct };
