/**
 * Seeds the settings and public content, and optionally invites the first admin.
 *
 *   pnpm seed                                            # emulators
 *   pnpm seed --admin=hg@example.com --name="Hubert Gaffney"
 *   pnpm seed --prod --admin=...                         # the real project
 *
 * Existing settings and content are kept unless --force is passed.
 */
import { Timestamp } from "firebase-admin/firestore"
import { FAQS } from "../src/content/faqs"
import { TESTIMONIALS } from "../src/content/testimonials"
import { createInvite, inviteUrl } from "../src/server/invites"
import { COLLECTIONS, DEFAULT_SITE_SETTINGS, memberSettingsSchema } from "../src/server/model"
import { flag, initAdmin, option } from "./lib/admin"

async function main(): Promise<void> {
  const { db } = initAdmin()
  const force = flag("force")

  const setIfMissing = async (collection: string, id: string, data: Record<string, unknown>): Promise<boolean> => {
    const ref = db.collection(collection).doc(id)
    if (!force && (await ref.get()).exists) return false
    await ref.set(data)
    return true
  }

  const wrote = [
    (await setIfMissing(COLLECTIONS.settings, "site", { ...DEFAULT_SITE_SETTINGS })) && "settings/site",
    (await setIfMissing(COLLECTIONS.settings, "members", memberSettingsSchema.parse({}))) && "settings/members",
  ].filter(Boolean)
  console.log(wrote.length > 0 ? `Wrote ${wrote.join(", ")}` : "Settings already exist (use --force to overwrite)")

  let testimonials = 0
  for (const { id, ...t } of TESTIMONIALS)
    if (await setIfMissing(COLLECTIONS.testimonials, id, { ...t, updatedAt: Timestamp.now() })) testimonials++
  let faqs = 0
  for (const { id, ...f } of FAQS)
    if (await setIfMissing(COLLECTIONS.faqs, id, { ...f, updatedAt: Timestamp.now() })) faqs++
  console.log(`Testimonials written: ${testimonials}, FAQs written: ${faqs}`)

  const adminEmail = option("admin")
  if (adminEmail) {
    const fullName = option("name") ?? adminEmail.split("@")[0] ?? adminEmail
    const { token, expiresAt } = await createInvite(
      db,
      { email: adminEmail, fullName, role: "admin", periods: [] },
      { uid: null, email: null },
    )
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    console.log(`Admin invite for ${adminEmail} (expires ${expiresAt.toISOString().slice(0, 10)}):`)
    console.log(`  ${inviteUrl(siteUrl, token)}`)
    console.log("  Sign in with Google using that email, or open the link to create a password.")
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
