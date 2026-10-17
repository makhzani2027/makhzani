import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient, useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Network from 'expo-network';
import { useSyncExternalStore, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * التخزين المؤقت: كل قراءة تُحفظ على الهاتف، فبلا إنترنت يظهر آخر كتالوج وآخر طلبات فوراً.
 * offlineFirst = نعرض المحفوظ ونحاول الشبكة، ولا نعلّق الشاشة بانتظار اتصال غير موجود.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24 * 3,
      retry: (count, err) => count < 2 && !/[؀-ۿ]/.test(String((err as Error)?.message ?? '')),
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'raqeem.cache.v1', throttleTime: 1500 });

// حالة الاتصال من النظام بدل افتراض المتصفح
if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) => {
    Network.getNetworkStateAsync().then((s) => setOnline(s.isConnected !== false)).catch(() => {});
    const sub = Network.addNetworkStateListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));
    return () => sub.remove();
  });
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        buster: 'v1',
        dehydrateOptions: {
          // لا نحفظ نتائج الحساب اللحظي (السلة) ولا الأخطاء
          shouldDehydrateQuery: (q) => q.state.status === 'success' && q.queryKey[0] !== 'quote',
        },
      }}>
      {children}
    </PersistQueryClientProvider>
  );
}

// ---------------------------------------------------------------- استعلامات مشتركة

export const qk = {
  home: ['home'] as const,
  settings: ['settings'] as const,
  categories: ['categories'] as const,
  brands: ['brands'] as const,
  zones: ['zones'] as const,
  product: (slug: string) => ['product', slug] as const,
  orders: (uid: string) => ['orders', uid] as const,
  order: (id: string) => ['order', id] as const,
  addresses: (uid: string) => ['addresses', uid] as const,
  requests: (uid: string) => ['requests', uid] as const,
  notifications: (uid: string) => ['notifications', uid] as const,
  cards: (ids: string[]) => ['cards', ...ids] as const,
};

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api.settings(), staleTime: 5 * 60_000 });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: () => api.categories(), staleTime: 10 * 60_000 });
export const useBrands = () => useQuery({ queryKey: qk.brands, queryFn: () => api.brands(), staleTime: 30 * 60_000 });
export const useZones = () => useQuery({ queryKey: qk.zones, queryFn: () => api.zones(), staleTime: 10 * 60_000 });
