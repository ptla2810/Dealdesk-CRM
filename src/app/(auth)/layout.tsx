import Image from "next/image";
import { BarChart3, CalendarCheck2, ShieldCheck, Truck } from "lucide-react";
import { APP_NAME } from "@/lib/config";

const FEATURES = [
  { icon: BarChart3, title: "Pipeline you can trust", text: "Stages, conversion and forecast value, live from your data." },
  { icon: CalendarCheck2, title: "Meetings that move deals", text: "Minutes, action items and follow-ups in one place." },
  { icon: Truck, title: "Inquiry to delivery", text: "Accounts, orders, shipping and support tickets, connected." },
  { icon: ShieldCheck, title: "Secure by design", text: "Role-based access, team hierarchy and a full audit trail." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Decorative glows and grid in the brand colours. */}
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full bg-[oklch(0.56_0.19_258/0.35)] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-40 -bottom-48 size-[34rem] rounded-full bg-[oklch(0.68_0.14_165/0.28)] blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />

        <div className="relative flex items-center gap-3">
          <Image src="/brand/leadzen-mark.png" alt="" width={56} height={56} priority className="size-14" />
          <span className="text-2xl font-semibold tracking-tight text-white">{APP_NAME}</span>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-[0.18em] text-emerald-300/90 uppercase">B2B sales CRM</p>
            <h2 className="text-4xl leading-tight font-semibold tracking-tight text-white">
              More leads.{" "}
              <span className="bg-gradient-to-r from-sky-300 to-emerald-300 bg-clip-text text-transparent">Greater growth.</span>
            </h2>
            <p className="text-base leading-relaxed text-sidebar-foreground/80">
              One workspace for your sales team — from the first inquiry to the delivered order.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
                <span className="mb-3 grid size-9 place-items-center rounded-lg bg-gradient-to-br from-[oklch(0.56_0.19_258)] to-[oklch(0.6_0.13_170)] text-white shadow-sm">
                  <f.icon className="size-4.5" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-white">{f.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/70">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
      </aside>

      <main className="relative flex items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -top-32 right-0 size-96 rounded-full bg-[oklch(0.56_0.19_258/0.08)] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 -left-20 size-80 rounded-full bg-[oklch(0.68_0.14_165/0.08)] blur-3xl" />
        <div className="relative w-full max-w-[26rem]">
          <Image src="/brand/leadzen-logo.png" alt={`${APP_NAME} — More leads. Greater growth.`} width={900} height={226} priority className="mx-auto mb-8 h-16 w-auto sm:h-20" />
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xl shadow-[oklch(0.22_0.045_262/0.06)] sm:p-8">{children}</div>
          <p className="mt-6 text-center text-xs text-muted-foreground">Protected by role-based access control. Need an account? Ask your administrator.</p>
        </div>
      </main>
    </div>
  );
}
