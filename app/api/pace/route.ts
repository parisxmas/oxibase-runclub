// GET /api/pace — your weekly average pace.
//
// The `runs` series is marked private (`read: false`), because a time-series
// has no row-level policy: readable at all means readable by everyone, and a
// runner's training history is theirs. So the read happens here, with the
// service key, filtered to the caller's verified identity — the same shape as
// the upload and race-entry routes.

import { verifyCaller, service } from "@/lib/server";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS = 12;

export async function GET(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return Response.json({ error: "sign in to see your pace" }, { status: 401 });

  const qs = new URLSearchParams({
    select: "pace_min_km",
    // The tag filter is the caller's own address, taken from the token.
    runner: `eq.${caller.email}`,
    ts: `gte.${Date.now() - WEEKS * WEEK_MS}`,
    agg: "mean",
    interval: String(WEEK_MS),
  });

  const res = await service("GET", `/rest/v1/runs?${qs}`, {
    headers: { "Accept-Profile": "tsdb" },
  });
  if (!res.ok) {
    return Response.json({ error: "could not read your pace history" }, { status: 502 });
  }
  const rows = (await res.json()) as { ts: number; value: number | null }[];
  return Response.json(Array.isArray(rows) ? rows.filter((r) => r.value != null) : []);
}
