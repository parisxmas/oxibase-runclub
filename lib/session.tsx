"use client";

// Session state, shared by the whole app.
//
// The SDK client starts life holding the anon key. On load we rehydrate any
// stored session into it (`auth.setSession`), so a reload keeps you signed in
// and every subsequent `.from()` call runs as you — which is what the security
// rules key off.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { oxibase, loadSession, saveSession, clearSession } from "./oxibase";

type Session = { email: string; token: string; refreshToken: string } | null;

type Ctx = {
  session: Session;
  /** Adopt a session (after sign-in, or from an OAuth/magic-link redirect). */
  adopt: (s: NonNullable<Session>) => void;
  signOut: () => void;
  /** False until the stored session has been read — avoids a signed-out flash. */
  ready: boolean;
};

const SessionContext = createContext<Ctx>({
  session: null,
  adopt: () => {},
  signOut: () => {},
  ready: false,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = loadSession();
    if (stored) {
      oxibase().auth.setSession({ token: stored.token, refreshToken: stored.refreshToken });
      setSession(stored);
    }
    setReady(true);
  }, []);

  const adopt = useCallback((s: NonNullable<Session>) => {
    oxibase().auth.setSession({ token: s.token, refreshToken: s.refreshToken });
    saveSession(s.token, s.refreshToken, s.email);
    setSession(s);
  }, []);

  const signOut = useCallback(() => {
    oxibase().auth.signOut();
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, adopt, signOut, ready }), [session, adopt, signOut, ready]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

/** The bearer token for calls to this app's own route handlers. */
export function authHeader(session: Session): Record<string, string> {
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}
