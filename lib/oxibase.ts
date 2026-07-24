// The browser client.
//
// It carries the project's **anon key** — a public value by design. Everything
// it can do is bounded by the server: document writes are adjudicated by
// per-collection security rules, and it cannot write files or time-series at
// all (those go through this app's route handlers, see lib/server.ts).
//
// Once a user signs in, `oxibase.auth` swaps the anon key for that user's
// token, so the same calls then run as them and the rules see their identity.

"use client";

import { createClient, type OxibaseClient } from "oxibase-js";

const URL_ = process.env.NEXT_PUBLIC_OXIBASE_URL!;
const REF = process.env.NEXT_PUBLIC_OXIBASE_REF!;
const ANON = process.env.NEXT_PUBLIC_OXIBASE_ANON_KEY!;

let client: OxibaseClient | null = null;

/** The shared browser client (one per tab, so one realtime socket). */
export function oxibase(): OxibaseClient {
  if (!client) {
    client = createClient(URL_, ANON, {
      ref: REF,
      // `<host>/<project>/rest/v1/…` — path-based tenancy, no wildcard cert.
      tenantInPath: true,
      // The control plane signs end-user tokens, so `.auth` needs its origin.
      authUrl: URL_,
      // The realtime endpoint is one socket for the whole deployment — the
      // project is chosen inside it, not in the path. Stated explicitly so the
      // app does not depend on the SDK's default for this.
      realtimeUrl: `${URL_.replace(/^http/, "ws")}/ws`,
    });
  }
  return client;
}

/** A stored object's public URL (photos are world-readable by design here). */
export function photoUrl(key: string): string {
  return `${URL_}/${REF}/api/storage/photos/${encodeURIComponent(key)}`;
}

export const SESSION_KEY = "runclub_session";

/** Persist the session so a reload keeps you signed in. */
export function saveSession(token: string, refreshToken: string, email: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, refreshToken, email }));
}

export function loadSession(): { token: string; refreshToken: string; email: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
