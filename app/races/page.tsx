"use client";

// Club races — the relational half of the app.
//
// Races and signups are SQL tables with a foreign key, and the standings are a
// join plus an aggregate. They live in the same project as the feed's document
// collections; a collection and a table can never share a name, so `.from()`
// dispatches to the right engine on its own. `.sql()` is SELECT-only for a
// browser key, enforced by the server.

import { useCallback, useEffect, useState } from "react";
import { oxibase } from "@/lib/oxibase";
import { useSession } from "@/lib/session";

type Race = { id: number; name: string; distance_km: number; starts_at: number; city: string | null };
type Standing = { race: string; runner: string; finish_seconds: number };

const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function Races() {
  const { session } = useSession();
  const [races, setRaces] = useState<Race[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [mine, setMine] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const db = oxibase();

    // The table is addressed through the same builder as a collection.
    const { data, error: err } = await db
      .from("races")
      .select("*")
      .order("starts_at", { ascending: true });
    if (err) setError(err.message);
    else setRaces((data ?? []) as Race[]);

    // A join + ordering: exactly what the SQL engine is for.
    const res = await db.sql(
      `SELECT r.name AS race, s.runner, s.finish_seconds
         FROM signups s
         JOIN races r ON r.id = s.race_id
        WHERE s.finish_seconds IS NOT NULL
        ORDER BY r.starts_at DESC, s.finish_seconds ASC
        LIMIT 20`,
    );
    if (res.error) setError(res.error);
    else {
      const rows = res.results?.[0]?.rows ?? [];
      setStandings(
        rows.map((r) => ({ race: String(r[0]), runner: String(r[1]), finish_seconds: Number(r[2]) })),
      );
    }

    if (session) {
      const signups = await db.sql("SELECT race_id FROM signups WHERE runner = ?", [session.email]);
      const ids = (signups.results?.[0]?.rows ?? []).map((r) => Number(r[0]));
      setMine(new Set(ids));
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  // Signing up is a *write*, and a browser key may not write SQL — so it goes
  // through the same PostgREST surface, where the engine accepts an insert.
  async function signUp(race: Race) {
    if (!session) return;
    setBusy(true);
    setError(null);
    const { error: err } = await oxibase()
      .from("signups")
      .insert({ race_id: race.id, runner: session.email });
    setBusy(false);
    if (err) setError(err.message);
    else load();
  }

  return (
    <>
      <h1>Club races</h1>
      <p className="muted small">
        Races are SQL rows, not documents — a race has many signups through a foreign key, and the
        standings below are a join.
      </p>

      {error && <div className="error">{error}</div>}

      <section className="card">
        <div className="row between">
          <h2>Calendar</h2>
          <span className="engine">sql</span>
        </div>
        {races.length === 0 ? (
          <p className="muted small">No races scheduled. Run `npm run seed` to load the demo set.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Race</th>
                <th>Distance</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {races.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.city && <div className="muted small">{r.city}</div>}
                  </td>
                  <td className="stat">{Number(r.distance_km).toFixed(1)} km</td>
                  <td className="muted small">{new Date(Number(r.starts_at)).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right" }}>
                    {mine.has(r.id) ? (
                      <span className="tag">signed up</span>
                    ) : (
                      <button className="small" disabled={!session || busy} onClick={() => signUp(r)}>
                        {session ? "Sign up" : "Sign in"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="row between">
          <h2>Recent results</h2>
          <span className="engine">sql · join</span>
        </div>
        {standings.length === 0 ? (
          <p className="muted small">No finish times recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Race</th>
                <th>Runner</th>
                <th style={{ textAlign: "right" }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={i}>
                  <td>{s.race}</td>
                  <td>{s.runner.split("@")[0]}</td>
                  <td className="stat" style={{ textAlign: "right" }}>
                    {hms(s.finish_seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
