import { lazy } from 'react';
import { catalogRoutes } from './catalog';
import { salesRoutes } from './sales';
import type { AppRoute } from './types';

/** مسارات القائد (الحساب) */
const coreRoutes: AppRoute[] = [
  { path: '/account', label: 'حسابي', icon: 'user', group: 'system', element: lazy(() => import('../pages/core/Account')), nav: false },
];

export const routes: AppRoute[] = [...salesRoutes, ...catalogRoutes, ...coreRoutes];
export * from './types';
