# Deploying

Production runs in the Firebase project `hgprofitoptions-hybertec` (Blaze plan, in the hybertec.com
Google Cloud organization):

- **App Hosting** backend `hgprofitoptions` (us-central1) builds and serves the Next.js app at
  https://hgprofitoptions--hgprofitoptions-hybertec.us-central1.hosted.app.
- **Hosting** site `hgprofitoptions` (https://hgprofitoptions.web.app) serves the app through the
  Cloud Run service `hgprofitoptions-web` (see
  [Serving the app at hgprofitoptions.web.app](#serving-the-app-at-hgprofitoptionswebapp)).
- **Firestore** (nam5), **Cloud Storage**, **Cloud Functions** (us-central1) and **Authentication**
  with Identity Platform (email/password and Google sign-in, authenticator-app two-step verification).

Every command below names the project explicitly. Run them from the repository root, signed in to
both the Firebase CLI and gcloud as a project owner.

## What the organization requires

The hybertec.com organization changes two Google defaults, and the steps below account for both:

- **Default service accounts get no automatic roles.** Cloud Functions builds and runs as the
  Compute Engine default service account, so it needs these roles granted once:

  ```bash
  P=hgprofitoptions-hybertec; SA=785230671466-compute@developer.gserviceaccount.com
  for role in roles/cloudbuild.builds.builder roles/datastore.user roles/firebasecloudmessaging.admin; do
    gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role="$role" --condition=None
  done
  ```

- **Nothing can be granted to `allUsers`** (`constraints/iam.managed.allowedPolicyMembers`). Firebase
  normally does that for two things:
  - The invite-only sign-up function. `firebase deploy` reports an error for `allowInvitedSignUps`;
    run `pnpm auth:guard` after every functions deploy. It makes the function reachable without an
    `allUsers` grant and registers it with Authentication.
  - Serving the app through hgprofitoptions.web.app (below), which `pnpm deploy:web` handles.

## One-time setup (done)

1. **Authentication**: Identity Platform, Email/Password and Google sign-in, and authorized domains
   for hgprofitoptions.web.app and the App Hosting domain. `pnpm auth:totp --prod` turns on
   authenticator-app two-step verification.

2. **Secrets** (Cloud Secret Manager). Integrations that are not in use hold the value `none`.

   ```bash
   P=hgprofitoptions-hybertec
   firebase functions:secrets:set RESEND_API_KEY --project $P            # Resend key, or none
   firebase functions:secrets:set SNAPTRADE_CONSUMER_KEY --project $P    # or none
   firebase functions:secrets:set SNAPTRADE_ENCRYPTION_KEY --project $P  # 32 random bytes, base64, or none
   firebase functions:secrets:set MARKET_DATA_API_KEY --project $P       # or none
   firebase apphosting:secrets:set FIREBASE_WEB_API_KEY --project $P     # Project settings > Your apps > apiKey
   firebase apphosting:secrets:set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY --project $P
   firebase apphosting:secrets:grantaccess FIREBASE_WEB_API_KEY,NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,RESEND_API_KEY,SNAPTRADE_CONSUMER_KEY,SNAPTRADE_ENCRYPTION_KEY,MARKET_DATA_API_KEY \
     --backend hgprofitoptions --project $P
   ```

   Generate key material with `openssl rand -base64 32`. The SnapTrade encryption key protects
   stored brokerage credentials: keep a copy somewhere safe, because changing it disconnects every
   linked brokerage. Plain settings are committed: `apphosting.yaml` for the app and
   `functions/.env.hgprofitoptions-hybertec` for the functions (`EMAIL_FROM`, `SNAPTRADE_CLIENT_ID`,
   the site address and the market data address).

3. **App Hosting backend**: created with
   `firebase apphosting:backends:create --project hgprofitoptions-hybertec --backend hgprofitoptions --primary-region us-central1 --root-dir .`.
   It is not connected to GitHub yet, so the app is deployed from a checkout (below). To roll out
   automatically when `main` changes, connect `Hyber-Tec/hgprofitoptions` with live branch `main` in
   Firebase console > App Hosting > hgprofitoptions > Settings (a one-time GitHub authorization).

4. **First data and the first admin**: seeded with

   ```bash
   pnpm seed --prod --admin=<admin email> --name="<Full name>"   # prints the admin's invitation link
   pnpm import:source --prod                                     # with docs/private/source-files present
   ```

   These use Application Default Credentials (`gcloud auth application-default login`). Set
   `NEXT_PUBLIC_SITE_URL=https://hgprofitoptions.web.app` so the printed link points at production.
   The admin opens the link and creates their account. Two-step verification is optional
   (`REQUIRE_ADMIN_MFA` in `apphosting.yaml`); admins can turn it on at `/admin/security`.

## Deploying changes

Deploy from an up-to-date `main` after the pull request is merged.

| What changed     | Command                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| App              | `pnpm deploy:web`                                                                             |
| Rules or indexes | `firebase deploy --only firestore,storage --project hgprofitoptions-hybertec`                 |
| Functions        | `firebase deploy --only functions --project hgprofitoptions-hybertec`, then `pnpm auth:guard` |
| Hosting rewrite  | `firebase deploy --only hosting --project hgprofitoptions-hybertec`                           |

Turning on an integration: set its secret (and `EMAIL_FROM` or `SNAPTRADE_CLIENT_ID` in both
`apphosting.yaml` and the functions settings), then deploy the app and the functions. Admin > Settings

> Connected services shows what is on, and Admin > Market data lists every scheduled job run.

## Serving the app at hgprofitoptions.web.app

Firebase Hosting forwards requests only to a Cloud Run service that accepts public calls, and the
organization forbids the usual `allUsers` grant. App Hosting's own service cannot stay public through
Cloud Run's "no invoker check" setting either, because each rollout resets it. So:

- `pnpm deploy:web` builds and rolls out App Hosting, then `scripts/sync-web-service.ts` copies that
  service's configuration (image, environment, secrets, service account, sizing) to a second service,
  `hgprofitoptions-web`, with the invoker check off.
- `hgprofitoptions-web` keeps one instance running, so members never wait several seconds for a cold
  start. While idle it costs about $13 a month (1 CPU and 1 GiB at Cloud Run's idle rate). The App
  Hosting service scales to zero; nobody is sent to its address.
- `firebase.json` rewrites every hgprofitoptions.web.app request to `hgprofitoptions-web`. Hosting
  passes only the `__session` cookie to the app, which is the session cookie it uses. It also lets
  browsers cache the icons and the web app manifest for a day; Next.js would have them downloaded
  again on every page change.
- The App Hosting address keeps working too. If App Hosting is ever connected to GitHub for automatic
  rollouts, run `pnpm exec tsx scripts/sync-web-service.ts` after each one, or hgprofitoptions.web.app
  keeps serving the previous version.

If an organization admin later allows `allUsers` for this project
(`constraints/iam.managed.allowedPolicyMembers`), the copy is no longer needed: grant
`roles/run.invoker` to `allUsers` on the `hgprofitoptions` service, point the rewrite at
`hgprofitoptions`, delete `hgprofitoptions-web`, and `firebase deploy` will also set up the sign-up
function without `pnpm auth:guard`.

## Checks after a deploy

- https://hgprofitoptions.web.app opens the site, and `/members` sends a signed-out visitor to the
  login page.
- An address that was never invited cannot create an account; an invitation link can.
- A member can sign in, see the tools and open an alert.
- Admin > Market data shows the nightly jobs succeeding (or skipped for integrations that are off).
