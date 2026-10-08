/**
 * Demo data for the home page's member-area mockups. Fictional tickers only (DEMO, SAMPLE, TEST), so
 * nothing reads as a real alert or recommendation, and the numbers agree with each other: DEMO's last
 * close sits between its strike target and break level, and its channel lines step by CH from that close.
 * The mockups show plans and process, never profits or returns, not even made-up ones: regulators treat
 * hypothetical winning trades as earnings claims too.
 */

export const DEMO_STOCK = {
  symbol: "DEMO",
  lastClose: 118.4,
  channel: 6,
  boc: 3,
  medians: [
    { label: "5D", value: 117.1, above: true },
    { label: "30D", value: 113.85, above: true },
    { label: "90D", value: 121.3, above: false },
  ],
  target: 120.5,
  breakOf: 115,
  put: 112.5,
} as const

/** Channel lines at the last close ± k × CH, with BOC levels halfway between them. */
export const DEMO_LADDER = [-2, -1, 0, 1, 2].map((k) => DEMO_STOCK.lastClose + k * DEMO_STOCK.channel)

export const DEMO_ALERT = {
  kind: "Buy",
  title: "DEMO $120.00 Call · Exp Oct 23",
  time: "9:42 AM ET",
  buyPoint: "$3.20 to $3.40",
  targets: "T1 $5.00 · T2 $6.50",
  stop: "$2.40",
} as const

export const DEMO_TARGETS = [
  { symbol: "DEMO", target: 120.5, breakOf: 115, put: 112.5, expiry: "10/23", last: 118.4, status: "Between" },
  { symbol: "SAMPLE", target: 48, breakOf: 46.5, put: 45, expiry: "10/23", last: 48.6, status: "Above target" },
  { symbol: "TEST", target: 7.5, breakOf: 7, put: 6.5, expiry: "10/16", last: 6.85, status: "Below break" },
] as const

/** A journal entry the way members write them: the plan, what happened and the lesson. */
export const DEMO_JOURNAL_ENTRY = {
  title: "DEMO $120.00 Call",
  setup: "Channel break",
  plan: "Half at T1, stop at $2.40",
  outcome: "Stopped out, as planned",
  lesson: "Wait for the BOC before entering",
  feeling: "Calm",
  rating: 4,
} as const

/** How often each setup was logged this quarter, using the app's default setup tags. */
export const DEMO_SETUPS = [
  { label: "Channel break", count: 9 },
  { label: "BOC bounce", count: 7 },
  { label: "Median reclaim", count: 5 },
  { label: "Earnings play", count: 3 },
] as const

export const money = (value: number) => value.toFixed(2)
