"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sidebar link that knows whether it is the current page.
 *
 * Split out as a client component because usePathname is a hook, and the
 * surrounding layout is a server component that must stay one.
 */
export default function NavItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  const pathname = usePathname();

  // "/" must not light up on every page, so exact-match it; everything else
  // stays highlighted for its whole section.
  const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      scroll={false}
      className={active ? "nav-item active" : "nav-item"}
      aria-current={active ? "page" : undefined}
    >
      <span aria-hidden style={{ width: 18 }}>
        {icon}
      </span>
      {label}
    </Link>
  );
}