import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { after } from "next/server"
import { LuMail, LuMapPin, LuPhone } from "react-icons/lu"
import { SiWhatsapp } from "react-icons/si"
import { alertInstrument } from "@/core/alerts"
import { describeAuditAction, formatAuditDetail } from "@/core/audit"
import { growthIndex } from "@/core/calc/returns"
import { isoDateInZone, todayInMarketZone } from "@/core/dates"
import { formatDate, formatDateTimeET, formatInstrument, formatPrice } from "@/core/format"
import { nextRenewalQuarter } from "@/core/membership/quarters"
import { membershipSummary } from "@/core/membership/summary"
import { writeAudit } from "@/server/members"
import {
  portfolioSeries,
  readAccounts,
  readConnections,
  readHoldings,
  readTrades,
  returnsBlock,
} from "@/server/portfolio"
import { requireAdmin } from "@/lib/auth/guards"
import { getAdminNotes, getMemberRow, listAudit, listLogins } from "@/lib/data/admin"
import { adminDb } from "@/lib/firebase/admin"
import { cn } from "@/lib/utils"
import {
  AdminNotesEditor,
  AdminProfileForm,
  DeleteMemberButton,
  MemberActionsMenu,
  PeriodManager,
} from "@/components/admin/member-actions"
import { EquityCurve } from "@/components/portal/charts"
import { Signed, Stat, ToneBadge, type Tone } from "@/components/portal/display"
import { JournalStatsView, PnlHeatmap } from "@/components/portal/journal/journal-stats"
import { PageHeader } from "@/components/portal/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const metadata: Metadata = { title: "Member" }

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "subscription", label: "Subscription" },
  { value: "performance", label: "Performance" },
  { value: "journal", label: "Journal" },
  { value: "activity", label: "Activity" },
  { value: "notes", label: "Notes" },
] as const
type Tab = (typeof TABS)[number]["value"]

const TONES: Record<string, Tone> = { positive: "positive", warning: "warning", muted: "muted", negative: "negative" }

export default async function AdminMemberPage({ params, searchParams }: PageProps<"/admin/members/[id]">) {
  const { id } = await params
  const viewer = await requireAdmin({ next: `/admin/members/${id}` })
  const row = await getMemberRow(id)
  if (!row) notFound()
  const requested = (await searchParams).tab
  const tab: Tab = TABS.find((t) => t.value === requested)?.value ?? "profile"
  const { member, periods, status } = row
  const summary = membershipSummary(status)
  const today = todayInMarketZone()
  // The add-period form starts at the quarter after the member's latest period.
  const { year, q } = nextRenewalQuarter(periods, today)

  if (tab === "performance" || tab === "journal") {
    after(() =>
      writeAudit(adminDb(), {
        actorUid: viewer.uid,
        actorEmail: viewer.email,
        action: tab === "performance" ? "member.viewed_portfolio" : "member.viewed_journal",
        targetType: "member",
        targetId: id,
      }),
    )
  }

  return (
    <>
      <PageHeader
        title={member.fullName}
        description={member.email}
        meta={
          <>
            <ToneBadge tone={TONES[summary.tone] ?? "muted"}>{summary.status}</ToneBadge>
            {member.role === "admin" && <ToneBadge tone="neutral">Admin</ToneBadge>}
            <span>
              {summary.label} · {summary.detail}
            </span>
            {member.memberSince && <span>Member since {formatDate(member.memberSince)}</span>}
          </>
        }
        actions={
          <MemberActionsMenu
            uid={id}
            role={member.role}
            suspended={member.status === "suspended"}
            isSelf={id === viewer.uid}
          />
        }
      />
      {member.deletionRequestedAt && (
        <Alert variant="destructive">
          <AlertTitle>
            {member.fullName} asked to delete their account on {formatDateTimeET(member.deletionRequestedAt)}
          </AlertTitle>
          <AlertDescription>
            {member.deletionReason ?? "No reason given."} Delete the account from the Profile tab once you have
            confirmed with them.
          </AlertDescription>
        </Alert>
      )}
      <nav aria-label="Member sections" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "profile" ? `/admin/members/${id}` : `/admin/members/${id}?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              tab === t.value
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "profile" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminProfileForm
                uid={id}
                initial={{
                  fullName: member.fullName,
                  phone: member.phone,
                  whatsapp: member.whatsapp,
                  location: member.location,
                  timezone: member.timezone,
                }}
              />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <a href={`mailto:${member.email}`} className="flex items-center gap-2 hover:underline">
                  <LuMail className="size-4 text-muted-foreground" />
                  {member.email}
                </a>
                {member.phone && (
                  <a href={`tel:${member.phone}`} className="flex items-center gap-2 hover:underline">
                    <LuPhone className="size-4 text-muted-foreground" />
                    {member.phone}
                  </a>
                )}
                {member.whatsapp && (
                  <a
                    href={`https://wa.me/${member.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:underline"
                  >
                    <SiWhatsapp className="size-4 text-muted-foreground" />
                    {member.whatsapp}
                  </a>
                )}
                {member.location && (
                  <span className="flex items-center gap-2">
                    <LuMapPin className="size-4 text-muted-foreground" />
                    {member.location} · {member.timezone.replaceAll("_", " ")}
                  </span>
                )}
                <span className="text-muted-foreground">
                  Terms accepted {member.termsAcceptedAt ? formatDateTimeET(member.termsAcceptedAt) : "not yet"}
                </span>
              </CardContent>
            </Card>
            {id !== viewer.uid && (
              <Card size="sm" className="border-destructive/30">
                <CardHeader>
                  <CardTitle>Danger zone</CardTitle>
                  <CardDescription>
                    Suspend from the Actions menu to pause access; it can be undone. Deleting cannot.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DeleteMemberButton uid={id} email={member.email} name={member.fullName} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "subscription" && (
        <Card>
          <CardHeader>
            <CardTitle>Membership periods</CardTitle>
            <CardDescription>
              Access runs from midnight on the start date to the end of the end date, New York time. Back-to-back
              periods count as one stretch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodManager
              uid={id}
              defaultYear={year}
              defaultQuarter={q}
              periods={periods.map((p) => ({
                id: p.id,
                label: p.label,
                start: p.start,
                end: p.end,
                note: p.note,
                state: p.end < today ? "Ended" : p.start > today ? "Upcoming" : "Current",
              }))}
            />
          </CardContent>
        </Card>
      )}

      {tab === "performance" && <PerformanceTab uid={id} />}
      {tab === "journal" && <JournalTab uid={id} />}
      {tab === "activity" && <ActivityTab uid={id} />}
      {tab === "notes" && <NotesTab uid={id} />}
    </>
  )
}

async function PerformanceTab({ uid }: { uid: string }) {
  const db = adminDb()
  const [{ series }, accounts, connections] = await Promise.all([
    portfolioSeries(db, uid),
    readAccounts(db, uid),
    readConnections(db, uid),
  ])
  const holdings = (
    await Promise.all(accounts.filter((a) => a.included).map((a) => readHoldings(db, uid, a.id)))
  ).flat()
  const returns = returnsBlock(series, todayInMarketZone())
  const latest = series.at(-1)
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This member has not linked a brokerage. Their journal may still have trades they added by hand.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card size="sm">
          <CardContent>
            <Stat label="Value" value={formatPrice(latest?.value ?? null)} />
          </CardContent>
        </Card>
        {(
          [
            ["week", "1W"],
            ["month", "1M"],
            ["qtd", "Quarter"],
            ["ytd", "Year"],
            ["all", "All"],
          ] as const
        ).map(([key, label]) => (
          <Card key={key} size="sm">
            <CardContent>
              <Stat label={label} value={<Signed value={returns[key]} />} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Growth</CardTitle>
          <CardDescription>Time-weighted, included accounts only</CardDescription>
        </CardHeader>
        <CardContent>
          {series.length > 1 ? (
            <EquityCurve points={growthIndex(series).map((p) => ({ date: p.date, value: p.index - 1 }))} />
          ) : (
            <p className="text-sm text-muted-foreground">Not enough history yet.</p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            {holdings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open positions.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-0">Position</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="px-0 text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings
                    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
                    .map((h) => {
                      const instrument = alertInstrument(h)
                      return (
                        <TableRow key={h.id} className="hover:bg-transparent">
                          <TableCell className="px-0 font-mono text-[13px]">
                            {instrument ? formatInstrument(instrument) : h.symbol}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{h.quantity}</TableCell>
                          <TableCell className="px-0 text-right tabular-nums">{formatPrice(h.marketValue)}</TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Accounts and connections</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3">
                <span>
                  {c.brokerageName}
                  {c.isHouse && " (house)"}
                  <span className="block text-xs text-muted-foreground">
                    Consent {c.consentVersion} on {formatDateTimeET(c.consentedAt)}
                  </span>
                </span>
                <ToneBadge tone={c.status === "active" ? "positive" : "warning"}>
                  {c.status === "active" ? "Connected" : "Needs reconnecting"}
                </ToneBadge>
              </div>
            ))}
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-muted-foreground">
                <span>
                  {a.name ?? "Account"} {a.numberMask && `••${a.numberMask}`}
                </span>
                <span className="tabular-nums">
                  {formatPrice(a.balance?.total ?? null)}
                  {!a.included && " · excluded"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">Viewing a member&apos;s portfolio is recorded in the audit log.</p>
    </div>
  )
}

async function JournalTab({ uid }: { uid: string }) {
  const trades = await readTrades(adminDb(), uid)
  const journaled = trades.filter((t) => t.setup || t.thesis || t.lesson || t.rating !== null).slice(0, 30)
  return (
    <div className="flex flex-col gap-6">
      <JournalStatsView trades={trades} />
      <PnlHeatmap trades={trades} />
      <Card>
        <CardHeader>
          <CardTitle>Journal entries</CardTitle>
          <CardDescription>
            Setups, plans and lessons the member wrote. Their private notes are never shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {journaled.length === 0 ? (
            <p className="text-sm text-muted-foreground">No journal entries yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {journaled.map((t) => {
                const instrument = alertInstrument(t)
                return (
                  <li key={t.id} className="flex flex-col gap-1.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[13px] font-medium">
                        {instrument ? formatInstrument(instrument) : t.symbol}
                      </span>
                      <span className="flex items-center gap-2 text-sm">
                        {t.status === "closed" ? (
                          <Signed value={t.realizedPnl} as="money" />
                        ) : (
                          <ToneBadge tone="neutral">Open</ToneBadge>
                        )}
                        {t.rating !== null && <span className="text-xs text-muted-foreground">Rated {t.rating}/5</span>}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isoDateInZone(t.openedAt)} · {t.setup ?? "No setup"}
                      {t.alertId && " · followed an HG alert"}
                      {t.tags.length > 0 && ` · ${t.tags.map((x) => `#${x}`).join(" ")}`}
                    </p>
                    {t.thesis && <p className="text-sm">{t.thesis}</p>}
                    {t.lesson && <p className="text-sm text-muted-foreground">Lesson: {t.lesson}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Viewing a member&apos;s journal is recorded in the audit log.</p>
    </div>
  )
}

async function ActivityTab({ uid }: { uid: string }) {
  const [logins, audit] = await Promise.all([listLogins(uid, 25), listAudit({ targetId: uid, limit: 50 })])
  const ips = new Set(logins.map((l) => l.ip).filter(Boolean))
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Recent sign-ins</CardTitle>
          <CardDescription>
            {ips.size > 3
              ? `${ips.size} different IP addresses recently. The account may be shared.`
              : "Times are New York time."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-ins yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-0">When</TableHead>
                  <TableHead>Browser</TableHead>
                  <TableHead className="px-0 text-right">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logins.map((l, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="px-0 text-xs whitespace-nowrap">{formatDateTimeET(l.at)}</TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                      {l.userAgent ?? "Unknown"}
                      {l.provider === "google.com" && " · Google"}
                    </TableCell>
                    <TableCell className="px-0 text-right font-mono text-xs">{l.ip ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Changes to this account, and admin views of it</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="font-medium">{describeAuditAction(a.action)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.actorEmail ?? "System"}
                      {formatAuditDetail(a.detail) && ` · ${formatAuditDetail(a.detail)}`}
                    </span>
                  </span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    {formatDateTimeET(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

async function NotesTab({ uid }: { uid: string }) {
  const notes = await getAdminNotes(uid)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes for the next one-on-one</CardTitle>
        <CardDescription>
          Only admins see these.{notes.updatedAt && ` Last saved ${formatDateTimeET(notes.updatedAt)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdminNotesEditor uid={uid} initial={notes.body} />
      </CardContent>
    </Card>
  )
}
