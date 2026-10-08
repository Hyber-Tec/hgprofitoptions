# Deploying

Production runs in the Firebase project `hgprofitoptions-hybertec` (Blaze plan, in the hybertec.com
Google Cloud organization):

- **App Hosting** backend `hgprofitoptions` (us-central1) builds and serves the Next.js app at
  https://hgprofitoptions--hgprofitoptions-hybertec.us-central1.hosted.app.
- **Hosting** site `hgprofitoptions` (https://hgprofitoptions.web.app) redirects every path to that
  address for now (see [Serving the app at hgprofitoptions.web.app](#serving-the-app-at-hgprofitoptionswebapp)).
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
  - Serving the app through hgprofitoptions.web.app (below).

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
   The admin opens the link, creates their account, sets up two-step verification at
   `/admin/security` and signs in again with a code.

## Deploying changes

Deploy from an up-to-date `main` after the pull request is merged.

| What changed        | Command                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| App                 | `firebase deploy --only apphosting --project hgprofitoptions-hybertec`                        |
| Rules or indexes    | `firebase deploy --only firestore,storage --project hgprofitoptions-hybertec`                 |
| Functions           | `firebase deploy --only functions --project hgprofitoptions-hybertec`, then `pnpm auth:guard` |
| Redirect at web.app | `firebase deploy --only hosting --project hgprofitoptions-hybertec`                           |

Turning on an integration: set its secret (and `EMAIL_FROM` or `SNAPTRADE_CLIENT_ID` in both
`apphosting.yaml` and the functions settings), then deploy the app and the functions. Admin > Settings

> Connected services shows what is on, and Admin > Market data lists every scheduled job run.

## Serving the app at hgprofitoptions.web.app

Firebase Hosting can serve the app directly with a rewrite to the backend's Cloud Run service, but
that service must accept public calls, which needs an `allUsers` grant the organization forbids. So
the site redirects to the App Hosting address for now. To serve the app at hgprofitoptions.web.app
itself:

1. An organization admin allows `allUsers` for this project in
   `constraints/iam.managed.allowedPolicyMembers` (IAM > Organization policies).
2. `gcloud run services add-iam-policy-binding hgprofitoptions --region us-central1 --member allUsers --role roles/run.invoker --project hgprofitoptions-hybertec`
3. In `firebase.json`, replace the hosting `redirects` with
   `"rewrites": [{ "source": "**", "run": { "serviceId": "hgprofitoptions", "region": "us-central1" } }]`
   and deploy hosting. Hosting passes only the `__session` cookie to the app, which is the session
   cookie it uses.

The same exception would let `firebase deploy` set up the sign-up function without `pnpm auth:guard`.

## Checks after a deploy

- https://hgprofitoptions.web.app opens the site, and `/members` sends a signed-out visitor to the
  login page.
- An address that was never invited cannot create an account; an invitation link can.
- A member can sign in, see the tools and open an alert.
- Admin > Market data shows the nightly jobs succeeding (or skipped for integrations that are off).
