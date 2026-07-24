// Demo data, so a visitor sees a living club rather than an empty page.
//
//   OXIBASE_SERVICE_KEY=<service_role key> npm run seed
//
// Idempotent: it clears the demo rows it owns (@demo.runclub) and rewrites
// them, leaving real accounts alone.

const URL_ = process.env.NEXT_PUBLIC_OXIBASE_URL || "https://oxibase.baltavista.com";
const REF = process.env.NEXT_PUBLIC_OXIBASE_REF || "runclub";
const KEY = process.env.OXIBASE_SERVICE_KEY;

if (!KEY) {
  console.error("set OXIBASE_SERVICE_KEY (the project's service_role key, from the dashboard)");
  process.exit(2);
}

const base = `${URL_}/${REF}`;
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const DAY = 86_400_000;

async function api(method, path, body, extra = {}) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { ...H, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

const sql = (text, params) => api("POST", "/api/sql", { sql: text, params });

const RUNNERS = [
  { email: "ada@demo.runclub", name: "Ada" },
  { email: "kai@demo.runclub", name: "Kai" },
  { email: "juno@demo.runclub", name: "Juno" },
];

const NOTES = [
  "Easy morning loop by the river",
  "Hill repeats — legs are gone",
  "Long slow distance, felt great",
  "Tempo run into a headwind",
  "Recovery shuffle",
  "Track night: 8×400",
];

console.log(`# Seeding ${REF}`);

// ── Documents: a fortnight of runs ──────────────────────────────────────────
for (const r of RUNNERS) {
  await api("DELETE", `/rest/v1/activities?owner=eq.${encodeURIComponent(r.email)}`);
}
let runs = 0;
const points = [];
for (const runner of RUNNERS) {
  for (let day = 13; day >= 0; day--) {
    // Not every runner runs every day.
    if ((day + runner.email.length) % 3 === 0) continue;
    const ts = Date.now() - day * DAY - ((day * 7919) % 43_200_000);
    const distance = 5 + ((day * 13 + runner.email.length) % 12);
    const pace = 4.6 + (((day * 7) % 9) / 10);
    const duration = Math.round(distance * pace * 60);
    await api("POST", "/rest/v1/activities", {
      owner: runner.email,
      note: NOTES[(day + runner.email.length) % NOTES.length],
      distance_km: distance,
      duration_s: duration,
      photo_key: null,
      ts,
    });
    points.push({ ts, runner: runner.email, distance_km: distance, pace_min_km: pace });
    runs++;
  }
}
console.log(`  ✓ documents: ${runs} runs across ${RUNNERS.length} runners`);

// ── Time-series: the same runs as points, for the pace chart ────────────────
for (const p of points) {
  await api("POST", "/rest/v1/runs", p, { "Content-Profile": "tsdb" });
}
console.log(`  ✓ time-series: ${points.length} points into 'runs'`);

// ── SQL: races and results ──────────────────────────────────────────────────
await sql("DELETE FROM signups");
await sql("DELETE FROM races");
const RACES = [
  ["Riverside 10K", 10.0, -21, "Kadıköy"],
  ["Bosphorus Half", 21.1, -7, "İstanbul"],
  ["Forest Trail 15K", 15.0, 14, "Belgrad Ormanı"],
  ["New Year 5K", 5.0, 45, "Moda"],
];
for (const [name, km, offsetDays, city] of RACES) {
  await sql("INSERT INTO races (name, distance_km, starts_at, city) VALUES (?, ?, ?, ?)", [
    name,
    km,
    Date.now() + offsetDays * DAY,
    city,
  ]);
}
const ids = (await sql("SELECT id, distance_km, starts_at FROM races ORDER BY starts_at")).results[0].rows;
for (const [id, km, startsAt] of ids) {
  for (const runner of RUNNERS) {
    // Past races have finish times; future ones are just signups.
    const finished = Number(startsAt) < Date.now();
    const finish = finished
      ? Math.round(Number(km) * (4.4 + ((runner.email.length + Number(id)) % 8) / 10) * 60)
      : null;
    await sql("INSERT INTO signups (race_id, runner, finish_seconds) VALUES (?, ?, ?)", [
      id,
      runner.email,
      finish,
    ]);
  }
}
console.log(`  ✓ sql: ${RACES.length} races with signups and results`);

console.log("\nDone — open the app.");
