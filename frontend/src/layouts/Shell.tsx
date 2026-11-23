import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, BarChart3, Cable, ClipboardList, CreditCard, FileText, Gauge, History, LayoutDashboard, LogOut, Menu, MessageSquareWarning,
  Receipt, Settings, ShieldCheck, Tags, UserCircle, Users, UserCog, Wallet, X, Zap, LineChart, PlugZap,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import type { Role } from "@/types";

interface NavItem { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean }
interface NavGroup { title?: string; items: NavItem[] }

const ADMIN_NAV: NavGroup[] = [
  { items: [{ to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  { title: "Operations", items: [
    { to: "/app/customers", label: "Customers", icon: Users },
    { to: "/app/connections", label: "Electricity Connections", icon: Cable },
    { to: "/app/readings", label: "Meter Readings", icon: Gauge },
  ] },
  { title: "Billing", items: [
    { to: "/app/billing", label: "Billing & Invoices", icon: FileText },
    { to: "/app/payments", label: "Payments", icon: Wallet },
    { to: "/app/tariffs", label: "Tariff Management", icon: Tags },
  ] },
  { title: "Service", items: [
    { to: "/app/complaints", label: "Complaints", icon: MessageSquareWarning },
    { to: "/app/reports", label: "Reports & Analytics", icon: BarChart3 },
  ] },
  { title: "Administration", items: [
    { to: "/app/staff", label: "Staff Management", icon: UserCog },
    { to: "/app/notifications", label: "Notifications", icon: Bell },
    { to: "/app/audit-logs", label: "Audit Logs", icon: ShieldCheck },
    { to: "/app/settings", label: "Settings", icon: Settings },
  ] },
];

const STAFF_NAV: NavGroup[] = [
  { items: [{ to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  { title: "Operations", items: [
    { to: "/app/customers", label: "Customers", icon: Users },
    { to: "/app/connections", label: "Connections", icon: Cable },
    { to: "/app/readings", label: "Meter Readings", icon: Gauge },
  ] },
  { title: "Billing", items: [
    { to: "/app/billing", label: "Generate Bills", icon: FileText },
    { to: "/app/payments", label: "Payments", icon: Wallet },
    { to: "/app/tariffs", label: "Tariffs", icon: Tags },
  ] },
  { title: "Service", items: [
    { to: "/app/complaints", label: "Complaints", icon: MessageSquareWarning },
    { to: "/app/reports", label: "Reports", icon: BarChart3 },
    { to: "/app/notifications", label: "Notifications", icon: Bell },
    { to: "/app/profile", label: "Profile", icon: UserCircle },
  ] },
];

const CUSTOMER_NAV: NavGroup[] = [
  { items: [{ to: "/portal", label: "My Dashboard", icon: LayoutDashboard, end: true }] },
  { title: "Account", items: [
    { to: "/portal/profile", label: "My Profile", icon: UserCircle },
    { to: "/portal/connection", label: "My Connection", icon: PlugZap },
  ] },
  { title: "Billing", items: [
    { to: "/portal/current-bill", label: "Current Bill", icon: Receipt },
    { to: "/portal/bills", label: "Bill History", icon: History },
    { to: "/portal/pay", label: "Pay Bill", icon: CreditCard },
    { to: "/portal/payments", label: "Payment History", icon: ClipboardList },
    { to: "/portal/consumption", label: "Consumption Analytics", icon: LineChart },
  ] },
  { title: "Support", items: [
    { to: "/portal/complaints", label: "Complaints", icon: MessageSquareWarning },
    { to: "/portal/notifications", label: "Notifications", icon: Bell },
    { to: "/portal/settings", label: "Settings", icon: Settings },
  ] },
];

const NAV: Record<Role, NavGroup[]> = { admin: ADMIN_NAV, staff: STAFF_NAV, customer: CUSTOMER_NAV };
const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", staff: "Staff", customer: "Customer" };

function useUnreadCount() {
  const [count, setCount] = useState(0);
  const loc = useLocation();
  useEffect(() => {
    let alive = true;
    const load = () => api.get<{ count: number }>("/api/notifications/unread-count").then((r) => alive && setCount(r.data.count)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    const onChange = () => load();
    window.addEventListener("notifications:changed", onChange);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("notifications:changed", onChange);
    };
  }, [loc.pathname]);
  return count;
}

function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col bg-navy-800 text-slate-300">
      <Link to={role === "customer" ? "/portal" : "/app"} className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/5 px-5" onClick={onNavigate}>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 shadow-sm">
          <Zap className="h-5 w-5 text-white" fill="currentColor" />
        </span>
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-white">PowerGrid</span>
          <span className="block text-[11px] text-slate-400">Billing Management</span>
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV[role].map((g, i) => (
          <div key={i}>
            {g.title && <p className="nav-section">{g.title}</p>}
            <div className={clsx("space-y-0.5", !g.title && "pt-3")}>
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition",
                      isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-300 hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  <it.icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{it.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 p-3">
        <button
          onClick={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-[18px] w-[18px]" /> Logout
        </button>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!user) return null;
  const initials = user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const profile = user.role === "customer" ? "/portal/settings" : user.role === "admin" ? "/app/settings" : "/app/profile";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={open}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white">{initials}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-[160px] truncate text-[13px] font-medium text-ink">{user.full_name}</span>
          <span className="block text-[11px] text-ink-muted">{ROLE_LABEL[user.role]}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-pop" role="menu">
          <div className="border-b border-line px-4 py-2.5">
            <p className="truncate text-sm font-medium">{user.full_name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
          <Link to={profile} onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-ink-soft hover:bg-slate-50">
            <UserCircle className="h-4 w-4" /> Profile & password
          </Link>
          <button
            onClick={async () => {
              await logout();
              navigate("/login", { replace: true });
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-bad-700 hover:bg-bad-50"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function Shell() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const unread = useUnreadCount();
  const loc = useLocation();
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  if (!user) return null;
  const notifTo = user.role === "customer" ? "/portal/notifications" : "/app/notifications";

  return (
    <div className="flex h-full">
      <aside className="no-print hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-64">
          <Sidebar role={user.role} />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-900/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <Sidebar role={user.role} onNavigate={() => setMobileOpen(false)} />
            <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-md p-1 text-slate-300 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button aria-label="Open menu" className="rounded-lg p-2 text-ink-soft hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:block">
              <p className="text-[13px] font-medium text-ink">Electricity Billing Management System</p>
              <p className="text-[11px] text-ink-muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={notifTo} className="relative rounded-lg p-2 text-ink-soft hover:bg-slate-100" aria-label={`Notifications (${unread} unread)`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad-600 px-1 text-[10px] font-semibold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
