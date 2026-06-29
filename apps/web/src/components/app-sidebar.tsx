"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@inova/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/payables", label: "Contas a Pagar", icon: "↓" },
  { href: "/receivables", label: "Contas a Receber", icon: "↑" },
  { href: "/reconciliation", label: "Conciliação", icon: "⇄" },
  { href: "/support", label: "Atendimento", icon: "◎" },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="ina-sidebar">
      <Link href="/dashboard" className="ina-sidebar__brand" style={{ textDecoration: "none", color: "inherit" }}>
        <Logo size={40} />
      </Link>
      <nav className="ina-nav" aria-label="Principal">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`ina-nav__link${pathname === item.href ? " ina-nav__link--active" : ""}`}
          >
            <span className="ina-nav__icon" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
