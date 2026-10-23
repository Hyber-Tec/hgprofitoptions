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
   firebase functions:secrets:set AI_API_KEY --project $P                # or none
   firebase functions:secrets:set ZOOM_CLIENT_SECRET --project $P        # or none
   firebase apphosting:secrets:set ZOOM_SDK_SECRET --project $P          # or none
   firebase apphosting:secrets:set ZOOM_WEBHOOK_SECRET --project $P      # or none
   firebase apphosting:secrets:set FIREBASE_WEB_API_KEY --project $P     # Project settings > Your apps > apiKey
   firebase apphosting:secrets:set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY --project $P
   firebase apphosting:secrets:grantaccess FIREBASE_WEB_API_KEY,NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,RESEND_API_KEY,SNAPTRADE_CONSUMER_KEY,SNAPTRADE_ENCRYPTION_KEY,MARKET_DATA_API_KEY,AI_API_KEY,ZOOM_SDK_SECRET,ZOOM_WEBHOOK_SECRET \
     --backend hgprofitoptions --project $P
   ```

   The AI and Zoom secrets were added after the first launch: create them (`none` keeps that
   integration off) and grant the backend access before merging the change that uses them, because
   the merge deploys it and a missing secret stops the deploy.

   Generate key material with `openssl rand -base64 32`. The SnapTrade encryption key protects
   stored brokerage credentials: keep a copy somewhere safe, because changing it disconnects every
   linked brokerage. Plain settings are committed: `apphosting.yaml` for the app and
   `functions/.env.hgprofitoptions-hybertec` for the functions (`EMAIL_FROM`, `SNAPTRADE_CLIENT_ID`,
   the site address and the market data address).

3. **App Hosting backend**: created with
   `firebase apphosting:backends:create --project hgprofitoptions-hybertec --backend hgprofitoptions --primary-region us-central1 --root-dir .`.
   It is deliberately not connected to GitHub. The CI workflow deploys it from a checkout of `main`
   (below), because hgprofitoptions.web.app also needs the copy step after every rollout.

4. **First data and the first admin**: seeded with

   ```bash
   pnpm seed --prod --admin=<admin email> --name="<Full name>"   # prints the admin's invitation link
   pnpm import:source --prod                                     # with docs/private/source-files present
   ```

   These use Application Default Credentials (`gcloud auth application-default login`). Set
   `NEXT_PUBLIC_SITE_URL=https://hgprofitoptions.web.app` so the printed link points at production.
   The admin opens the link and creates their account. Two-step verification is optional
   (`REQUIRE_ADMIN_MFA` in `apphosting.yaml`); admins can turn it on at `/admin/security`.

5. **Automatic deploys**: GitHub Actions deploys as the service account
   `github-deployer@hgprofitoptions-hybertec.iam.gserviceaccount.com`, without a key. Google Cloud
   accepts GitHub's sign-in only from the Deploy job in `.github/workflows/ci.yml`, running on `main`
   in the repository's `production` environment (workload identity pool `github`, provider
   `hgprofitoptions`). In GitHub, that environment accepts protected branches only (Settings >
   Environments), so nothing but `main` can deploy. The account can deploy each part and act as the
   app's and the functions' service accounts, but it cannot change the project's permissions or read
   secret values. Set up with:

   ```bash
   P=hgprofitoptions-hybertec; PN=785230671466; SA=github-deployer@$P.iam.gserviceaccount.com
   gcloud iam service-accounts create github-deployer --project=$P --display-name="GitHub Actions deployer"
   for role in roles/firebaseapphosting.admin roles/storage.bucketViewer roles/run.admin \
     roles/serviceusage.serviceUsageConsumer roles/firebasehosting.admin roles/firebaserules.admin \
     roles/datastore.indexAdmin roles/firebasestorage.viewer roles/cloudfunctions.developer \
     roles/cloudscheduler.admin roles/secretmanager.viewer roles/artifactregistry.reader \
     roles/firebaseauth.admin roles/firebaseextensions.viewer; do
     gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=$role --condition=None
   done
   for runtime in firebase-app-hosting-compute@$P.iam.gserviceaccount.com \
     $PN-compute@developer.gserviceaccount.com $P@appspot.gserviceaccount.com; do
     gcloud iam service-accounts add-iam-policy-binding $runtime --project=$P \
       --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser
   done
   gcloud storage buckets add-iam-policy-binding gs://firebaseapphosting-sources-$PN-us-central1 \
     --member="serviceAccount:$SA" --role=roles/storage.objectCreator
   gcloud iam workload-identity-pools create github --project=$P --location=global --display-name="GitHub Actions"
   gcloud iam workload-identity-pools providers create-oidc hgprofitoptions --project=$P --location=global \
     --workload-identity-pool=github --issuer-uri=https://token.actions.githubusercontent.com \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref" \
     --attribute-condition="assertion.repository_id == '1409132043' && assertion.repository_owner_id == '280069423' && assertion.ref == 'refs/heads/main' && assertion.environment == 'production' && assertion.workflow_ref == 'Hyber-Tec/hgprofitoptions/.github/workflows/ci.yml@refs/heads/main'"
   gcloud iam service-accounts add-iam-policy-binding $SA --project=$P --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository_id/1409132043"
   ```

   `1409132043` is this repository's GitHub ID and `280069423` the Hyber-Tec organization's. Renaming
   `ci.yml` or moving the deploy to another workflow file needs the same change in the provider's
   condition.

## Deploying changes

Merging a pull request deploys it. On every push to `main`, the CI workflow runs the checks, then its
Deploy job deploys everything in that commit, in this order:

1. Security rules and indexes (`firebase deploy --only firestore,storage`). Rules that did not change
   are not uploaded again, and indexes that exist only in the console are left alone.
2. Cloud Functions (`pnpm deploy:functions`). Functions that did not change are skipped, then the
   sign-up guard runs (see [What the organization requires](#what-the-organization-requires)).
3. The app (`pnpm deploy:web`): an App Hosting build and rollout, then the copy that
   hgprofitoptions.web.app serves.
4. Hosting (`firebase deploy --only hosting`).

The site changes 15 to 20 minutes after a merge: about 5 for the checks, then 10 to 15 for the
deploy. Follow a deploy under Actions; the
repository's `production` environment (Deployments, on the repository's home page) shows what is
live. When a deploy fails, the Deploy job turns red and GitHub emails whoever merged. Fix the cause,
then re-run the failed job, or run CI on `main` again (Actions > CI > Run workflow), which also
deploys again after a secret changes. A run on `main` always finishes; the next merge waits for it.

Some changes stop the deploy on purpose, because they need a person to decide:

- A function removed from the code. Delete it with
  `firebase functions:delete <name> --region us-central1 --project hgprofitoptions-hybertec`, then
  re-run the job.
- Anything else `firebase deploy` asks to confirm: a function's trigger changing type, a function
  starting to retry on failure, or more instances kept running (a bigger bill). Deploy the functions
  once by hand with `firebase deploy --only functions --project hgprofitoptions-hybertec`, answer the
  question, and run `pnpm auth:guard`.

The App Hosting step warns that it failed to grant roles to the App Hosting compute service account.
That is expected: the deploy account cannot change the project's permissions, and the compute
account already has its roles.

### Deploying by hand

As a project owner, from an up-to-date `main`:

| What changed     | Command                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| App              | `pnpm deploy:web`                                                             |
| Rules or indexes | `firebase deploy --only firestore,storage --project hgprofitoptions-hybertec` |
| Functions        | `pnpm deploy:functions`                                                       |
| Hosting rewrite  | `firebase deploy --only hosting --project hgprofitoptions-hybertec`           |

Turning on an integration: set its secret (and `EMAIL_FROM` or `SNAPTRADE_CLIENT_ID` in both
`apphosting.yaml` and the functions settings), then deploy the app and the functions. In the admin
console, Settings, then Connected services shows what is on, and Market data lists every scheduled
job run.

## Zoom classes and recaps

Members join the weekly class inside the site, and after each recorded class the AI writes its recap
in place of Zoom's own summary. Both use one app on the Zoom App Marketplace, made in the Zoom account
that hosts the class (an app joining another account's meetings needs Zoom's review first).

1. **Joining in the site**: in the app, turn on the Meeting SDK (Embed). Its Client ID goes in
   `ZOOM_SDK_KEY` in `apphosting.yaml` and its Client Secret in the `ZOOM_SDK_SECRET` secret. In
   Admin > Settings > Member area, enter the class's Zoom link, meeting ID and passcode. Members then
   see Join class in the Classroom; the Zoom app stays available as a second button.
2. **Recaps**: in Zoom's settings for the host, turn on cloud recording with audio transcripts
   (a paid plan), and record the class to the cloud. In the app, add an event subscription for
   "Recording transcript files have completed" sent to
   `https://hgprofitoptions.web.app/api/zoom/webhook`; its secret token goes in the
   `ZOOM_WEBHOOK_SECRET` secret. Deploy the app first, because Zoom checks the address when the
   subscription is saved. Only the class meeting gets recaps, never one-on-ones.
3. **When events come without a download token**, the Cloud Function downloads transcripts with a
   Server-to-Server OAuth app (scope to read cloud recordings) instead: `ZOOM_ACCOUNT_ID` and
   `ZOOM_CLIENT_ID` in `functions/.env.hgprofitoptions-hybertec`, and the `ZOOM_CLIENT_SECRET` secret.

Without Zoom, admins can still add a recap with a transcript file under Admin > Class recaps.

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
- A new instance's first request takes about 15 seconds while Cloud Run loads the app's files. The
  copy gets a startup probe that loads the home page first, so a new instance (after a deploy, or
  when traffic grows) only receives visitors once it is warm. It also runs in Cloud Run's
  second-generation environment, which loads those files about twice as fast at the same price.
- `firebase.json` rewrites every hgprofitoptions.web.app request to `hgprofitoptions-web`. Hosting
  passes only the `__session` cookie to the app, which is the session cookie it uses. It also lets
  browsers cache the icons and the web app manifest for a day; Next.js would have them downloaded
  again on every page change.
- The App Hosting address keeps working too. Don't connect App Hosting to GitHub for its own
  automatic rollouts: they skip the copy, so hgprofitoptions.web.app would keep serving the previous
  version, and merges already deploy through CI.

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
