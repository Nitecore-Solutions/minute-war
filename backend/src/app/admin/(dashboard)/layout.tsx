import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken, loadUser } from "@/lib/auth";
import NavItem from "./NavItem";
import SignOutButton from "./SignOutButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAV = [
  {
    group: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: "◉" }],
  },
  {
    group: "Players",
    items: [
      { href: "/admin/users", label: "Users", icon: "👥" },
      { href: "/admin/leaderboard", label: "Leaderboard", icon: "🏆" },
      { href: "/admin/wallet", label: "Coins & ledger", icon: "🪙" },
    ],
  },
  {
    group: "Content",
    items: [
      { href: "/admin/games", label: "Mini games", icon: "🎮" },
      { href: "/admin/questions", label: "Question bank", icon: "❓" },
      { href: "/admin/badges", label: "Badges", icon: "🏅" },
    ],
  },
  {
    group: "Live",
    items: [
      { href: "/admin/battles", label: "Battles", icon: "⚔️" },
      { href: "/admin/challenges", label: "Challenges", icon: "🤝" },
    ],
  },
  {
    group: "Business",
    items: [
      { href: "/admin/sponsors", label: "Sponsors & ads", icon: "📣" },
      { href: "/admin/settings", label: "Settings", icon: "⚙️" },
      { href: "/admin/audit", label: "Audit log", icon: "📋" },
    ],
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const session = await verifyToken(store.get("mw_admin_session")?.value ?? null);

  if (!session || session.role !== "admin") {
    redirect("/admin/login");
  }

  const user = await loadUser(session.userId);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          RushArena
          <small>Operations</small>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="nav-group">{section.group}</div>
              {section.items.map((item) => (
                <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} />
              ))}
            </div>
          ))}
        </nav>

        <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,.1)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
            {user?.name ?? "Admin"}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
            ID {user?.playerId}
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}