"use client";

// The feed.
//
//   documents  — activities, kudos and comments are collections, written
//                straight from the browser and adjudicated by security rules
//   realtime   — new runs and kudos arrive over one WebSocket, no polling
//   storage    — photos go through this app's upload route (a browser key
//                cannot write files), and are read straight from OxiBase
//   time-series— the run's distance/pace is appended by /api/activity

import { useCallback, useEffect, useRef, useState } from "react";
import { oxibase, photoUrl } from "@/lib/oxibase";
import { useSession, authHeader } from "@/lib/session";

type Activity = {
  _id?: number;
  owner: string;
  note: string;
  distance_km: number;
  duration_s: number;
  photo_key?: string | null;
  ts: number;
};

type Kudos = { _id?: number; activity_ts: number; owner: string };

const fmtPace = (a: Activity) => {
  const pace = a.duration_s / 60 / a.distance_km;
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
};

const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

const when = (ts: number) => {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return new Date(ts).toLocaleDateString();
};

export default function Feed() {
  const { session, ready } = useSession();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [kudos, setKudos] = useState<Kudos[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const db = oxibase();
    const [a, k] = await Promise.all([
      db.from("activities").select("*").order("ts", { ascending: false }).limit(30),
      db.from("kudos").select("*"),
    ]);
    if (a.error) setError(a.error.message);
    else setActivities((a.data ?? []) as Activity[]);
    if (!k.error) setKudos((k.data ?? []) as Kudos[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates. The server enforces read rules on the stream too, so a
  // subscriber only ever receives rows it would have been allowed to fetch.
  //
  // Wait for the stored session to be rehydrated first: opening the socket
  // before that would connect as the anonymous key and then have to be torn
  // down and re-dialled the moment the session lands.
  useEffect(() => {
    if (!ready) return;
    const db = oxibase();
    const runs = db.subscribe("activities", (e) => {
      if (e.op === "insert" && e.doc) setActivities((prev) => [e.doc as unknown as Activity, ...prev]);
      if (e.op === "delete") load();
    });
    const likes = db.subscribe("kudos", () => {
      db.from("kudos")
        .select("*")
        .then(({ data }) => data && setKudos(data as Kudos[]));
    });
    return () => {
      runs.unsubscribe();
      likes.unsubscribe();
    };
  }, [load, ready, session?.token]);

  const kudosFor = (ts: number) => kudos.filter((k) => k.activity_ts === ts);
  const iGaveKudos = (ts: number) => !!session && kudosFor(ts).some((k) => k.owner === session.email);

  async function toggleKudos(a: Activity) {
    if (!session) return;
    const db = oxibase();
    if (iGaveKudos(a.ts)) {
      await db.from("kudos").delete().eq("activity_ts", a.ts).eq("owner", session.email);
    } else {
      await db.from("kudos").insert({ activity_ts: a.ts, owner: session.email });
    }
    const { data } = await db.from("kudos").select("*");
    if (data) setKudos(data as Kudos[]);
  }

  return (
    <>
      <h1>Club feed</h1>
      <p className="muted small">
        Every run below is a document; kudos arrive live over a WebSocket. Sign in to post — the
        security rules refuse writes from a key that isn&apos;t yours.
      </p>

      {ready && session && <PostRun onPosted={load} />}
      {ready && !session && (
        <div className="card muted small">
          You&apos;re browsing as the anonymous key: reads are public, writes are denied by the
          rules. <a href="/login">Sign in</a> to post a run.
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && activities.length === 0 && (
        <div className="card muted">No runs yet. Be the first.</div>
      )}

      {activities.map((a) => (
        <article className="card" key={a._id ?? a.ts}>
          <div className="row">
            <div className="avatar">{a.owner.slice(0, 1).toUpperCase()}</div>
            <div className="grow">
              <strong>{a.owner.split("@")[0]}</strong>
              <div className="muted small">{when(a.ts)}</div>
            </div>
            <span className="engine">documents</span>
          </div>

          {a.note && <p style={{ margin: "10px 0 6px" }}>{a.note}</p>}

          <div className="row" style={{ gap: 18, marginTop: 8 }}>
            <div>
              <div className="muted small">Distance</div>
              <div className="stat">{a.distance_km.toFixed(2)} km</div>
            </div>
            <div>
              <div className="muted small">Time</div>
              <div className="stat">{fmtDuration(a.duration_s)}</div>
            </div>
            <div>
              <div className="muted small">Pace</div>
              <div className="stat">{fmtPace(a)}</div>
            </div>
          </div>

          {a.photo_key && <img className="photo" src={photoUrl(a.photo_key)} alt="" />}

          <div className="row" style={{ marginTop: 12 }}>
            <button
              className={`small kudos ${iGaveKudos(a.ts) ? "on" : ""}`}
              disabled={!session}
              onClick={() => toggleKudos(a)}
              title={session ? "Give kudos" : "Sign in to give kudos"}
            >
              ♥ {kudosFor(a.ts).length}
            </button>
            <span className="muted small">
              {kudosFor(a.ts).length === 0 ? "no kudos yet" : kudosFor(a.ts).map((k) => k.owner.split("@")[0]).join(", ")}
            </span>
          </div>
        </article>
      ))}
    </>
  );
}

function PostRun({ onPosted }: { onPosted: () => void }) {
  const { session } = useSession();
  const [note, setNote] = useState("");
  const [km, setKm] = useState("");
  const [mins, setMins] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    const distance = Number(km);
    const duration = Math.round(Number(mins) * 60);
    if (!(distance > 0) || !(duration > 0)) {
      setError("distance and time are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 1. The photo, if any — via our route handler, since writing to storage
      //    needs the service key and that never reaches a browser.
      let photo_key: string | null = null;
      const file = fileRef.current?.files?.[0];
      if (file) photo_key = await uploadPhoto(file, authHeader(session));

      const ts = Date.now();
      // 2. The run itself, written directly by the browser — the rules decide.
      const { error: insertError } = await oxibase()
        .from("activities")
        .insert({ owner: session.email, note, distance_km: distance, duration_s: duration, photo_key, ts });
      if (insertError) throw new Error(insertError.message);

      // 3. The time-series point, again via the server (no rules exist for the
      //    series engine, so a browser key may read it but never append).
      const res = await fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(session) },
        body: JSON.stringify({ distance_km: distance, duration_s: duration, ts }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "could not record the run");

      setNote("");
      setKm("");
      setMins("");
      if (fileRef.current) fileRef.current.value = "";
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={post}>
      <div className="row between">
        <h2>Log a run</h2>
        <span className="engine">documents + storage + tsdb</span>
      </div>
      <label className="field">
        How did it go?
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Easy morning loop by the river" />
      </label>
      <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
        <label className="field grow">
          Distance (km)
          <input value={km} onChange={(e) => setKm(e.target.value)} inputMode="decimal" placeholder="8.2" />
        </label>
        <label className="field grow">
          Time (minutes)
          <input value={mins} onChange={(e) => setMins(e.target.value)} inputMode="decimal" placeholder="41" />
        </label>
      </div>
      <label className="field">
        Photo (optional)
        <input ref={fileRef} type="file" accept="image/*" />
      </label>
      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={busy}>
        {busy ? "Posting…" : "Post run"}
      </button>
    </form>
  );
}

/**
 * Downscale in the browser, then upload. Vercel caps a function body at
 * 4.5 MB, and a modern phone photo is bigger than that — so shrinking is a
 * requirement, not a nicety.
 */
async function uploadPhoto(file: File, headers: Record<string, string>): Promise<string> {
  const blob = await downscale(file, 1600, 0.82);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": blob.type, ...headers },
    body: blob,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "upload failed");
  return (await res.json()).key as string;
}

function downscale(file: File, maxEdge: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode the image"))), "image/jpeg", quality);
    };
    img.onerror = () => reject(new Error("could not read the image"));
    img.src = URL.createObjectURL(file);
  });
}
