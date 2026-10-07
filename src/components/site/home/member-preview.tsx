import { LuArrowDownRight, LuArrowUpRight, LuCheck } from "react-icons/lu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Section, SectionHeading } from "../section"

const INCLUDED = [
  "Live classroom, 24/7",
  "Breakout sessions as needed",
  "Monthly one-on-one with HG",
  "Weekly Saturday presentations on Zoom",
  "A global team of experienced traders",
]

/** A preview of the member area with obviously fake demo data. */
export function MemberPreview() {
  return (
    <Section id="member-area">
      <SectionHeading
        eyebrow="Inside the member area"
        title="Your tools, alerts and journal in one place"
        lead="A quick look at the member area, shown with demo data."
      />
      <div className="grid gap-8 *:min-w-0 lg:grid-cols-[1fr_0.8fr] lg:items-start">
        <Tabs defaultValue="alerts" className="gap-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="targets">Strike targets</TabsTrigger>
            <TabsTrigger value="journal">Journal</TabsTrigger>
          </TabsList>
          <TabsContent value="alerts">
            <DemoFrame>
              {[
                {
                  kind: "Buy",
                  up: true,
                  line: "DEMO $120.00 Call · Exp Oct 23",
                  detail: "Buy point $3.20 to $3.40 · T1 $5.00 · Stop $2.40",
                  time: "9:42 AM ET",
                },
                {
                  kind: "Sell",
                  up: false,
                  line: "SAMPLE $48.00 Call · Exp Oct 16",
                  detail: "Sold half at T1 $2.10 · +38%",
                  time: "Yesterday",
                },
              ].map((a) => (
                <div
                  key={a.line}
                  className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border bg-background p-3 sm:flex-nowrap"
                >
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${a.up ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative"}`}
                  >
                    {a.up ? <LuArrowUpRight className="size-3.5" /> : <LuArrowDownRight className="size-3.5" />}
                    {a.kind}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground sm:order-last">{a.time}</span>
                  <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                    <p className="font-mono text-sm">{a.line}</p>
                    <p className="text-xs text-muted-foreground">{a.detail}</p>
                  </div>
                </div>
              ))}
            </DemoFrame>
          </TabsContent>
          <TabsContent value="targets">
            <DemoFrame>
              <div className="overflow-hidden rounded-lg border bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      {["Ticker", "Target", "Break of", "Put", "Expiry"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="num">
                    {[
                      ["DEMO", "120.50", "115.00", "112.50", "10/23"],
                      ["SAMPLE", "48.00", "46.50", "45.00", "10/23"],
                      ["TEST", "7.50", "7.00", "6.50", "10/16"],
                    ].map((row) => (
                      <tr key={row[0]} className="border-t">
                        {row.map((cell, i) => (
                          <td key={i} className={`px-3 py-2 ${i === 0 ? "font-mono font-medium" : ""}`}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DemoFrame>
          </TabsContent>
          <TabsContent value="journal">
            <DemoFrame>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["+12.4%", "Quarter return", true],
                  ["71%", "Win rate", false],
                  ["2.3", "Profit factor", false],
                  ["24", "Trades", false],
                ].map(([v, k, positive]) => (
                  <div key={String(k)} className="rounded-lg border bg-background p-3">
                    <p className={`num text-xl font-semibold ${positive ? "text-positive" : ""}`}>{v}</p>
                    <p className="text-xs text-muted-foreground">{k}</p>
                  </div>
                ))}
              </div>
            </DemoFrame>
          </TabsContent>
        </Tabs>
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <h3 className="font-semibold">Every membership includes</h3>
          <ul className="flex flex-col gap-3">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm">
                <LuCheck className="mt-0.5 size-4 shrink-0 text-positive" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

function DemoFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <span className="absolute top-3 right-3 rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Demo data
      </span>
      <div className="mt-6 flex flex-col gap-3">{children}</div>
    </div>
  )
}
