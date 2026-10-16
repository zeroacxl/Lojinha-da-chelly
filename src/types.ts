/**
 * Tipos de domínio da loja.
 *
 * Regra: nada de `any`. Campos que vêm do Firestore e podem não existir são
 * opcionais (`?`) — assim o TypeScript obriga a tratar o caso "documento
 * antigo sem este campo", que era a causa de vários crashes silenciosos.
 */

/** Formato serializado de um Timestamp do Firestore. */
export interface TimestampLike {
  toMillis?: () => number;
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
}

export interface Comment {
  id: number;
  user: string;
  text: string;
  /** Inteiro de 1 a 5. */
  stars: number;
  /** Data em pt-BR (dd/mm/aaaa). */
  date: string;
}

/** IDs de categoria conhecidos. `string` ainda é aceito para dados antigos. */
export type CategoryId = 'perfumes' | 'skincare' | 'make' | 'cabelo' | 'corpo' | (string & {});

export interface Product {
  /** ID do documento no Firestore. */
  fid?: string;
  name: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  category: CategoryId;
  description?: string;
  /** https:// ou data:image/* gerado pela compressão local. */
  image?: string;
  /** Média das avaliações (1 a 5). */
  rating?: number;
  comments?: Comment[];
  createdAt?: TimestampLike | string | number | null;
  /** Marca o produto como oculto na vitrine sem apagar do banco. */
  hidden?: boolean;
  /** Última atualização gravada pelo painel. */
  updatedAt?: TimestampLike | string | number | null;
}

export interface Demand {
  fid?: string;
  product: string;
  productId?: string;
  user: string;
  whatsapp: string;
  date: string;
  createdAt?: TimestampLike | string | number | null;
}

/** Item dentro da sacola. */
export interface CartItem extends Product {
  /** Chave estável desta linha da sacola. */
  cartId: string;
  quantity: number;
  /** Preço unitário efetivo (com promoção aplicada) no momento da adição. */
  unitPrice: number;
}

export interface Address {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  /** Ponto de referência — reduz entrega errada. */
  referencia?: string;
}

export type CheckoutStep = 'cart' | 'address' | 'pix';

export type SortMode = 'newest' | 'price-asc' | 'price-desc' | 'rating';

export interface ToastState {
  msg: string;
  show: boolean;
  tone?: 'success' | 'error' | 'info';
}
