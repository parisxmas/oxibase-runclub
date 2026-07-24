"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";

const LINKS = [
  ["/", "Feed"],
  ["/races", "Races"],
  ["/me", "You"],
] as const;

export function Nav() {
  const path = usePathname();
  const { session, signOut, ready } = useSession();

  return (
    <nav className="top">
      <Link href="/" className="brand" style={{ textDecoration: "none" }}>
        run<span>club</span>
      </Link>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? "active" : undefined}>
          {label}
        </Link>
      ))}
      {!ready ? null : session ? (
        <button className="ghost small" onClick={signOut} title={session.email}>
          Sign out
        </button>
      ) : (
        <Link href="/login" className="btn" style={{ textDecoration: "none", fontSize: 13, padding: "5px 12px" }}>
          Sign in
        </Link>
      )}
    </nav>
  );
}
