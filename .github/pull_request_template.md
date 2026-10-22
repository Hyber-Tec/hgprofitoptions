## What changed and why

## How it was checked

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`
- [ ] `pnpm test:emulators` (rules, functions or server logic changed)
- [ ] `pnpm test:e2e` and a look on a phone and a desktop, light and dark (screens changed)

## Deploy notes

Merging deploys everything once CI passes. List secrets or settings to set before merging, and anything
the deploy cannot do by itself (docs/deploy.md).
