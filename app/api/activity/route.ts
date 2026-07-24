// POST /api/activity — record one run in the time-series engine.
//
// The run itself is a *document*, and the browser writes that directly: the
// collection's security rules decide whether it may. What the browser cannot
// do is append to a series, because the time-series engine has no per-row rules
// to adjudicate a write (so writing it requires a service_role key — see
// `rest_permitted` in the server). That privileged step happens here, tagged
// with the caller's **verified** identity, so nobody can write points into
// another runner's history.

import { verifyCaller, service } from "@/lib/server";

export async function POST(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) {
    return Response.json({ error: "sign in to record a run" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    distance_km?: number;
    duration_s?: number;
    ts?: number;
  } | null;

  const distance = Number(body?.distance_km);
  const duration = Number(body?.duration_s);
  if (!Number.isFinite(distance) || distance <= 0 || distance > 500) {
    return Response.json({ error: "distance_km must be between 0 and 500" }, { status: 400 });
  }
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400) {
    return Response.json({ error: "duration_s must be between 0 and 86400" }, { status: 400 });
  }

  const point = {
    ts: Number.isFinite(Number(body?.ts)) ? Number(body!.ts) : Date.now(),
    // A string value becomes a **tag** — the series is partitioned per runner.
    runner: caller.email,
    // Numbers become **fields**.
    distance_km: distance,
    pace_min_km: duration / 60 / distance,
  };

  const res = await service("POST", "/rest/v1/runs", {
    body: JSON.stringify(point),
    headers: { "Content-Type": "application/json", "Content-Profile": "tsdb" },
  });
  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ error: `could not record the run: ${detail.slice(0, 200)}` }, {
      status: 502,
    });
  }
  return Response.json({ ok: true, pace_min_km: point.pace_min_km }, { status: 201 });
}
