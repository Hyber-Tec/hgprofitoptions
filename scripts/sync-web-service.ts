/**
 * Serves the app at hgprofitoptions.web.app.
 *
 * Firebase Hosting forwards requests only to a Cloud Run service that accepts public calls. The
 * hybertec.com organization forbids the usual `allUsers` grant, and App Hosting's own service cannot
 * stay public through Cloud Run's "no invoker check" setting either, because every rollout resets it.
 * So after each App Hosting rollout, this script copies that service's current configuration (image,
 * environment, secrets, service account, sizing) to a second service, hgprofitoptions-web, with the
 * invoker check off and one instance kept running. firebase.json points hgprofitoptions.web.app at
 * that service.
 *
 *   pnpm deploy:web   # App Hosting build and rollout, then this copy
 */
import { execFileSync } from "node:child_process"

const PROJECT = "hgprofitoptions-hybertec"
const REGION = "us-central1"
const SOURCE = "hgprofitoptions"
const TARGET = "hgprofitoptions-web"
const BASE = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}`

const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim()

interface Operation {
  name: string
  done?: boolean
  error?: { message?: string }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  })
  const body = (await response.json()) as T
  if (!response.ok)
    throw new Error(`${init.method ?? "GET"} ${url} failed (${response.status}): ${JSON.stringify(body)}`)
  return body
}

const source = await call<{ template: Record<string, unknown> }>(`${BASE}/services/${SOURCE}`)
// The revision name, labels and annotations belong to App Hosting's service; everything else is copied.
const template = Object.fromEntries(
  Object.entries(source.template).filter(([key]) => !["revision", "labels", "annotations"].includes(key)),
)
// One instance stays running. Without it, the first visitor after about 15 quiet minutes waits
// several seconds for a new one to start. While idle it costs about $13 a month (1 CPU, 1 GiB).
template.scaling = { ...(template.scaling as Record<string, unknown> | undefined), minInstanceCount: 1 }
const containers = template.containers as { image: string }[] | undefined
const image = containers?.[0]?.image
if (!image) throw new Error(`${SOURCE} has no container image yet. Deploy App Hosting first.`)

let operation = await call<Operation>(`${BASE}/services/${TARGET}?allowMissing=true`, {
  method: "PATCH",
  body: JSON.stringify({
    template,
    ingress: "INGRESS_TRAFFIC_ALL",
    invokerIamDisabled: true,
    labels: { "copied-from": SOURCE },
  }),
})
while (!operation.done) {
  await new Promise((resolve) => setTimeout(resolve, 3000))
  operation = await call<Operation>(`https://run.googleapis.com/v2/${operation.name}`)
}
if (operation.error) throw new Error(`Updating ${TARGET} failed: ${operation.error.message ?? "unknown error"}`)
const target = await call<{ uri: string }>(`${BASE}/services/${TARGET}`)
console.log(`${TARGET} runs ${image} (${target.uri}); hgprofitoptions.web.app serves it.`)
