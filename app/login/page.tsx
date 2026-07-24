"use client";

// Every sign-in method OxiBase offers, in one screen: password, a passwordless
// magic link, and social providers. Which ones appear is not hard-coded — the
// project tells us via `auth.getSettings()`.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { oxibase } from "@/lib/oxibase";
import { useSession } from "@/lib/session";
import type { OAuthProvider } from "oxibase-js";

export default function Login() {
  const router = useRouter();
  const { adopt, session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [magicLink, setMagicLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  useEffect(() => {
    oxibase()
      .auth.getSettings()
      .then((s) => {
        setProviders(s.providers);
        setMagicLink(s.magicLink);
      });
  }, []);

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const auth = oxibase().auth;
    const res =
      mode === "signup"
        ? await auth.signUp({ email, password })
        : await auth.signInWithPassword({ email, password });
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.verificationRequired) {
      return setNotice("Check your inbox to confirm your address, then sign in.");
    }
    if (res.token) {
      adopt({ email, token: res.token, refreshToken: res.refreshToken ?? "" });
      router.push("/");
    }
  }

  async function withMagicLink() {
    if (!email) return setError("enter your email first");
    setBusy(true);
    setError(null);
    const { error: err } = await oxibase().auth.signInWithMagicLink({
      email,
      redirectTo: `${location.origin}/auth/callback`,
    });
    setBusy(false);
    if (err) return setError(err);
    setNotice("Sign-in link sent — check your inbox. It works once and lasts 15 minutes.");
  }

  async function forgotPassword() {
    if (!email) return setError("enter your email first");
    setBusy(true);
    setError(null);
    // Always resolves the same way, whether or not the address is registered —
    // the server will not confirm who has an account here.
    const { error: err } = await oxibase().auth.resetPasswordForEmail(email);
    setBusy(false);
    if (err) return setError(err);
    setNotice("If that address has an account, a reset link is on its way. It lasts an hour.");
  }

  function withProvider(provider: OAuthProvider) {
    const { error: err } = oxibase().auth.signInWithOAuth({
      provider,
      redirectTo: `${location.origin}/auth/callback`,
    });
    if (err) setError(err);
  }

  return (
    <>
      <h1>Sign in</h1>
      <p className="muted small">
        Your account lives in this project, not in the app — OxiBase issues the token and the
        security rules read your identity from it.
      </p>

      <div className="card">
        <form onSubmit={withPassword}>
          <label className="field">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="at least 8 characters"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
          {error && <div className="error">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
          <div className="row">
            <button className="primary" disabled={busy}>
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "I already have an account" : "Create an account"}
            </button>
            {mode === "signin" && (
              <button type="button" className="ghost small" disabled={busy} onClick={forgotPassword}>
                Forgot password?
              </button>
            )}
          </div>
        </form>

        {magicLink && (
          <>
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "16px 0" }} />
            <div className="row between">
              <div>
                <strong className="small">Passwordless</strong>
                <div className="muted small">We email you a one-time sign-in link.</div>
              </div>
              <button type="button" onClick={withMagicLink} disabled={busy}>
                Email me a link
              </button>
            </div>
          </>
        )}

        {providers.length > 0 && (
          <>
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "16px 0" }} />
            <div className="row">
              {providers.map((p) => (
                <button key={p} type="button" onClick={() => withProvider(p)} className="grow">
                  Continue with {p === "github" ? "GitHub" : "Google"}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="muted small">
        Signing in with a provider or a link matches you to an existing account by verified email,
        so you land in one account however you arrive.
      </p>
    </>
  );
}
