/**
 * Turns on authenticator-app (TOTP) two-step verification for the project, which the admin console
 * requires. Needs Firebase Authentication with Identity Platform (Authentication > Settings > Upgrade).
 *
 *   pnpm auth:totp --prod
 */
import { flag, initAdmin } from "./lib/admin"

async function main(): Promise<void> {
  if (!flag("prod")) throw new Error("The Auth emulator does not support TOTP. Run with --prod for the real project.")
  const { auth, projectId } = initAdmin()
  await auth.projectConfigManager().updateProjectConfig({
    multiFactorConfig: {
      state: "ENABLED",
      factorIds: [],
      providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 5 } }],
    },
  })
  console.log(`Authenticator-app two-step verification is on for ${projectId}.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
