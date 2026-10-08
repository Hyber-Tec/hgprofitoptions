<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HG Profit Options: rules for everyone working in this repository

These apply to people and AI agents alike. When something is unclear, ask the owner.

## Owner's rules

- **main is reached through a pull request**: CI green, the code owner's approval where a shared file
  changed. A session works on a branch, opens the pull request, and says so. It never pushes to main
  and never merges unless the owner asks for exactly that.
- **AI naming (permanent rule)**: the app never names the AI model or provider in labels, settings,
  messages, or errors; it is always "AI."
- **UI**: shadcn/ui components, icons from react-icons.
- **Secrets**: never commit API keys, service-account files, tokens, passwords, or PINs.
- **Commits carry no attribution trailers.** No co-authored-by line, no session line, and no
  "generated with" footer - in commit messages or pull request bodies. Every commit is authored solely
  as the git user is configured.
- **Conventional Commits v1.0.0**: `<type>[(scope)][!]: <imperative description>`, blank line, body,
  blank line, footers. Types: feat, fix, docs, refactor, test, chore, perf, build, ci, style.
- **Commit far less often**: one commit per meaningful, self-contained piece of work - a feature, a fix,
  a refactor, or a runbook. Small things join the commit they belong to. Never commit to one file, per
  review round, or per step of a session. A day's work is a handful of commits split by type and scope,
  not by when the edits were made.

## Project conventions

- **Layout**: pure logic in `src/core` (no I/O, unit-tested); Firestore model and server logic shared
  with the Cloud Functions in `src/server` (no Next.js imports); Next.js-only code in `src/lib`;
  routes in `src/app`; Cloud Functions wiring in `functions/src`.
- **Data**: every Firestore document shape is a zod schema in `src/server/model.ts`; read documents
  through `parseDoc`. Writes happen on the server (Admin SDK); the security rules keep browsers to
  reading what the member is allowed to see.
- **Access**: pages use the guards in `src/lib/auth/guards.ts`; server actions check again
  (`adminForAction`, `activeMemberForAction`). Admin actions write to the audit log.
- **Quality bar**: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm test` pass with zero
  errors before a pull request; `pnpm test:emulators` when rules, functions or server logic change;
  `pnpm test:e2e` for user-facing changes. A flaky test is a bug to fix, not to retry.
- **UI**: check every screen on a phone and a desktop, in light and dark mode. No sideways scrolling,
  no console errors.
- **Copy**: plain, friendly English; hyphens, never em dashes. Educational content, never personalized
  investment advice.
- **Private data**: HG's source files stay in `docs/private` (git-ignored). The repository is public.
- **Static files**: never read files from `public/` in server code. Next.js would put a partial
  `public/` folder in the server bundle, and App Hosting's build then skips copying the real one, so
  every other public file 404s in production. Keep shared assets in TypeScript modules instead.
