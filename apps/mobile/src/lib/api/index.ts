import { isDemo } from '../env';
import type { Api } from './api';
import { demoApi } from './demo';
import { remoteApi } from './remote';

/** الواجهة الوحيدة التي تستعملها الشاشات: Supabase أو وضع العرض */
export const api: Api = isDemo ? demoApi : remoteApi;

export type { Api, OrderWithItems } from './api';
export * from './types';
