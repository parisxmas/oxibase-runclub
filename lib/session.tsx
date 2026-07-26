"use client";

// Session state, shared by the whole app.
//
// The SDK client starts life holding the anon key. On load we rehydrate any
// stored session into it (`auth.setSession`), so a reload keeps you signed in
// and every subsequent `.from()` call runs as you — which is what the security
// rules key off.
//
// Access tokens are short-lived and the SDK renews them behind our back, which
// **rotates the refresh token** (the server revokes the one presented). So we
// subscribe to `onAuthStateChange` and re-store the session on every rotation:
// keeping only what sign-in returned would leave a spent token in localStorage,
// and the next reload could not resume with it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  // The signed-in address, which token rotations do not carry.
  const emailRef = useRef("");

  useEffect(() => {
    // Registered before rehydrating, so a refresh triggered by the very first
    // request is still persisted.
    const off = oxibase().auth.onAuthStateChange((_event, s) => {
      if (!s) {
        clearSession();
        setSession(null);
        return;
      }
      const email = emailRef.current;
      saveSession(s.token, s.refreshToken, email);
      setSession({ email, token: s.token, refreshToken: s.refreshToken });
    });

    const stored = loadSession();
    if (stored) {
      emailRef.current = stored.email;
      oxibase().auth.setSession({ token: stored.token, refreshToken: stored.refreshToken });
      setSession(stored);
    }
    setReady(true);
    return off;
  }, []);

  const adopt = useCallback((s: NonNullable<Session>) => {
    emailRef.current = s.email;
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

// There is deliberately no `authHeader(session)` helper: the rendered token can
// be a renewal behind, and a route handler answers a stale one with 401. Call
// this app's routes through `fetchAuthed` (lib/oxibase), which reads the live
// token and retries once after a refresh.
