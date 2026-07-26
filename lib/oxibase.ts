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

/**
 * Where to render a run photo from.
 *
 * Not the storage URL directly: reads are authenticated and an `<img>` cannot
 * carry a token, so this app proxies them (see app/api/photo). The key is
 * already URL-safe and contains its own separators, so it is passed through
 * verbatim — encoding it again would escape those separators and 404.
 */
export function photoUrl(key: string): string {
  return `/api/photo/${key}`;
}

/**
 * Call one of this app's own route handlers as the signed-in user.
 *
 * Deliberately not the token React last rendered: the SDK renews access tokens
 * on its own schedule, so a call that lands after expiry — but before any
 * `.from()` read has triggered a refresh — would carry a stale token and be
 * refused (silently, wherever the caller treats !ok as "no data"). This reads
 * the live token, and on a 401 refreshes once and retries. Parallel callers
 * cause a single refresh, coalesced inside the SDK.
 */
export async function fetchAuthed(input: string, init: RequestInit = {}): Promise<Response> {
  const auth = oxibase().auth;
  const send = () => {
    const token = auth.getSession()?.token;
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  const res = await send();
  if (res.status !== 401 || !auth.getSession()) return res;
  const { error } = await auth.refreshSession();
  return error ? res : send();
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
