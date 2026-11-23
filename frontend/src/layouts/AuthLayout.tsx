import type { ReactNode } from "react";
import { BarChart3, FileText, ShieldCheck, Zap } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-navy-800 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
            <Zap className="h-5 w-5" fill="currentColor" />
          </span>
          <div>
            <p className="text-lg font-semibold">PowerGrid Utility Services</p>
            <p className="text-xs text-slate-400">Electricity Billing Management System</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">Accurate bills. Transparent payments. Faster service.</h1>
          <p className="mt-3 text-sm text-slate-300">
            One place for customers, meter readings, tariff-based billing, payments and complaints - for utility staff and consumers.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              [FileText, "Automatic slab-based billing with frozen tariff rates on every invoice"],
              [BarChart3, "Live dashboards for revenue, consumption and collections"],
              [ShieldCheck, "Role-based access, audit trail and secure authentication"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof FileText;
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                    <I className="h-4 w-4 text-accent-400" />
                  </span>
                  <span className="text-slate-200">{text as string}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Demo system for academic use. Payments run in Demo Payment Mode.</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-page px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-800">
              <Zap className="h-5 w-5 text-accent-400" fill="currentColor" />
            </span>
            <span className="font-semibold text-ink">PowerGrid EBMS</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
