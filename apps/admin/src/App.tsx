import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { routes, NAV_GROUPS, type AppRoute } from './routes';
import { useAuth } from './lib/auth';
import { IS_DEMO } from './lib/env';
import { CountsProvider, useCounts } from './lib/counts';
import { SettingsProvider, useFmt } from './lib/settings';
import { useHotkey, useStored } from './lib/hooks';
import { useThemePref } from './lib/theme';
import { Avatar, Button, ErrorState, Icon, IconButton, Loading, Mark, Menu } from './ui';
import Login from './pages/core/Login';
import CommandPalette from './pages/core/CommandPalette';
import NotFound, { NoAccess } from './pages/core/NotFound';

export default function App() {
  const auth = useAuth();
  if (!auth.ready) return <Loading />;
  if (!IS_DEMO && (!auth.session || !auth.isStaff || auth.mfaPending)) return <Login denied={!!auth.session && !auth.isStaff} />;
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
  // أقسام القائمة المطوية (مثل المرجع: القسم يُفتح ليظهر خياراته)
  const [closedGroups, setClosedGroups] = useStored<string[]>('rq.side.closed', []);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  // التبويب النشط في شريط القسم يظهر دائماً (على الهاتف يكون خارج الشاشة أحياناً)
  useEffect(() => {
    requestAnimationFrame(() => document.querySelector('.section-tab.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  }, [location.pathname]);
  useHotkey('mod+k', () => setPaletteOpen(true));
  // أي نص مقصوص بـ .truncate يُظهر نصه كاملاً عند المرور عليه
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.truncate');
      if (el && !el.title && el.scrollWidth > el.clientWidth + 1) el.title = el.textContent?.trim() ?? '';
    };
    document.addEventListener('mouseover', onOver);
    return () => document.removeEventListener('mouseover', onOver);
  }, []);
  // شريط القسم: حافة باهتة في الجهة التي فيها تبويبات مخفية حتى يُفهم أنه يُمرَّر
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const update = () => {
      const x = Math.abs(el.scrollLeft);
      el.classList.toggle('more-start', x > 2);
      el.classList.toggle('more-end', x + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [location.pathname]);

  // الصفحات المسموحة لهذا الموظف فقط
  const allowed = useMemo(() => routes.filter((r) => !r.perm || auth.can(r.perm)), [auth]);
  const navItems = useMemo(
    () => NAV_GROUPS.map((g) => ({ ...g, items: allowed.filter((r) => r.group === g.key && r.nav !== false).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)) })).filter((g) => g.items.length),
    [allowed],
  );
  const current = allowed.find((r) => matchPath(r.path, location.pathname));
  // صفحات القسم الحالي: تظهر شريطَ تبويبات أعلى الصفحة للتنقل بين خيارات القسم
  const sectionItems = current && current.group !== 'home' ? navItems.find((g) => g.key === current.group)?.items ?? [] : [];
  const sectionLabel = NAV_GROUPS.find((g) => g.key === current?.group)?.label ?? '';
  const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(`${path}/`));
  const toggleGroup = (key: string) => setClosedGroups(closedGroups.includes(key) ? closedGroups.filter((k) => k !== key) : [...closedGroups, key]);
  const home = allowed.find((r) => r.path === '/') ? '/' : navItems[0]?.items[0]?.path ?? '/account';

  return (
    <>
      {IS_DEMO ? <div className="demo-bar" title="وضع العرض — بيانات تجريبية لا تُحفظ. اربط Supabase من دليل الإعداد لتشغيل النظام فعلياً.">وضع العرض — بيانات تجريبية لا تُحفظ. اربط Supabase من دليل الإعداد لتشغيل النظام فعلياً.</div> : null}
      <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
        {menuOpen ? <div className="scrim only-mobile" onClick={() => setMenuOpen(false)} role="presentation" /> : null}
        <nav className={`side ${menuOpen ? 'open' : ''}`} aria-label="القائمة الرئيسية">
          <div className="side-brand">
            <Mark size={34} ink="var(--side-ink)" hole="#E8622A" />
            <b>رَقيم</b>
            <span className="tag">الإدارة</span>
          </div>
          {navItems.map((g) => {
            const hasActive = g.items.some((r) => isActive(r.path));
            const open = !g.label || hasActive || !closedGroups.includes(g.key);
            const groupCount = g.items.reduce((n, r) => n + (r.badge && r.badge !== 'lowStock' ? counts[r.badge] : 0), 0);
            return (
            <div key={g.key} style={{ '--g': g.color } as React.CSSProperties} className={`side-section ${open ? 'open' : ''}`}>
              {g.label ? (
                <button type="button" className="side-group" aria-expanded={open} onClick={() => toggleGroup(g.key)}>
                  <i /><span>{g.label}</span>
                  {!open && groupCount ? <span className="count">{fmt.num(groupCount)}</span> : null}
                  <Icon name="chevronDown" size={14} className="chev" />
                </button>
              ) : null}
              {open ? g.items.map((r) => {
                const count = r.badge ? counts[r.badge] : 0;
                return (
                  <NavLink key={r.path} to={r.path} end={r.path === '/'} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} title={collapsed ? r.label : undefined}>
                    <Icon name={r.icon} size={20} />
                    <span>{r.label}</span>
                    {count ? <span className={`count ${r.badge === 'lowStock' ? 'quiet' : ''}`}>{fmt.num(count)}</span> : null}
                  </NavLink>
                );
              }) : null}
            </div>
            );
          })}
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
            <button type="button" className="btn ghost topbar-search" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" size={18} />
              <span className="grow truncate" style={{ textAlign: 'start', fontWeight: 500 }}>بحث عن منتج، زبون، طلب…</span>
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
            {sectionItems.length > 1 && !current?.full ? (
              <nav className="section-tabs" aria-label={`خيارات ${sectionLabel}`}>
                <span className="section-name">{sectionLabel}</span>
                <div className="section-scroll" ref={tabsRef}>
                  {sectionItems.map((r) => (
                    <NavLink key={r.path} to={r.path} className={() => `section-tab ${isActive(r.path) ? 'on' : ''}`}>
                      <Icon name={r.icon} size={16} />{r.label}
                      {r.badge && counts[r.badge] ? <span className="count">{fmt.num(counts[r.badge])}</span> : null}
                    </NavLink>
                  ))}
                </div>
              </nav>
            ) : null}
            <PageBoundary key={location.pathname}>
            <Suspense fallback={<Loading />}>
              <Routes>
                {allowed.map((r: AppRoute) => {
                  const El = r.element;
                  return <Route key={r.path} path={r.path} element={<El />} />;
                })}
                {/* مسار غير مسموح لهذا الدور ← «لا صلاحية» (وإلا يطابقه مسار بمعامل: /products/new ← /products/:id) */}
                {routes.filter((r) => r.path !== '/' && !allowed.includes(r)).map((r) => <Route key={`x${r.path}`} path={r.path} element={<NoAccess />} />)}
                {/* صفحة رئيسية غير مسموحة لهذا الدور ← أول صفحة مسموحة */}
                {!allowed.some((r) => r.path === '/') ? <Route path="/" element={<Navigate to={home} replace />} /> : null}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            </PageBoundary>
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} routes={allowed} />
    </>
  );
}

/** خطأ في صفحة واحدة لا يُسقط اللوحة كلها: تبقى القائمة والشريط ويظهر خطأ مع إعادة المحاولة */
class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (this.state.error) return <ErrorState message="حدث خطأ غير متوقع في هذه الصفحة." onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

/** مطابقة بسيطة لمسار بمعاملات (:id) */
function matchPath(pattern: string, path: string): boolean {
  if (pattern === '/') return path === '/';
  const re = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}/?$`);
  return re.test(path);
}
