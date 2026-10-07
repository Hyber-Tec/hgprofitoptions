import type { Metadata } from "next"
import Link from "next/link"
import { LuCalendarCheck, LuTriangleAlert } from "react-icons/lu"
import { formatPrice } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { getMemberSettings } from "@/lib/data/settings"
import { getEtfConfig, tickerMap } from "@/lib/data/tools"
import { PageHeader } from "@/components/portal/page-header"
import { Watermark } from "@/components/portal/watermark"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Leveraged ETFs" }

export default async function EtfsPage() {
  const viewer = await requireActiveMember("/members/etfs")
  const [config, tickers, settings] = await Promise.all([getEtfConfig(), tickerMap(), getMemberSettings()])
  const bookHref = settings.oneOnOneUrl ?? "/book"
  const showIssuer = config.pairs.some((p) => p.issuer)
  const showEtfClose = config.pairs.some((p) => tickers.get(p.etf)?.metrics)
  const pairs = [...config.pairs].sort((a, b) => a.underlying.localeCompare(b.underlying))
  return (
    <>
      <Watermark text={viewer.email} />
      <PageHeader title="Leveraged ETF Guide" description="The 2x bull ETFs that track the stocks HG follows." />
      <Alert className="border-warning/40 bg-warning/5">
        <LuTriangleAlert className="text-warning" />
        <AlertTitle>Talk to HG before trading leveraged ETFs</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          {config.guidance.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <Button
            size="sm"
            className="mt-1 w-fit"
            render={
              <a
                href={bookHref}
                target={bookHref.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
              />
            }
            nativeButton={false}
          >
            <LuCalendarCheck />
            Book a 1:1 with HG
          </Button>
        </AlertDescription>
      </Alert>
      {pairs.length === 0 ? (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No ETF pairs yet</EmptyTitle>
            <EmptyDescription>HG will add the leveraged ETF pairs here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Stock</TableHead>
                <TableHead>2x bull ETF</TableHead>
                <TableHead className="text-right">Leverage</TableHead>
                {showIssuer && <TableHead>Issuer</TableHead>}
                <TableHead className="text-right">Stock last close</TableHead>
                {showEtfClose && <TableHead className="text-right">ETF last close</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((p) => (
                <TableRow key={`${p.underlying}-${p.etf}`}>
                  <TableCell>
                    <Link
                      href={`/members/stocks/${p.underlying}`}
                      className="rounded-sm font-mono font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {p.underlying}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono">{p.etf}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.leverage}x {p.direction === "bull" ? "bull" : "bear"}
                  </TableCell>
                  {showIssuer && <TableCell className="text-muted-foreground">{p.issuer ?? "-"}</TableCell>}
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(tickers.get(p.underlying)?.metrics?.lastClose)}
                  </TableCell>
                  {showEtfClose && (
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(tickers.get(p.etf)?.metrics?.lastClose)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Leveraged ETFs reset daily and can lose value quickly, even when the stock ends flat. Educational content, not
        personalized investment advice.
      </p>
    </>
  )
}
