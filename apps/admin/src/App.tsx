import { Suspense, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { routes, NAV_GROUPS, type AppRoute } from './routes';
import { useAuth } from './lib/auth';
import { IS_DEMO } from './lib/env';
import { CountsProvider, useCounts } from './lib/counts';
import { SettingsProvider, useFmt } from './lib/settings';
import { useHotkey, useStored } from './lib/hooks';
import { useThemePref } from './lib/theme';
import { Avatar, Button, Icon, IconButton, Loading, Mark, Menu } from './ui';
import Login from './pages/core/Login';
import CommandPalette from './pages/core/CommandPalette';
import NotFound from './pages/core/NotFound';

export default function App() {
  const auth = useAuth();
  if (!auth.ready) return <Loading />;
  if (!IS_DEMO && (!auth.session || !auth.isStaff)) return <Login denied={!!auth.session && !auth.isStaff} />;
  return (
    <SettingsProvider enabled>
      <CountsProvider enabled canOrders={auth.can('orders.view')}>
        <Shell />
      </CountsProvider>
    </SettingsProvider>
  );
}

function Shell() {
  const auth = useAuth();
  const { counts } = useCounts();
  const fmt = useFmt();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useStored('rq.side.collapsed', false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useThemePref();

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useHotkey('mod+k', () => setPaletteOpen(true));

  // الصفحات المسموحة لهذا الموظف فقط
  const allowed = useMemo(() => routes.filter((r) => !r.perm || auth.can(r.perm)), [auth]);
  const navItems = useMemo(
    () => NAV_GROUPS.map((g) => ({ ...g, items: allowed.filter((r) => r.group === g.key && r.nav !== false).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)) })).filter((g) => g.items.length),
    [allowed],
  );
  const current = allowed.find((r) => matchPath(r.path, location.pathname));
  const home = allowed.find((r) => r.path === '/') ? '/' : navItems[0]?.items[0]?.path ?? '/account';

  return (
    <>
      {IS_DEMO ? <div className="demo-bar">وضع العرض — بيانات تجريبية لا تُحفظ. اربط Supabase من دليل الإعداد لتشغيل النظام فعلياً.</div> : null}
      <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
        {menuOpen ? <div className="scrim only-mobile" onClick={() => setMenuOpen(false)} role="presentation" /> : null}
        <nav className={`side ${menuOpen ? 'open' : ''}`} aria-label="القائمة الرئيسية">
          <div className="side-brand">
            <Mark size={34} ink="var(--side-ink)" hole="#E8622A" />
            <b>رَقيم</b>
            <span className="tag">الإدارة</span>
          </div>
          {navItems.map((g) => (
            <div key={g.key} style={{ '--g': g.color } as React.CSSProperties}>
              {g.label ? <div className="side-group"><i /><span>{g.label}</span></div> : null}
              {g.items.map((r) => {
                const count = r.badge ? counts[r.badge] : 0;
                return (
                  <NavLink key={r.path} to={r.path} end={r.path === '/'} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} title={collapsed ? r.label : undefined}>
                    <Icon name={r.icon} size={20} />
                    <span>{r.label}</span>
                    {count ? <span className={`count ${r.badge === 'lowStock' ? 'quiet' : ''}`}>{fmt.num(count)}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
          <div className="side-foot">
            <Avatar name={auth.profile?.full_name} imageKey={auth.profile?.avatar_key} />
            <div className="who">
              <b className="truncate">{auth.profile?.full_name ?? 'موظف'}</b>
              <span>{auth.isOwner ? 'صاحب المتجر' : auth.role?.name ?? 'موظف'}</span>
            </div>
          </div>
        </nav>

        <div className="main">
          <header className="topbar">
            <IconButton icon="menu" label="القائمة" className="only-mobile" onClick={() => setMenuOpen(true)} />
            <IconButton icon={collapsed ? 'chevronLeft' : 'chevronRight'} label={collapsed ? 'توسيع القائمة' : 'طي القائمة'} className="only-desktop" onClick={() => setCollapsed(!collapsed)} />
            <button type="button" className="btn ghost" style={{ flex: '0 1 380px', justifyContent: 'flex-start', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink3)' }} onClick={() => setPaletteOpen(true)}>
              <Icon name="search" size={18} />
              <span className="grow" style={{ textAlign: 'start', fontWeight: 500 }}>بحث عن منتج، زبون، طلب…</span>
              <span className="kbd only-desktop">Ctrl K</span>
            </button>
            <span className="grow" />
            {auth.can('pos.sell') && current?.path !== '/pos' ? <Button variant="primary" icon="pos" onClick={() => navigate('/pos')}><span className="only-desktop">بيع جديد</span></Button> : null}
            <Menu
              trigger={(open) => <IconButton icon={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'eye'} label="المظهر" onClick={open} />}
              items={[
                { label: 'تلقائي (حسب الجهاز)', icon: 'eye', onClick: () => setTheme('auto') },
                { label: 'فاتح', icon: 'sun', onClick: () => setTheme('light') },
                { label: 'غامق', icon: 'moon', onClick: () => setTheme('dark') },
              ]}
            />
            <Menu
              trigger={(open) => <button type="button" className="btn ghost icon" onClick={open} aria-label="حسابي"><Avatar name={auth.profile?.full_name} imageKey={auth.profile?.avatar_key} size={30} /></button>}
              items={[
                { label: 'حسابي', icon: 'user', onClick: () => navigate('/account') },
                { divider: true, label: '' },
                { label: 'تسجيل الخروج', icon: 'logout', danger: true, onClick: () => void auth.signOut(), disabled: IS_DEMO },
              ]}
            />
          </header>

          <main className={`content ${current?.full ? 'full' : ''}`} id="main">
            <Suspense fallback={<Loading />}>
              <Routes>
                {allowed.map((r: AppRoute) => {
                  const El = r.element;
                  return <Route key={r.path} path={r.path} element={<El />} />;
                })}
                {/* صفحة رئيسية غير مسموحة لهذا الدور ← أول صفحة مسموحة */}
                {!allowed.some((r) => r.path === '/') ? <Route path="/" element={<Navigate to={home} replace />} /> : null}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} routes={allowed} />
    </>
  );
}

/** مطابقة بسيطة لمسار بمعاملات (:id) */
function matchPath(pattern: string, path: string): boolean {
  if (pattern === '/') return path === '/';
  const re = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}/?$`);
  return re.test(path);
}
