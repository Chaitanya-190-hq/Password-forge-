import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Menu, ShieldCheck, X } from 'lucide-react';
import { NAV_GROUPS, PRIVACY_PAGE, WORKSPACES, WORKSPACE_BY_ID } from '../navigation.js';
import { cx } from './ui.jsx';

const SIDEBAR_KEY = 'password-forge.sidebar.collapsed';

function ForgeMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#1D2026" stroke="rgba(197,163,107,0.45)" />
      <path
        d="M20 7.5l9 3.6v7.6c0 6-3.7 11.4-9 13.8-5.3-2.4-9-7.8-9-13.8v-7.6l9-3.6z"
        fill="none"
        stroke="#C5A36B"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="18.5" r="2.6" fill="#C5A36B" />
      <path d="M20 21v4.2" stroke="#C5A36B" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NavItem({ item, collapsed, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      title={collapsed ? item.name : undefined}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors duration-150',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-gold/[0.09] text-parchment'
            : 'text-muted hover:bg-white/[0.035] hover:text-parchment/90',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-gold" />
          )}
          <Icon size={17} className={cx('shrink-0', isActive ? 'text-gold' : 'text-muted/80')} aria-hidden="true" />
          {!collapsed && <span className="truncate">{item.name}</span>}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ collapsed, onToggle, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cx('flex items-center gap-3 px-4 pb-5 pt-5', collapsed && 'justify-center px-2')}>
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5" aria-label="Password Forge home">
          <ForgeMark size={collapsed ? 30 : 32} />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block font-display text-[15.5px] tracking-[0.06em] text-parchment">
                PASSWORD FORGE
              </span>
              <span className="block whitespace-nowrap text-[9px] uppercase tracking-[0.15em] text-gold/70">
                Forge · Encrypt · Protect
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-muted/50">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((id) => (
                <NavItem key={id} item={WORKSPACE_BY_ID[id]} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={cx('border-t border-line px-3 py-3', collapsed && 'px-1.5')}>
        {!collapsed && (
          <div className="mb-2 flex items-start gap-2 rounded-lg bg-ink/50 px-3 py-2.5">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success/80" aria-hidden="true" />
            <p className="text-[10.5px] leading-relaxed text-muted">
              Everything runs locally in this tab. No account, no backend, no telemetry.
            </p>
          </div>
        )}
        <NavLink
          to={PRIVACY_PAGE.path}
          onClick={onNavigate}
          className={cx(
            'flex items-center gap-2 rounded-md px-2.5 py-2 text-[11.5px] text-muted transition-colors hover:text-parchment',
            collapsed && 'justify-center px-0',
          )}
          title={PRIVACY_PAGE.name}
        >
          <PRIVACY_PAGE.icon size={14} aria-hidden="true" />
          {!collapsed && PRIVACY_PAGE.name}
        </NavLink>
        <button
          type="button"
          onClick={onToggle}
          className={cx(
            'mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[11.5px] text-muted/80 transition-colors hover:bg-white/[0.04] hover:text-parchment',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* preference is non-critical */
      }
      return next;
    });
  }

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const current =
    WORKSPACES.find((workspace) =>
      workspace.path === '/' ? location.pathname === '/' : location.pathname.startsWith(workspace.path),
    ) || (location.pathname === '/privacy' ? { name: 'Privacy & data flow' } : null);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-surface/70 backdrop-blur-xl transition-[width] duration-200 lg:block',
          collapsed ? 'w-[76px]' : 'w-[262px]',
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={toggleSidebar} />
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ink/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <ForgeMark size={28} />
          <span>
            <span className="block font-display text-[13.5px] tracking-[0.08em]">PASSWORD FORGE</span>
            <span className="block text-[9px] uppercase tracking-[0.18em] text-gold/70">{current?.name}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-lg border border-line p-2 text-muted transition-colors hover:text-parchment"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
        >
          <Menu size={18} />
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade bg-black/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="animate-rise absolute inset-y-0 left-0 w-[86%] max-w-[300px] border-r border-line bg-surface shadow-lift">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-muted hover:text-parchment"
              aria-label="Close navigation"
            >
              <X size={17} />
            </button>
            <SidebarContent collapsed={false} onToggle={toggleSidebar} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className={cx('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[262px]')}>
        <div className="hidden items-center justify-between border-b border-line/70 px-8 py-3 lg:flex">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted/70">
            {current?.name || 'Workspace'}
          </p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted/70">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              offline-first
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted/50">
              no telemetry
            </span>
          </div>
        </div>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-9 lg:pt-9">
          <Outlet />
          <footer className="mt-14 border-t border-line pt-5">
            <div className="flex flex-col gap-2 text-[11px] text-muted/60 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Password Forge · client-side cryptography workstation. No server receives your secrets.
              </p>
              <div className="flex items-center gap-4">
                <Link to="/privacy" className="transition-colors hover:text-parchment">
                  Privacy &amp; data flow
                </Link>
                <Link to="/academy" className="transition-colors hover:text-parchment">
                  Academy
                </Link>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
