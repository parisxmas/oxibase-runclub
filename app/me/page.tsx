"use client";

// Your page.
//
//   time-series — your pace history, downsampled by the engine (not by us):
//                 `agg=mean&interval=<ms>` returns one point per week
//   documents   — a private training journal whose read rule references
//                 `doc.owner`, so an unfiltered select returns only your rows.
//                 The filtering is the server's, not this query's.

import { useCallback, useEffect, useState } from "react";
import { oxibase } from "@/lib/oxibase";
import { useSession } from "@/lib/session";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const URL_ = process.env.NEXT_PUBLIC_OXIBASE_URL!;
const REF = process.env.NEXT_PUBLIC_OXIBASE_REF!;

type Bucket = { ts: number; value: number };
type JournalEntry = { _id?: number; owner: string; ts: number; body: string };

export default function Me() {
  const { session, ready } = useSession();
  const [weeks, setWeeks] = useState<Bucket[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadJournal = useCallback(async () => {
    const { data, error: err } = await oxibase()
      .from("journal")
      .select("*")
      .order("ts", { ascending: false })
      .limit(20);
    if (err) setError(err.message);
    else setJournal((data ?? []) as JournalEntry[]);
  }, []);

  useEffect(() => {
    if (!session) return;
    loadJournal();

    // Weekly mean pace, aggregated server-side. postgrest-js has no vocabulary
    // for the engine's `agg`/`interval` extension, so this one is a plain fetch
    // against the same PostgREST URL with the tsdb profile.
    const start = Date.now() - 12 * WEEK_MS;
    const qs = new URLSearchParams({
      select: "pace_min_km",
      runner: `eq.${session.email}`,
      ts: `gte.${start}`,
      agg: "mean",
      interval: String(WEEK_MS),
    });
    fetch(`${URL_}/${REF}/rest/v1/runs?${qs}`, {
      headers: { "Accept-Profile": "tsdb", Authorization: `Bearer ${session.token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setWeeks(Array.isArray(rows) ? (rows as Bucket[]).filter((b) => b.value != null) : []))
      .catch(() => setWeeks([]));
  }, [session, loadJournal]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !entry.trim()) return;
    setBusy(true);
    const { error: err } = await oxibase()
      .from("journal")
      .insert({ owner: session.email, body: entry.trim(), ts: Date.now() });
    setBusy(false);
    if (err) return setError(err.message);
    setEntry("");
    loadJournal();
  }

  if (!ready) return <p className="muted">Loading…</p>;
  if (!session)
    return (
      <div className="card">
        <h2>Sign in to see your training</h2>
        <p className="muted small">Your pace history and journal are yours alone.</p>
        <a className="btn" href="/login" style={{ textDecoration: "none" }}>
          Sign in
        </a>
      </div>
    );

  const max = Math.max(...weeks.map((w) => w.value), 1);

  return (
    <>
      <h1>{session.email.split("@")[0]}</h1>
      <p className="muted small">{session.email}</p>

      <section className="card">
        <div className="row between">
          <h2>Average pace, by week</h2>
          <span className="engine">time-series</span>
        </div>
        {weeks.length === 0 ? (
          <p className="muted small">No runs recorded yet — post one on the feed.</p>
        ) : (
          <>
            <div className="spark" title="mean pace per week">
              {weeks.map((w) => (
                <i key={w.ts} style={{ height: `${Math.max(6, (w.value / max) * 100)}%` }} />
              ))}
            </div>
            <div className="row between muted small" style={{ marginTop: 6 }}>
              <span>{new Date(weeks[0].ts).toLocaleDateString()}</span>
              <span>
                latest {weeks[weeks.length - 1].value.toFixed(2)} min/km · lower is faster
              </span>
            </div>
          </>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>
          One bar per week. The bucketing is done by the engine (<code>agg=mean</code>,{" "}
          <code>interval=1w</code>), so the browser downloads twelve numbers rather than every run.
        </p>
      </section>

      <section className="card">
        <div className="row between">
          <h2>Private journal</h2>
          <span className="engine">row-level security</span>
        </div>
        <p className="muted small">
          This query asks for <em>every</em> entry in the collection. You get only your own, because
          the read rule is <code>auth.username == doc.owner</code> and the server applies it per
          row.
        </p>
        <form onSubmit={addEntry}>
          <label className="field">
            How are the legs?
            <input
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="Calves tight, easy week ahead"
            />
          </label>
          <button className="primary" disabled={busy || !entry.trim()}>
            Add entry
          </button>
        </form>
        {error && <div className="error">{error}</div>}
        <div style={{ marginTop: 12 }}>
          {journal.length === 0 && <p className="muted small">Nothing yet.</p>}
          {journal.map((j) => (
            <div key={j._id ?? j.ts} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
              <div className="muted small">{new Date(j.ts).toLocaleString()}</div>
              <div>{j.body}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
