import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Profile } from './api';
import { demoApi } from './api/demo';
import { isDemo } from './env';
import { queryClient } from './query';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthValue {
  ready: boolean;
  uid: string | null;
  email: string | null;
  profile: Profile | null;
  /** مسجّل وأكمل بياناته (الاسم والهاتف والمحافظة) */
  onboarded: boolean;
  signInWithGoogle: () => Promise<boolean>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const Ctx = createContext<AuthValue | null>(null);

/** رابط العودة من Google: exp://…/--/auth-callback في Expo Go، و raqeem://auth-callback في التطبيق المبني */
export const authRedirectUrl = () => Linking.createURL('auth-callback');

// الرمز قد يصل من طريقين معاً (نتيجة نافذة الدخول + فتح رابط auth-callback): نستبدله مرة واحدة فقط
const exchanges = new Map<string, Promise<void>>();
let lastExchange: Promise<void> | null = null;
export function exchangeCode(code: string): Promise<void> {
  let p = exchanges.get(code);
  if (!p) {
    p = (async () => {
      if (!supabase) return;
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error(error.message);
      }
    })();
    exchanges.set(code, p);
    lastExchange = p;
  }
  return p;
}

export async function completeFromUrl(url: string): Promise<boolean> {
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  if (typeof code === 'string') {
    await exchangeCode(code);
    return true;
  }
  const err = parsed.queryParams?.error_description;
  if (typeof err === 'string') throw new Error(err);
  return false;
}

/** أسماء مستمعي الخروج (السلة والمفضلة تمسح نسختها المحلية للحساب) */
const signOutHooks = new Set<() => void | Promise<void>>();
export function onSignOut(cb: () => void | Promise<void>) {
  signOutHooks.add(cb);
  return () => { signOutHooks.delete(cb); };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isDemo);
  const [session, setSession] = useState<Session | null>(null);
  const [demoUid, setDemoUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const uid = isDemo ? demoUid : session?.user.id ?? null;

  const loadProfile = useCallback(async (id: string | null): Promise<Profile | null> => {
    if (!id) {
      setProfile(null);
      return null;
    }
    try {
      const p = await api.profile(id);
      setProfile(p ? { ...p } : null);
      return p;
    } catch {
      return null; // بلا إنترنت: نُبقي الملف الظاهر
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    // لا نعلق على شاشة البداية: مهلة ٦ ثوانٍ كحد أقصى
    const t = setTimeout(() => setReady(true), 6000);
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id ?? null);
    }).catch(() => {}).finally(() => { clearTimeout(t); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!s && event !== 'SIGNED_OUT') return;
      setSession(s);
      // لا نستدعي supabase داخل المستمع مباشرة (توصية supabase-js)
      setTimeout(() => loadProfile(s?.user.id ?? null), 0);
    });
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const value = useMemo<AuthValue>(() => ({
    ready,
    uid,
    email: isDemo ? profile?.email ?? null : session?.user.email ?? null,
    profile,
    onboarded: !!uid && !!profile?.onboarded,
    signInWithGoogle: async () => {
      if (!supabase) return false;
      const redirectTo = authRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (error || !data.url) throw new Error(error?.message ?? 'تعذّر بدء تسجيل الدخول');
      lastExchange = null;
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type === 'success') return completeFromUrl(res.url);
      // أندرويد: عودة التطبيق للواجهة قد تُنهي النافذة بـ dismiss قبل حدث الرابط، والرابط التقطه +native-intent
      if (lastExchange) { await lastExchange; return true; }
      return false;
    },
    signInDemo: () => {
      const p = demoApi.signIn();
      setDemoUid(p.id);
      setProfile({ ...p });
    },
    signOut: async () => {
      for (const h of signOutHooks) await Promise.resolve(h()).catch(() => {});
      if (supabase) await supabase.auth.signOut().catch(() => {});
      else demoApi.signOut();
      setDemoUid(null);
      setSession(null);
      setProfile(null);
      // بيانات الحساب المحفوظة (الطلبات، العناوين…) لا تبقى لمن يستعمل الهاتف بعده
      queryClient.removeQueries({ predicate: (q) => !['home', 'settings', 'categories', 'brands', 'zones', 'product', 'search', 'cards', 'category'].includes(String(q.queryKey[0])) });
    },
    refreshProfile: () => loadProfile(uid),
  }), [ready, uid, profile, session, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
