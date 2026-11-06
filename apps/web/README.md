# @paidaid/web

Next.js application for PaidAid. Install dependencies and run scripts from the repository root. See the root [README](../../README.md).

## Marketplace auth (Supabase)

1. Create a Supabase project and run the migration `supabase/migrations/20251106120000_phase1_profiles.sql` (via SQL editor or `supabase db push`).
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key only — never the service role in the browser).
3. In Supabase Auth settings, use **email + password**; disable OAuth/phone if you want parity with V1 docs.
4. `pnpm dev` — sign up at `/auth/sign-up`, account at `/account`. The **`/contract`** NEAR demo stays under a separate route layout (wallet only there).
