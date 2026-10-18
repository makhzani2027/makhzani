import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { GridSkeleton, ProductGrid } from '@/components/product-card';
import { toast } from '@/components/toast';
import { Button, Empty, ErrorState, PageTitle, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { friendlyError } from '@/lib/errors';
import { useFavorites } from '@/lib/favorites';
import { useFmt } from '@/lib/format';
import { qk } from '@/lib/query';

export default function Favorites() {
  const fav = useFavorites();
  const cart = useCart();
  const f = useFmt();
  const q = useQuery({ queryKey: qk.cards(fav.ids), queryFn: () => api.productCards(fav.ids), enabled: fav.ids.length > 0, placeholderData: keepPreviousData });
  const items = (q.data ?? []).filter((p) => fav.ids.includes(p.id));
  const movable = items.filter((p) => p.default_variant_id && p.in_stock);

  return (
    <Screen inTabs header={<PageTitle title="المفضلة" subtitle={items.length ? f.products(items.length) : undefined} />} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {!fav.ids.length ? (
        <Empty icon="heart" title="لا شيء في المفضلة" body="اضغط القلب على أي منتج لتحفظه هنا وترجع له لاحقاً." action="تصفّح المتجر" onAction={() => router.navigate('/')} />
      ) : q.isLoading ? (
        <GridSkeleton />
      ) : q.error && !q.data ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          {movable.length ? (
            <Button title={`انقل المتوفر للسلة (${f.num(movable.length)})`} icon="cartPlus" variant="secondary"
              onPress={() => { movable.forEach((p) => cart.add(p.default_variant_id!, 1, p.price_min)); toast.show('أُضيفت للسلة', 'success'); }} />
          ) : null}
          <ProductGrid items={items} />
        </>
      )}
    </Screen>
  );
}
