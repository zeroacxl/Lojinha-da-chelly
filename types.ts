export interface Comment {
  id: number;
  user: string;
  text: string;
  stars: number;
  date: string;
}

export interface Product {
  fid?: string;
  name: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  category: string;
  description: string;
  image: string;
  rating: number;
  comments: Comment[];
  createdAt?: any;
}

export interface Demand {
  fid?: string;
  product: string;
  productId: string;
  user: string;
  whatsapp: string;
  date: string;
  createdAt?: any;
}

export interface CartItem extends Product {
  cartId: number;
  quantity: number;
}
