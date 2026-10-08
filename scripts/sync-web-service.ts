/**
 * Serves the app at hgprofitoptions.web.app.
 *
 * Firebase Hosting forwards requests only to a Cloud Run service that accepts public calls. The
 * hybertec.com organization forbids the usual `allUsers` grant, and App Hosting's own service cannot
 * stay public through Cloud Run's "no invoker check" setting either, because every rollout resets it.
 * So after each App Hosting rollout, this script copies that service's current configuration (image,
 * environment, secrets, service account, sizing) to a second service, hgprofitoptions-web, with the
 * invoker check off, one instance kept running, the second-generation execution environment and a
 * startup probe that warms new instances before they get traffic. firebase.json points
 * hgprofitoptions.web.app at that service.
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
const containers = template.containers as { image: string; startupProbe?: unknown }[] | undefined
const container = containers?.[0]
if (!container) throw new Error(`${SOURCE} has no container image yet. Deploy App Hosting first.`)
const image = container.image
// A new instance's first request takes about 15 seconds while Cloud Run loads the app's files (the
// next ones take milliseconds). App Hosting's probe only checks that the port is open, so that wait
// fell on a visitor after every deploy. This probe loads the home page first, and the instance gets
// traffic once it has answered.
container.startupProbe = {
  httpGet: { path: "/", port: 8080 },
  timeoutSeconds: 10,
  periodSeconds: 10,
  failureThreshold: 24,
}
// The second-generation environment reads the app's files much faster than App Hosting's default
// first generation: a new instance is ready sooner and each page's first load on it is about twice as
// fast. Both cost the same.
template.executionEnvironment = "EXECUTION_ENVIRONMENT_GEN2"

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
