"use client";

// Where a magic link or a social sign-in lands. The session arrives in the URL
// *fragment* — never sent to a server, never in a log — and the SDK adopts it
// and strips it from the address bar.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { oxibase } from "@/lib/oxibase";
import { useSession } from "@/lib/session";

export default function Callback() {
  const router = useRouter();
  const { adopt } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const result = oxibase().auth.getSessionFromUrl();
    if (!result) {
      setError("This page is where a sign-in link returns you — there was nothing to complete.");
      return;
    }
    if (result.error || !result.token) {
      setError(result.error ?? "the sign-in did not complete");
      return;
    }
    // The token carries the identity; `sub` is the email.
    let email = "";
    try {
      email = JSON.parse(atob(result.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub ?? "";
    } catch {
      /* the session still works without a decoded label */
    }
    adopt({ email, token: result.token, refreshToken: result.refreshToken ?? "" });
    router.replace("/");
  }, [adopt, router]);

  return (
    <div className="card">
      {error ? (
        <>
          <h2>Sign-in incomplete</h2>
          <p className="muted small">{error}</p>
          <a className="btn" href="/login" style={{ textDecoration: "none" }}>
            Back to sign in
          </a>
        </>
      ) : (
        <p className="muted">Signing you in…</p>
      )}
    </div>
  );
}
