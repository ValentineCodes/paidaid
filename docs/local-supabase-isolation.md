# Local Supabase isolation (AI Providers / feature development)

Use **Docker Supabase only** when developing database changes locally. Do not apply migrations to the hosted `paidaid` project until an explicit release step.

## Quick commands

| Command                 | Target                     | Notes                                           |
| ----------------------- | -------------------------- | ----------------------------------------------- |
| `pnpm db:start`         | Local Docker               | API on `http://127.0.0.1:55321`, Studio `55323` |
| `pnpm db:stop`          | Local Docker               | Stops containers                                |
| `pnpm db:status:local`  | Local Docker               | Print API URL and keys                          |
| `pnpm db:migrate:local` | Local Docker               | `supabase migration up --local`                 |
| `pnpm db:reset:local`   | **Destructive local only** | `supabase db reset`                             |
| `pnpm db:types:local`   | Local Docker               | Regenerate `apps/web/lib/database.types.ts`     |
| `pnpm db:push:remote`   | **Hosted linked project**  | Requires `PAIDAID_CONFIRM_REMOTE_DB=1`          |

Legacy aliases: `pnpm db:migrate`, `pnpm db:reset`, and `pnpm db:types` still target **local** Docker.

## Environment files

1. **`apps/web/.env.local`** (gitignored) — your machine. For AI work, **active** `NEXT_PUBLIC_SUPABASE_URL` must be `http://127.0.0.1:55321`.
2. **`apps/web/.env.development`** — committed fallback when `.env.local` is missing; defaults to local Supabase.
3. Hosted production values belong in **commented** blocks in `.env.local` only (never as active vars during local DB work).

After `pnpm db:start`, sync keys if needed:

```bash
pnpm db:status:local
```

Copy **API URL**, **anon key**, and **service_role key** into `apps/web/.env.local` (not into `NEXT_PUBLIC_*` for the service role).

## CLI link warning

The Supabase CLI may still be **linked** to a hosted project (`supabase/.temp/project-ref`). That does **not** change where the app points if env vars target `127.0.0.1:55321`, but it enables accidental `db push` to production.

- Prefer `pnpm db:migrate:local` / `pnpm db:reset:local`.
- `pnpm db:push` and `pnpm db:types:linked` are guarded; set `PAIDAID_CONFIRM_REMOTE_DB=1` only when you intend to touch the hosted project.

Milestone payment RPC security checks (after `db:reset`):

```bash
docker exec -i supabase_db_paidaid psql -U postgres -d postgres < scripts/security/v24-engagement-milestones.sql
docker exec -i supabase_db_paidaid psql -U postgres -d postgres < scripts/security/v25-request-milestone-terms.sql
```

See [milestones.md](./milestones.md) for optional milestone payments and contract env.

## Variables used by the app

| Variable                        | Scope            | Purpose                                      |
| ------------------------------- | ---------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Browser + server | Supabase REST/Auth URL                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Anon JWT                                     |
| `SUPABASE_URL`                  | Server fallback  | Same as public URL                           |
| `SUPABASE_ANON_KEY`             | Server fallback  | Same as anon                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Server only**  | RPCs: wallet auth, escrow progress, finalize |

No direct Postgres connection string is required for the Next.js app (Supabase client uses HTTP).

Local Postgres (migrations, `psql`): `postgresql://postgres:postgres@127.0.0.1:55322/postgres` from `supabase status`.

## Seed data

`supabase/seed.sql` is a no-op (`select 1;`). Catalogue data is created by migrations.

## Verify connectivity

```bash
pnpm db:start
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "http://127.0.0.1:55321/rest/v1/assets?select=id&limit=1"
```

Expect `200`.
