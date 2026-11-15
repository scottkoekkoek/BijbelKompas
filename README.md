# BijbelKompas

Persoonlijke, Nederlandstalige Bijbelstudie-app (PWA). Privé: alleen uitgenodigde gebruikers.

Status: **Sprint 1** (fundament): inloggen, voorkeuren, database met RLS, basisinterface,
back-up en herstelproef. Bijbellezer, notities, zoeken, offline en AI volgen later.

## Opzet

| Onderdeel | Waar |
| --- | --- |
| Web-app (Next.js 16, TypeScript) | `apps/web` |
| Gedeelde Zod-schema's | `packages/schemas` |
| Migraties, seed, RLS-tests | `packages/database` |
| End-to-end-tests (Playwright + axe) | `tests/e2e` |
| Back-up / herstel | `scripts/`, `docs/runbooks/` |
| Besluiten | `docs/decisions/` |

## Lokaal ontwikkelen

Vereist: Node 22, pnpm 10, Docker.

```bash
pnpm install
pnpm db:start                          # lokale Supabase met migraties en fictieve testdata
cp .env.example apps/web/.env.local    # vul de lokale URL en publishable key in
pnpm dev                               # http://localhost:3000
```

Tests: `pnpm lint && pnpm typecheck && pnpm test`, `pnpm test:db`, `pnpm build && pnpm test:e2e`.

## Omgevingen

| Omgeving | Database | Doel |
| --- | --- | --- |
| Lokaal / CI | Lokale Supabase-stack (Docker), elke run vers | Ontwikkelen en alle tests |
| Productie | Supabase Free `bijbelkompas-prod` (Frankfurt) | De echte app op Vercel |

Vercel-previews krijgen geen productiesleutels. Zie ADR-002.
