/**
 * One-time import of HG's private source files (docs/private/source-files) into Firestore:
 * the ticker universe with channel settings, the Key Market Data week, the Oct 7 strike targets,
 * the target categories and the leveraged ETF guide.
 *
 *   pnpm import:source            # into the emulators
 *   pnpm import:source --prod     # into the real project
 *
 * Re-running is safe: documents are merged, and the strike target update is replaced.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { signedRange, svi } from "../src/core/calc/kmd"
import type { IsoDate } from "../src/core/domain/types"
import { applySuggestions, parseStrikeTargets } from "../src/core/parsers/strike-targets"
import { COLLECTIONS, targetGroupsSchema } from "../src/server/model"
import { initAdmin } from "./lib/admin"
import {
  parseEarningsWindow,
  readChannelSheet,
  readEtfGuide,
  readKeyMarketData,
  readStrikeTargetsText,
  SOURCE_DIR,
  sourceFile,
  sourceFilesPresent,
} from "./lib/source-files"

const TARGETS_EFFECTIVE_DATE = "2026-10-07" as IsoDate

function required(prefix: string): string {
  const path = sourceFile(prefix)
  if (!path) throw new Error(`Missing source file starting with "${prefix}" in ${SOURCE_DIR}`)
  return path
}

async function main(): Promise<void> {
  if (!sourceFilesPresent()) throw new Error(`The private source files are not in ${SOURCE_DIR}.`)
  const { db } = initAdmin()
  const now = Timestamp.now()

  // ---- Target categories -------------------------------------------------------------------
  const groupsConfig = targetGroupsSchema.parse(
    JSON.parse(readFileSync(join(SOURCE_DIR, "target-groups.json"), "utf8")),
  )
  await db.collection(COLLECTIONS.config).doc("targetGroups").set(groupsConfig)
  console.log(`config/targetGroups: ${groupsConfig.groups.length} categories`)

  // ---- Tickers from the Median & Channel Chart ----------------------------------------------
  const channels = await readChannelSheet(required("MEDIAN and CHANNEL"))
  const asOf = channels.windows.w30[1] ?? TARGETS_EFFECTIVE_DATE
  const writer = db.bulkWriter()
  for (const b of channels.blocks) {
    const earnings = parseEarningsWindow(b.earningsText, asOf)
    void writer.set(
      db.collection(COLLECTIONS.tickers).doc(b.symbol),
      {
        symbol: b.symbol,
        kind: "stock",
        active: true,
        channelSize: b.ch,
        bocSize: b.boc,
        fsLevels: b.fsLevels,
        ssLevels: b.ssLevels,
        earningsStart: earnings.start,
        earningsEnd: earnings.end,
        earningsNote: earnings.note,
        metrics: {
          asOf,
          lastClose: b.anchor,
          price: b.price,
          high5d: b.high5d,
          low5d: b.low5d,
          high30d: b.high30d,
          low30d: b.low30d,
          high90d: b.high90d,
          low90d: b.low90d,
          source: "import",
        },
        updatedAt: now,
        updatedBy: null,
      },
      { merge: true },
    )
  }
  console.log(`tickers: ${channels.blocks.length} from the channel sheet (as of ${asOf})`)

  // ---- Key Market Data week ------------------------------------------------------------------
  const kmd = await readKeyMarketData(required("Key Market Data"))
  const row = (r: (typeof kmd.rows)[number]) => {
    const range = signedRange(r.pfcp, r.high, r.low, r.close)
    return { pfcp: r.pfcp, high: r.high, low: r.low, close: r.close, range, svi: svi(range, r.close) }
  }
  const stocks = Object.fromEntries(kmd.rows.filter((r) => r.kind === "stock").map((r) => [r.symbol, row(r)]))
  const indices = Object.fromEntries(kmd.rows.filter((r) => r.kind === "index").map((r) => [r.symbol, row(r)]))
  void writer.set(db.collection(COLLECTIONS.weeks).doc(kmd.weekStart), {
    weekStart: kmd.weekStart,
    weekEnd: kmd.weekEnd,
    rows: stocks,
    indices,
    source: "import",
    computedAt: now,
  })
  for (const symbol of Object.keys(indices)) {
    void writer.set(
      db.collection(COLLECTIONS.tickers).doc(symbol),
      { symbol, kind: "index", active: true, updatedAt: now },
      { merge: true },
    )
  }
  console.log(
    `weeks/${kmd.weekStart}: ${Object.keys(stocks).length} stocks and ${Object.keys(indices).length} indices (skipped duplicates: ${kmd.duplicates.join(", ") || "none"})`,
  )

  // ---- Strike Price Targets ------------------------------------------------------------------
  const text = await readStrikeTargetsText(required("Strike Price Targets"))
  const known = new Set(channels.blocks.map((b) => b.symbol))
  const parsed = parseStrikeTargets(text, {
    effectiveDate: TARGETS_EFFECTIVE_DATE,
    groups: groupsConfig.groups,
    knownTickers: known,
  })
  const newGroups = parsed.issues.filter((i) => i.code === "new-group")
  if (newGroups.length > 0) throw new Error(`Unknown categories in the PDF: ${newGroups.map((i) => i.raw).join("; ")}`)
  const complete = applySuggestions(parsed)
  const entries = complete.groups.flatMap((g) => g.entries)
  void writer.set(db.collection(COLLECTIONS.targetUpdates).doc(TARGETS_EFFECTIVE_DATE), {
    effectiveDate: TARGETS_EFFECTIVE_DATE,
    title: "Strike Price Targets Update Oct 7",
    status: "published",
    entries,
    sourceText: text,
    changeNote: null,
    revisionOf: null,
    revision: 1,
    publishedAt: now,
    publishedBy: null,
    createdAt: now,
    createdBy: null,
  })
  console.log(
    `targetUpdates/${TARGETS_EFFECTIVE_DATE}: ${entries.length} entries in ${complete.groups.length} categories, ${complete.issues.length} notes kept for review`,
  )

  // ---- Leveraged ETF guide ---------------------------------------------------------------------
  const etf = await readEtfGuide(required("Profit Option"))
  void writer.set(db.collection(COLLECTIONS.config).doc("leveragedEtfs"), {
    guidance: etf.guidance,
    pairs: etf.pairs.map((p) => ({
      underlying: p.underlying,
      etf: p.etf,
      leverage: 2,
      direction: "bull",
      issuer: null,
    })),
    updatedAt: now,
  })
  for (const p of etf.pairs) {
    void writer.set(
      db.collection(COLLECTIONS.tickers).doc(p.etf),
      { symbol: p.etf, kind: "etf", active: true, updatedAt: now },
      { merge: true },
    )
  }
  console.log(`config/leveragedEtfs: ${etf.pairs.length} pairs`)

  await writer.close()
  await db.collection(COLLECTIONS.jobRuns).add({
    job: "import-source-files",
    status: "succeeded",
    startedAt: now,
    finishedAt: FieldValue.serverTimestamp(),
    detail: null,
  })
  console.log("Import finished.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
