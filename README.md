# Run Club

A running club app built entirely on [OxiBase](https://oxibase.baltavista.com) — no other
backend, no ORM, no server database of its own. It exists to answer one question honestly:
*what does a real app look like when every part of the backend is OxiBase?*

Post a run with a photo, give kudos that appear on everyone's screen instantly, watch your
weekly pace, sign up for club races, and keep a training journal only you can read.

## What each part of the app actually uses

| Feature in the app | OxiBase surface |
|---|---|
| The feed, kudos, comments, profiles | **Documents** — collections over `/rest/v1`, a PostgREST-compatible API |
| Kudos appearing live | **Realtime** — one WebSocket, `subscribe()` |
| Run photos | **Storage** — per-project file buckets |
| Weekly pace chart | **Time-series** — points appended per run, aggregated server-side |
| Races, signups, standings | **SQL engine** — real tables, a foreign key and a join |
| Sign in | **Auth** — password, magic link, Google and GitHub |
| Who may read or write what | **Security rules** — row-level, enforced by the server |

The three engines live in one project and are addressed through one URL. A collection and a SQL
table can never share a name, so `.from("activities")` and `.from("races")` reach different
engines without the app saying so; the time-series engine is selected with `.schema("tsdb")`.

## The security model, and why there is a server half at all

The browser holds the project's **anon key**. That key is public by design — it ships in the
JavaScript bundle, and it is in `.env.example` in this repo on purpose. What keeps it safe is
that everything it can do is bounded server-side:

- **Document writes** are adjudicated by security rules. `create: auth.username == doc.owner`
  means you may only create rows that belong to you — a forged `owner` is refused, not trusted.
- **Reads can be row-level.** The journal's read rule is `auth.username == doc.owner`, so the
  app asks for *every* entry in the collection and receives only yours. The filtering is the
  server's; the query is not to be trusted with it.
- **Files and time-series cannot be written from a browser at all.** Storage writes are
  RBAC-gated, and the time-series engine has no per-row rules to adjudicate a write, so both
  require the `service_role` key.

That last point is the only reason this app has route handlers. `/api/upload` and
`/api/activity` hold the service key server-side and do the two privileged things — but they
first verify the caller's token against the **project's public key** from its JWKS endpoint, and
tag the write with that verified identity. So a signed-in user cannot upload over someone else's
photo or write points into another runner's history.

```
browser (anon key, then the user's token)        server route handlers (service key)
  ├── documents  · rules decide                    ├── storage upload  · after JWKS verify
  ├── sql        · SELECT only                     └── time-series     · tagged with the
  ├── time-series· read only                                             verified email
  └── realtime   · rules filter the stream
```

## Running it

```bash
npm install
cp .env.example .env.local     # the anon key is already there; add the service key
npm run setup                  # rules + SQL schema (needs OXIBASE_SERVICE_KEY)
npm run seed                   # demo runners, runs and races
npm run dev
```

`OXIBASE_SERVICE_KEY` comes from your project in the OxiBase dashboard → **Projects** →
`service_role`. Keep it out of the browser and out of git; on Vercel it is a plain environment
variable, and only the route handlers ever read it.

## Deploying to Vercel

Import the repo and set four environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_OXIBASE_URL` | `https://oxibase.baltavista.com` |
| `NEXT_PUBLIC_OXIBASE_REF` | `runclub` |
| `NEXT_PUBLIC_OXIBASE_ANON_KEY` | the project's anon key (public) |
| `OXIBASE_SERVICE_KEY` | the project's service_role key (**server only**) |

Then add your deployment's URL to the project's **allowed redirect URLs** in the dashboard —
magic links and social sign-in will only return a session to a URL on that list, which is what
stops a stolen link from delivering a session somewhere else.

It fits the free plan: the app is static except for two small route handlers, and photos are
downscaled in the browser before upload because a Vercel function body is capped at 4.5 MB.

## Notes

- The SDK is installed straight from the deployment (`oxibase-js.tgz`) rather than npm.
- Demo accounts are `*@demo.runclub`; `npm run seed` rewrites only those rows.
