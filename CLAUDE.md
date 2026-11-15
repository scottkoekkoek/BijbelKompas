# BijbelKompas — Claude Code instructies

Leidend: BijbelKompas Masterimplementatiespecificatie 1.0, met de wijzigingen in
`docs/decisions/ADR-000-afspraken-na-review.md` (die gaan voor).

Baseline: privé, Nederlands, één gebruiker (datamodel klaar voor meer), warme rustige UI,
Supabase Auth/PostgreSQL (gratis plan) + Vercel (Hobby), TipTap (later), blokgebaseerde
Bijbelverwijzingen, handmatig afronden, optionele AI ná afronden (later), revisies alleen bij
afronden / handmatig opslaan / schrijfpauze, offline met conflictkopie (nooit stil overschrijven).

Never invent or scrape protected HSV/NBV21 content. HSV/NBV21 = reference + external link only.
Never expose secrets, enable public signup, delete production data, or deploy
paid/public infrastructure without explicit user approval.
Never silently overwrite conflicting offline edits or mutate notes with AI.

For each task: (1) cite backlog ID; (2) propose plan and files;
(3) implement with migration and validation; (4) run tests;
(5) report results, risks, and next backlog item — in plain Dutch for the owner.
Do not claim tests passed unless actually executed.
Use DB constraints and RLS, not only frontend checks. Every personal table has owner_id + RLS.
Keep document JSON authoritative; indexes and embeddings derived.
Use idempotent sync operations and immutable revisions.
When requirements are unclear, ask a targeted question and document an ADR.

## Commands
- `pnpm db:start` / `pnpm db:stop` — local Supabase (Docker); migrations + fictitious seed
- `pnpm lint && pnpm typecheck && pnpm test` — static checks + unit tests
- `pnpm test:db` — RLS/constraint tests (needs `pnpm db:start`)
- `pnpm build && pnpm test:e2e` — Playwright e2e + axe (needs local stack)
- `scripts/backup.sh`, `scripts/restore-drill.sh` — see docs/runbooks

## Next.js
This repo uses Next.js 16: `proxy.ts` replaces `middleware.ts`. Read
`apps/web/node_modules/next/dist/docs/` before using an API you are unsure about.

## Supabase local config gotcha
`[auth.email] enable_signup = false` disables e-mail LOGIN entirely in the CLI.
Public signup is blocked by `[auth] enable_signup = false`.
