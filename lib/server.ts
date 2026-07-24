// The server half of the app.
//
// Two things a browser key deliberately cannot do — upload files and append
// time-series points — happen here, with the service_role key that never
// leaves the server. Both are gated on the caller proving who they are: we
// verify their access token against the **project's public key**, published at
// the control plane's JWKS endpoint. The server therefore holds no signing
// material for user identity either; it only checks signatures.

import "server-only";

const URL_ = process.env.NEXT_PUBLIC_OXIBASE_URL!;
const REF = process.env.NEXT_PUBLIC_OXIBASE_REF!;
const SERVICE_KEY = process.env.OXIBASE_SERVICE_KEY!;

const base = `${URL_}/${REF}`;

export function serviceHeaders(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${SERVICE_KEY}`, ...extra };
}

/** A data-plane call made as the project's service role. */
export async function service(
  method: string,
  path: string,
  init: { body?: BodyInit; headers?: Record<string, string> } = {},
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: serviceHeaders(init.headers),
    body: init.body,
    cache: "no-store",
  });
}

// ── Verifying the caller ────────────────────────────────────────────────────

type Jwk = { kty: string; crv: string; x: string; y: string };
let cachedKey: { key: CryptoKey; at: number } | null = null;

/** The project's ES256 public key, from JWKS, cached for an hour. */
async function projectKey(): Promise<CryptoKey> {
  if (cachedKey && Date.now() - cachedKey.at < 3_600_000) return cachedKey.key;
  const res = await fetch(`${URL_}/platform/v1/projects/${REF}/jwks`, { cache: "no-store" });
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const jwk = keys?.[0];
  if (!jwk) throw new Error("no key in JWKS");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  cachedKey = { key, at: Date.now() };
  return key;
}

function b64urlToBytes(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export type Caller = { email: string; role: string };

/**
 * Verify the `Authorization: Bearer` token on a request and return who it is.
 * `null` when absent, malformed, expired, or not signed by this project — the
 * caller is then treated as anonymous and refused.
 */
export async function verifyCaller(req: Request): Promise<Caller | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      await projectKey(),
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(new Uint8Array(b64urlToBytes(parts[1])))) as {
      sub?: string;
      role?: string;
      exp?: number;
    };
    if (!claims.sub || !claims.exp || claims.exp * 1000 < Date.now()) return null;
    // Only an end-user token may act here. An `admin` token would be someone
    // holding the service key, which has no business coming from a browser.
    if (claims.role !== "authenticated") return null;
    return { email: claims.sub, role: claims.role };
  } catch {
    return null;
  }
}
