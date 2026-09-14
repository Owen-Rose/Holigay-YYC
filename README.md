# Holigay Vendor Market

The vendor application platform for [Holigay Events YYC](https://holigayeventsyyc.carrd.co/).
Vendors apply to participate in events, upload product photos, and track application status.
Organizers review applications and manage events. Admins manage team access.

Single-tenant app — built specifically for the Holigay Events YYC team.

## Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript (strict mode)
- **Database & Auth**: Supabase — Postgres, Row-Level Security, cookie-based sessions, Storage
- **Forms**: React Hook Form + Zod
- **Styling**: Tailwind CSS v4
- **Email**: Resend (transactional)
- **Testing**: Vitest + React Testing Library
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)

## Quick start

```bash
git clone <repo> && cd Holigay-YYC
npm install
cp .env.local.example .env.local   # then fill in Supabase + Resend keys
npm run dev                        # http://localhost:3000
```

Required env vars are documented in [CLAUDE.md](./CLAUDE.md#environment-variables).
Supabase setup details are in [docs/DEV-ENVIRONMENT-SETUP.md](./docs/DEV-ENVIRONMENT-SETUP.md).

## Common commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run db:types` | Regenerate Supabase types (production schema) |

## Documentation map

- [CLAUDE.md](./CLAUDE.md) — architecture, route map, role/RBAC system, server-action patterns
- [docs/DEV-ENVIRONMENT-SETUP.md](./docs/DEV-ENVIRONMENT-SETUP.md) — dev environment setup
- [specs/](./specs/) — active feature specs (Speckit workflow)
- [.specify/memory/constitution.md](./.specify/memory/constitution.md) — project constitution (code-quality, testing, UX, and workflow rules)
- [docs/archive/](./docs/archive/) — historical task trackers (Epics 1–6)
