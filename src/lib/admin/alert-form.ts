import "server-only"
import { nextFriday, todayInMarketZone } from "@/core/dates"
import type { AlertDoc } from "@/server/model"
import type { ComposerInitial, TargetOption } from "@/components/admin/alert-composer"
import { latestTargetUpdate, listActiveTickers } from "@/lib/data/tools"

const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v))

export function composerInitial(alert: AlertDoc | null): ComposerInitial {
  if (!alert) {
    return {
      id: null,
      kind: "buy",
      symbol: "",
      instrument: "call",
      strike: "",
      expiry: nextFriday(todayInMarketZone()),
      buyLow: "",
      buyHigh: "",
      sellPoints: ["", "", ""],
      stop: "",
      title: "",
      body: "",
      imagePath: null,
      sendEmail: false,
    }
  }
  return {
    id: alert.id,
    kind: alert.kind,
    symbol: alert.symbol ?? "",
    instrument: alert.assetType === "option" ? (alert.optionRight ?? "call") : "stock",
    strike: str(alert.strike),
    expiry: alert.expiry ?? "",
    buyLow: str(alert.buyLow),
    buyHigh: alert.buyHigh !== null && alert.buyHigh !== alert.buyLow ? str(alert.buyHigh) : "",
    sellPoints: [str(alert.sellPoints[0]), str(alert.sellPoints[1]), str(alert.sellPoints[2])],
    stop: str(alert.stop),
    title: alert.title,
    body: alert.body,
    imagePath: alert.imagePath,
    sendEmail: alert.sendEmail,
  }
}

export async function composerOptions(): Promise<{ symbols: string[]; targets: TargetOption[] }> {
  const [tickers, latest] = await Promise.all([listActiveTickers(), latestTargetUpdate()])
  return {
    symbols: tickers.filter((t) => t.kind === "stock").map((t) => t.symbol),
    targets: (latest?.entries ?? [])
      .map((e) => ({
        symbol: e.symbol,
        target: e.target,
        breakLevel: e.breakLevel,
        putStrike: e.putStrike,
        expiry: e.expiry,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
  }
}
