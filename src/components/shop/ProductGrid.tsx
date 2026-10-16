import { Fragment, memo } from 'react';
import type { Product } from '../../types';
import { ProductCard } from './ProductCard';
import { SkeletonGrid } from '../ui/SkeletonCard';
import { AdSlot, FEED_AD_INTERVAL } from '../ads/AdSlot';
import { adsEnabled } from '../../config/ads';
import { SearchOff } from './SearchOff';

/**
 * Grade de produtos.
 *
 * - Cada card é `React.memo` e recebe handlers estáveis vindos do App:
 *   digitar na busca ou rolar a página não re-renderiza a grade inteira.
 * - Anúncio "in-feed" a cada `FEED_AD_INTERVAL` produtos, apenas quando o
 *   AdSense está configurado e nunca antes da primeira tela (regra do AdSense
 *   e de boa experiência).
 * - Estado vazio com ação clara (limpar filtros) em vez de só um texto.
 */

interface ProductGridProps {
  products: Product[];
  loading: boolean;
  favorites: string[];
  onDetail: (product: Product) => void;
  onAdd: (product: Product, qty: number) => void;
  onNotify: (product: Product) => void;
  onToggleFavorite: (product: Product) => void;
  onClearFilters: () => void;
}

const GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 md:gap-6';

function ProductGridBase({
  products,
  loading,
  favorites,
  onDetail,
  onAdd,
  onNotify,
  onToggleFavorite,
  onClearFilters,
}: ProductGridProps) {
  if (loading) return <SkeletonGrid count={10} />;
  if (products.length === 0) return <SearchOff onClearFilters={onClearFilters} />;

  const favoriteSet = new Set(favorites);
  const showFeedAd = adsEnabled();

  return (
    <div className={GRID_CLASS} id="catalogo">
      {products.map((product, index) => {
        const adBefore = showFeedAd && index >= FEED_AD_INTERVAL && index % FEED_AD_INTERVAL === 0;

        return (
          <Fragment key={product.fid ?? index}>
            {adBefore && (
              <div className="col-span-full">
                <AdSlot variant="inFeed" className="mx-auto max-w-md py-2" />
              </div>
            )}
            <ProductCard
              product={product}
              index={index}
              isFavorite={favoriteSet.has(product.fid ?? '')}
              onDetail={onDetail}
              onAdd={onAdd}
              onNotify={onNotify}
              onToggleFavorite={onToggleFavorite}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

export const ProductGrid = memo(ProductGridBase);
