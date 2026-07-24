import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: "Run Club",
  description:
    "A running club app built entirely on OxiBase — auth, documents, SQL, time-series, realtime, storage and row-level security.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <Nav />
          <main className="shell">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
