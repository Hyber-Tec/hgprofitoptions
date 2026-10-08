# HG Profit Options

The members-only home of HG Profit Options, Hubert "HG" Gaffney's options trading class: a public
site, a member area with HG's alerts and trading tools, and an admin console for running the
membership by calendar quarter.

## What is in it

- **Public site**: home, about, FAQ, legal pages, member login, invitation sign-up and a booking link
  that HG changes in the admin console.
- **Member area** (`/members`): buy and sell alerts with live updates and browser notifications,
  Strike Price Targets, the Median & Channel Chart, Key Market Data, the Leveraged ETF Guide, stock
  pages, a trading journal (manual, CSV import or a read-only brokerage link), portfolio performance,
  HG's standing, class presentations, files, the classroom schedule and account settings.
- **Admin console** (`/admin`): members and invitations with quarterly periods, member performance,
  alerts with buy and sell points, the strike target editor, HG's house portfolio, tickers and
  channel settings, market data, content, settings, the audit log and two-step verification.
- **Cloud Functions**: alert and strike-target notifications, invite-only sign-up, and scheduled jobs
  (membership access, renewal reminders, brokerage sync, HG standing, daily prices and weekly Key
  Market Data).

Membership is by calendar quarter (Q1 to Q4). A member without a current quarter keeps their account,
journal and portfolio, but not the tools, alerts or classes.

## Stack

Next.js 16 (App Router, React 19, TypeScript strict) · Tailwind CSS 4 with shadcn/ui and react-icons ·
Firebase: Authentication (invite-only, Google and email, optional authenticator-app two-step
verification), Firestore, Cloud Storage, Cloud Messaging, Cloud Functions, App Hosting and Hosting · zod ·
Vitest and Playwright. Optional integrations: Resend (email), SnapTrade (read-only brokerage linking)
and a Polygon-compatible market data API.

## Getting started

Requirements: Node 22, pnpm 11 (`corepack enable`), Java 21 for the Firebase emulators, and Google
Chrome for the end-to-end tests.

```bash
pnpm install
cp .env.example .env.local      # then set NEXT_PUBLIC_FIREBASE_API_KEY (Firebase console > Project settings)
pnpm emulators                  # terminal 1: Auth, Firestore and Storage emulators
pnpm seed && pnpm seed:demo     # settings, public content and demo members (logins are printed)
pnpm dev                        # terminal 2: http://localhost:3000
```

HG's source spreadsheets and PDFs are private and never committed. With them in
`docs/private/source-files`, `pnpm import:source` loads the real ticker universe, Key Market Data,
strike targets and ETF guide; without them, `pnpm seed:demo` writes a synthetic sample.

In local development `DELIVER_ALERTS_INLINE=true` sends alert notifications from the web server. To
run the real Cloud Functions instead, use `pnpm emulators:functions`.

## Commands

| Command                   | What it does                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                | Development server                                                           |
| `pnpm emulators`          | Auth, Firestore and Storage emulators (`emulators:functions` adds Functions) |
| `pnpm seed` / `seed:demo` | Settings and content / demo members, alerts, trades and portfolios           |
| `pnpm import:source`      | Imports HG's private source files                                            |
| `pnpm lint`               | ESLint (strict, type-aware)                                                  |
| `pnpm typecheck`          | TypeScript for the app and the Cloud Functions                               |
| `pnpm format:check`       | Prettier                                                                     |
| `pnpm test`               | Unit tests and golden fixtures from HG's spreadsheets                        |
| `pnpm test:emulators`     | Security rules and integration tests (starts its own emulators)              |
| `pnpm test:e2e`           | Playwright on a production build against its own emulators                   |
| `pnpm build`              | Production build                                                             |
| `pnpm build:functions`    | Bundles the Cloud Functions into `functions/lib`                             |

The test emulators use separate ports (`firebase.test.json`), so tests run while `pnpm emulators` and
`pnpm dev` are running.

## Layout

```
src/core          Pure TypeScript: quarters, calculations, parsers and formatting (unit-tested)
src/server        Firestore model and server logic shared by the web app and Cloud Functions
src/lib           Next.js side: auth guards, data loaders, server actions, Firebase clients
src/app           Routes: (site), (auth), members, admin and api
src/components    ui (shadcn/ui), site, portal, admin and auth components
functions/src     Cloud Functions: triggers, schedules and the sign-up guard
scripts           Seeding, imports and build helpers
tests             rules, integration, golden and e2e suites
```

## Security

- Accounts exist only for invited emails: an Auth blocking function rejects other sign-ups, and the
  server checks the invitation again.
- Access follows the member's quarters, enforced by the server and by Firestore security rules.
- Admin views of members' portfolios and journals are recorded in the audit log. Two-step
  verification is optional for admins on the hosted site (`REQUIRE_ADMIN_MFA` in `apphosting.yaml`);
  set it to `"true"` and the admin console requires it.
- Private journal notes are readable only by their owner, admins included.
- Files are streamed by the server after an access check; PDFs are stamped with the member's name.
- No secrets live in the repository. Server keys are in Cloud Secret Manager.

## Deployment

Live at https://hgprofitoptions.web.app. The app runs on Firebase App Hosting; rules, indexes,
functions and the app are deployed from `main` with the Firebase CLI. See [docs/deploy.md](docs/deploy.md),
including the two settings the hybertec.com organization requires.

## Contributing

Read [AGENTS.md](AGENTS.md) first: changes reach `main` through a reviewed pull request with green CI,
and commits follow Conventional Commits.
