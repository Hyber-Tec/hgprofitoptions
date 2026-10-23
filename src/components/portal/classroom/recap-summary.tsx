import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { LuCheck, LuListTodo } from "react-icons/lu"
import type { ClassSummaryDoc } from "@/server/model"

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t pt-5" aria-label={title}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/**
 * A class recap as members read it: the overview, then only the sections the class had. Tickers the site
 * follows link to their page.
 */
export function RecapSummary({ summary, followed }: { summary: ClassSummaryDoc; followed: ReadonlySet<string> }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-base leading-relaxed text-pretty">{summary.overview}</p>
      {summary.keyPoints.length > 0 && (
        <Section title="Key points">
          <ul className="flex flex-col gap-2.5">
            {summary.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <LuCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {summary.tickers.length > 0 && (
        <Section title="Tickers discussed">
          <ul className="flex flex-col gap-3">
            {summary.tickers.map((t) => (
              <li key={t.symbol} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-sm leading-relaxed">
                {followed.has(t.symbol) ? (
                  <Link
                    href={`/members/stocks/${encodeURIComponent(t.symbol)}` as Route}
                    className="h-fit rounded-sm font-mono font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {t.symbol}
                  </Link>
                ) : (
                  <span className="font-mono font-semibold">{t.symbol}</span>
                )}
                <span className="text-muted-foreground">{t.note}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {summary.actionItems.length > 0 && (
        <Section title="Before the next class">
          <ul className="flex flex-col gap-2.5">
            {summary.actionItems.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <LuListTodo className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {summary.questions.length > 0 && (
        <Section title="Questions from the class">
          <dl className="flex flex-col gap-4">
            {summary.questions.map((q, i) => (
              <div key={i} className="flex flex-col gap-1 text-sm leading-relaxed">
                <dt className="font-medium">{q.question}</dt>
                <dd className="text-muted-foreground">{q.answer}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </div>
  )
}
