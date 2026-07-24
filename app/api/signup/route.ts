// POST /api/signup   { race_id }  — enter a race
// DELETE /api/signup?race_id=…    — withdraw
//
// Race entries are SQL rows, and SQL has no per-row rules, so the data plane
// only accepts table writes from a service_role key. That makes this route the
// place where the per-user rule lives instead: you may enter and withdraw
// yourself, and nobody else — the runner is taken from the verified token, not
// from the request body.

import { verifyCaller, service } from "@/lib/server";

async function sql(text: string, params: unknown[]) {
  const res = await service("POST", "/api/sql", {
    body: JSON.stringify({ sql: text, params }),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 200));
  return res.json();
}

export async function POST(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return Response.json({ error: "sign in to enter a race" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { race_id?: number } | null;
  const raceId = Number(body?.race_id);
  if (!Number.isInteger(raceId) || raceId <= 0) {
    return Response.json({ error: "race_id is required" }, { status: 400 });
  }

  try {
    // Entering twice is not an error, it is a no-op.
    const existing = await sql("SELECT id FROM signups WHERE race_id = ? AND runner = ?", [
      raceId,
      caller.email,
    ]);
    const rows = existing.results?.[0]?.rows ?? [];
    if (rows.length === 0) {
      await sql("INSERT INTO signups (race_id, runner) VALUES (?, ?)", [raceId, caller.email]);
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return Response.json({ error: "sign in to withdraw" }, { status: 401 });

  const raceId = Number(new URL(req.url).searchParams.get("race_id"));
  if (!Number.isInteger(raceId) || raceId <= 0) {
    return Response.json({ error: "race_id is required" }, { status: 400 });
  }

  try {
    // Scoped to the caller: the runner column is never taken from the request.
    await sql("DELETE FROM signups WHERE race_id = ? AND runner = ?", [raceId, caller.email]);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
