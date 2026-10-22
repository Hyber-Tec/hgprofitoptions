/**
 * Deploys the Cloud Functions, then runs the sign-up guard (scripts/enable-signup-guard.ts).
 *
 * Whenever allowInvitedSignUps changes, `firebase deploy` updates it and then reports an error: making
 * it public needs the `allUsers` grant that the hybertec.com organization forbids. That one error is
 * expected, because the guard does the same job without the grant. Any other error fails the deploy.
 * Unchanged functions are skipped, and nothing is deleted: a function removed from the code stops the
 * deploy until someone deletes it with `firebase functions:delete`.
 *
 *   pnpm deploy:functions
 */
import { execFileSync, spawn } from "node:child_process"
import { stripVTControlCharacters } from "node:util"

const PROJECT = "hgprofitoptions-hybertec"
const GUARDED = "allowInvitedSignUps(us-central1)"

/** Runs `firebase deploy --only functions`, showing its output as it goes. */
function deploy(): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("firebase", ["deploy", "--only", "functions", "--project", PROJECT, "--non-interactive"], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    const show = (stream: NodeJS.WriteStream) => (chunk: Buffer) => {
      stream.write(chunk)
      output += chunk.toString()
    }
    child.stdout.on("data", show(process.stdout))
    child.stderr.on("data", show(process.stderr))
    child.on("error", reject)
    child.on("close", (code) => resolve({ ok: code === 0, output: stripVTControlCharacters(output) }))
  })
}

/** The functions that firebase's error report lists under a heading. */
function listed(output: string, heading: string): string[] {
  const at = output.indexOf(heading)
  if (at === -1) return []
  const lines = output
    .slice(at + heading.length)
    .split("\n")
    .slice(1)
  const end = lines.findIndex((line) => !line.startsWith("\t"))
  return lines.slice(0, end === -1 ? lines.length : end).map((line) => line.trim())
}

const { ok, output } = await deploy()
// The guard is safe to repeat, and an updated allowInvitedSignUps needs it whatever else happened.
execFileSync("tsx", ["scripts/enable-signup-guard.ts"], { stdio: "inherit" })

if (!ok) {
  const failed = listed(output, "Functions deploy had errors with the following functions:")
  const invoker = listed(output, "Unable to set the invoker for the IAM policy on the following functions:")
  const onlyExpected = [failed, invoker].every((names) => names.length === 1 && names[0] === GUARDED)
  if (!onlyExpected) throw new Error("The functions deploy failed. Its errors are above.")
  console.log(`The error for ${GUARDED} is the expected one: the sign-up guard above did that step.`)
}
// Without a person to confirm, firebase skips a function whose trigger changes type and still succeeds.
if (output.includes("Skipping updates for functions that may be unsafe to update"))
  throw new Error("Some functions were not updated (see the warning above). Deploy them by hand: docs/deploy.md.")
