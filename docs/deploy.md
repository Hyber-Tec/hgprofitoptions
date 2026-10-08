# Deploying

Production runs in the Firebase project `hgprofitoptions-hybertec` (Blaze plan):

- **App Hosting** backend `hgprofitoptions` (us-central1) builds and serves the Next.js app. It rolls
  out automatically when `main` changes.
- **Hosting** site `hgprofitoptions` (https://hgprofitoptions.web.app) forwards every request to that
  backend. Hosting passes only the `__session` cookie to the app, which is the session cookie it uses.
- **Firestore** (nam5), **Cloud Storage**, **Cloud Functions** (us-central1) and **Authentication**
  with Identity Platform.

Every command below names the project explicitly. Run them from the repository root.

## One-time setup

1. **Authentication**
   - Authentication > Settings > Upgrade to Firebase Authentication with Identity Platform (needed
     for two-step verification and the invite-only sign-up function).
   - Sign-in methods: enable Email/Password and Google.
   - Authorized domains: add `hgprofitoptions.web.app` and the App Hosting domain shown in step 4.
   - Turn on authenticator-app two-step verification: `pnpm auth:totp --prod`.

2. **Secrets** (Cloud Secret Manager). Integrations you are not using yet get the value `none`.

   ```bash
   P=hgprofitoptions-hybertec
   firebase functions:secrets:set RESEND_API_KEY --project $P            # Resend key, or none
   firebase functions:secrets:set SNAPTRADE_CONSUMER_KEY --project $P    # or none
   firebase functions:secrets:set SNAPTRADE_ENCRYPTION_KEY --project $P  # 32 random bytes, base64 (see below), or none
   firebase functions:secrets:set MARKET_DATA_API_KEY --project $P       # or none
   firebase apphosting:secrets:set FIREBASE_WEB_API_KEY --project $P     # Project settings > Your apps > apiKey
   firebase apphosting:secrets:set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY --project $P
   ```

   Generate key material with `openssl rand -base64 32`. The SnapTrade encryption key protects
   stored brokerage credentials: keep a copy somewhere safe, because changing it disconnects every
   linked brokerage.

   Plain settings are committed: `apphosting.yaml` for the app and
   `functions/.env.hgprofitoptions-hybertec` for the functions. They hold `EMAIL_FROM` (a sender on a
   domain verified in Resend, or `none`), `SNAPTRADE_CLIENT_ID` (or `none`), the site address and the
   market data address.

3. **Database, storage and functions**

   ```bash
   firebase deploy --only firestore,storage,functions --project hgprofitoptions-hybertec
   ```

   The first functions deploy also creates the Cloud Scheduler jobs. If the deploy asks whether
   the invite-only sign-up function may be registered with Identity Platform, answer yes.

4. **App Hosting backend**

   ```bash
   firebase apphosting:backends:create --project hgprofitoptions-hybertec \
     --backend hgprofitoptions --primary-region us-central1 --root-dir .
   ```

   Connect the GitHub repository `Hyber-Tec/hgprofitoptions` and choose `main` as the live branch.
   Grant the backend the secrets it reads:

   ```bash
   firebase apphosting:secrets:grantaccess FIREBASE_WEB_API_KEY,NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,RESEND_API_KEY,SNAPTRADE_CONSUMER_KEY,SNAPTRADE_ENCRYPTION_KEY,MARKET_DATA_API_KEY \
     --backend hgprofitoptions --project hgprofitoptions-hybertec
   ```

   The first rollout starts from `main`.

5. **hgprofitoptions.web.app**

   ```bash
   firebase deploy --only hosting --project hgprofitoptions-hybertec
   ```

   If the site answers 403, allow Hosting to call the backend's Cloud Run service:

   ```bash
   gcloud run services add-iam-policy-binding hgprofitoptions --region us-central1 \
     --member allUsers --role roles/run.invoker --project hgprofitoptions-hybertec
   ```

6. **First data and the first admin**

   ```bash
   pnpm seed --prod --admin=<admin email> --name="<Full name>"   # prints the admin's invitation link
   pnpm import:source --prod                                     # with docs/private/source-files present
   ```

   The admin opens the link, creates their account, then sets up two-step verification at
   `/admin/security` and signs in again with a code.

## Everyday changes

- **App**: merge to `main`; App Hosting builds and rolls out.
- **Rules, indexes or functions** changed in the merge:
  `firebase deploy --only firestore,storage,functions --project hgprofitoptions-hybertec`.
- **Turning on an integration**: set its secret (and `EMAIL_FROM` or `SNAPTRADE_CLIENT_ID` in both
  `apphosting.yaml` and the functions settings), then roll out the app and redeploy the functions.
  Admin > Settings > Connected services shows what is on, and Admin > Market data lists every
  scheduled job run.

## Checks after a deploy

- https://hgprofitoptions.web.app loads, and `/members` sends a signed-out visitor to the login page.
- A member can sign in, see the tools and open an alert; an invitation link creates an account.
- Admin > Market data shows the nightly jobs succeeding (or skipped for integrations that are off).
