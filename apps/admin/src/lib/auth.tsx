import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ALL_PERMISSIONS, can as canPerm, type Permission, type Profile, type StaffRole } from '@raqeem/shared';
import { IS_DEMO } from './env';
import { supabase, errorMessage } from './supabase';

interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  role: StaffRole | null;
  /** موظف فعّال: يدخل اللوحة */
  isStaff: boolean;
  isOwner: boolean;
  /** للحساب تحقق بخطوتين مفعّل والجلسة لم تُكمله بعد (aal1): الخادم يرفض كل شيء حتى يُكتب الرمز */
  mfaPending: boolean;
  permissions: string[];
  can: (p: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

const DEMO_PROFILE: Profile = {
  id: 'demo-owner', kind: 'staff', full_name: 'صاحب المتجر (عرض)', phone: null, email: 'demo@raqeem.iq', avatar_key: null,
  role_id: null, is_owner: true, status: 'active', onboarded: true, governorate: 'baghdad', prefs: {}, last_seen_at: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(IS_DEMO);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(IS_DEMO ? DEMO_PROFILE : null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [mfaPending, setMfaPending] = useState(false);
  const seq = useRef(0);

  // كل ما يخص الجلسة يُحمَّل أولاً ثم يُضبط دفعة واحدة: لو ضُبط الملف قبل الدور أو قبل فحص التحقق بخطوتين
  // لرُسمت اللوحة لحظة بلا صلاحيات (فتحوّل «/» إلى «حسابي») أو تجاوزت شاشة رمز التحقق
  const loadProfile = useCallback(async (s: Session | null) => {
    const my = ++seq.current;
    let p: Profile | null = null;
    let r: StaffRole | null = null;
    let pending = false;
    if (supabase && s) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      pending = !!aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2';
      const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
      p = (data as Profile | null) ?? null;
      if (p?.role_id) {
        const { data: rd } = await supabase.from('staff_roles').select('*').eq('id', p.role_id).maybeSingle();
        r = (rd as StaffRole | null) ?? null;
      }
    }
    if (my !== seq.current) return;
    setSession(s);
    setProfile(p);
    setRole(r);
    setMfaPending(pending);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      await loadProfile(data.session);
      if (alive) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // لا await داخل المستمع (توصية supabase-js) — نحمّل بعده
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'MFA_CHALLENGE_VERIFIED') setTimeout(() => void loadProfile(s), 0);
      else setSession(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(() => {
    const isStaff = !!profile && profile.kind === 'staff' && profile.status === 'active';
    const isOwner = isStaff && !!profile?.is_owner;
    const permissions = isOwner ? [...ALL_PERMISSIONS] : isStaff ? role?.permissions ?? [] : [];
    return {
      ready,
      session,
      profile,
      role,
      isStaff,
      isOwner,
      mfaPending,
      permissions,
      can: (p) => canPerm({ is_owner: isOwner, permissions }, p),
      signIn: async (email, password) => {
        if (!supabase) return null;
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? errorMessage(error) : null;
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
      },
      reload: async () => {
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        await loadProfile(data.session);
      },
    };
  }, [ready, session, profile, role, mfaPending, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth خارج AuthProvider');
  return v;
}
