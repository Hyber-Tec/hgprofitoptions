/**
 * Makes the invite-only sign-up function reachable by Firebase Authentication and registers it.
 *
 * `firebase deploy` normally does this by granting `allUsers` the Cloud Run invoker role, which the
 * hybertec.com organization policy forbids, so the deploy reports an error for allowInvitedSignUps.
 * This script does the same job without that grant: it turns off the invoker check on the function's
 * Cloud Run service (allowed by the policy) and registers the function as Auth's beforeCreate trigger.
 * Run it after every functions deploy. Uses your gcloud sign-in.
 *
 *   pnpm auth:guard
 */
import { execFileSync } from "node:child_process"

const PROJECT = "hgprofitoptions-hybertec"
const REGION = "us-central1"
const FUNCTION = "allowInvitedSignUps"

const gcloud = (...args: string[]) =>
  execFileSync("gcloud", [...args, `--project=${PROJECT}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()

const uri = gcloud("functions", "describe", FUNCTION, `--region=${REGION}`, "--format=value(serviceConfig.uri)")
if (!uri.startsWith("https://")) throw new Error(`${FUNCTION} is not deployed in ${REGION}.`)
const service = new URL(uri).hostname.split("-")[0] ?? FUNCTION.toLowerCase()

gcloud("run", "services", "update", service, `--region=${REGION}`, "--no-invoker-iam-check", "--quiet")
console.log(`Cloud Run service ${service} accepts calls from Firebase Authentication.`)

const token = gcloud("auth", "print-access-token")
const response = await fetch(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=blockingFunctions.triggers`,
  {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": PROJECT, "Content-Type": "application/json" },
    body: JSON.stringify({ blockingFunctions: { triggers: { beforeCreate: { functionUri: uri } } } }),
  },
)
if (!response.ok) throw new Error(`Registering the function failed (${response.status}): ${await response.text()}`)
console.log(`${FUNCTION} is registered as the sign-up check (${uri}).`)
