import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setProfile(null);
      setRole(null);
      return;
    }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    setProfile((p as Profile) ?? null);
    if (p?.role_id) {
      const { data: r } = await supabase.from('staff_roles').select('*').eq('id', p.role_id).maybeSingle();
      setRole((r as StaffRole) ?? null);
    } else setRole(null);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (alive) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // لا await داخل المستمع (توصية supabase-js) — نحمّل بعده
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => void loadProfile(s), 0);
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
      reload: () => loadProfile(session),
    };
  }, [ready, session, profile, role, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth خارج AuthProvider');
  return v;
}
