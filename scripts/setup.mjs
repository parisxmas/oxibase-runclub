// One-time project setup: security rules and the SQL schema.
//
//   OXIBASE_SERVICE_KEY=<service_role key> npm run setup
//
// Run with the service_role key — it configures rules (an admin operation) and
// creates SQL tables. Everything here is idempotent, so re-running is safe.

const URL_ = process.env.NEXT_PUBLIC_OXIBASE_URL || "https://oxibase.baltavista.com";
const REF = process.env.NEXT_PUBLIC_OXIBASE_REF || "runclub";
const KEY = process.env.OXIBASE_SERVICE_KEY;

if (!KEY) {
  console.error("set OXIBASE_SERVICE_KEY (the project's service_role key, from the dashboard)");
  process.exit(2);
}

const base = `${URL_}/${REF}`;
const auth = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: auth,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function sql(text, params) {
  const r = await api("POST", "/api/sql", { sql: text, params });
  return r.results;
}

// ── Security rules ──────────────────────────────────────────────────────────
// This is the whole authorization model for the document engine. The browser
// holds only the anon key, so these expressions are what stand between a
// public key and your data. Note `create: auth.username == doc.owner` — you
// may only create rows that belong to you, so a forged `owner` is refused at
// the server rather than trusted from the client.
const RULES = {
  // The feed. Anyone may read a run; only a signed-in user may post one, and
  // only its owner may edit or delete it.
  activities: {
    read: "true",
    create: "auth.username == doc.owner",
    update: "auth.username == doc.owner",
    delete: "auth.username == doc.owner",
  },
  // Kudos are the "like" — signed-in users add their own and can take it back.
  kudos: {
    read: "true",
    create: "auth.username == doc.owner",
    update: "false",
    delete: "auth.username == doc.owner",
  },
  comments: {
    read: "true",
    create: "auth.username == doc.owner",
    update: "auth.username == doc.owner",
    delete: "auth.username == doc.owner",
  },
  // Public profile card: display name and avatar.
  profiles: {
    read: "true",
    create: "auth.username == doc.owner",
    update: "auth.username == doc.owner",
    delete: "false",
  },
  // A private training log. The read rule references `doc.owner`, which makes
  // it a **row-level** filter: an unfiltered select returns only your own
  // entries, enforced by the server rather than by the query.
  journal: {
    read: "auth.username == doc.owner",
    create: "auth.username == doc.owner",
    update: "auth.username == doc.owner",
    delete: "auth.username == doc.owner",
  },
};

console.log(`# Setting up ${REF} on ${URL_}`);

for (const [collection, rules] of Object.entries(RULES)) {
  await api("POST", `/api/rules/${collection}`, rules);
  console.log(`  ✓ rules: ${collection.padEnd(10)} read=${rules.read}`);
}

// ── SQL schema ──────────────────────────────────────────────────────────────
// Club races are relational: a race has many signups, and standings are a join
// plus an aggregate. That is the SQL engine's job, and it lives beside the
// document collections in the same project.
const DDL = [
  `CREATE TABLE IF NOT EXISTS races (
     id INTEGER PRIMARY KEY AUTO_INCREMENT,
     name VARCHAR(120) NOT NULL,
     distance_km DECIMAL(5,2) NOT NULL,
     starts_at TIMESTAMP NOT NULL,
     city VARCHAR(80)
   )`,
  `CREATE TABLE IF NOT EXISTS signups (
     id INTEGER PRIMARY KEY AUTO_INCREMENT,
     race_id INTEGER NOT NULL,
     runner VARCHAR(160) NOT NULL,
     finish_seconds INTEGER,
     FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_signups_race ON signups (race_id)`,
];

for (const stmt of DDL) {
  await sql(stmt);
  console.log(`  ✓ sql: ${stmt.split("\n")[0].trim().slice(0, 60)}…`);
}

console.log("\nDone. Next: `npm run seed` for demo data.");
