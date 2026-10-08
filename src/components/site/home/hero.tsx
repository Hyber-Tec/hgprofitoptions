import { LuArrowUpRight, LuCalendarCheck, LuLayoutDashboard, LuLogIn } from "react-icons/lu"
import { Badge } from "@/components/ui/badge"
import { ButtonAnchor, ButtonLink } from "@/components/shared/button-link"

/** `signedIn` swaps "Member login" for a way back into the member area. */
export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden border-b">
      <div aria-hidden className="bg-grid mask-radial pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 *:min-w-0 sm:px-6 sm:py-28 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="outline" className="h-7 gap-2 rounded-full px-3 text-xs font-normal text-muted-foreground">
            <span className="size-1.5 rounded-full bg-positive" aria-hidden />
            Live options classroom · Every Saturday
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Your journey toward trading excellence begins now
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Develop a sophisticated trading portfolio. Trade with discipline, protect your capital, and get personalized
            strategies from experienced traders.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonAnchor size="lg" className="h-11 px-5 text-base" href="/book" target="_blank" rel="noopener">
              <LuCalendarCheck data-icon="inline-start" />
              Book my free 15-min intro call
            </ButtonAnchor>
            {signedIn ? (
              <ButtonLink size="lg" variant="outline" className="h-11 px-5 text-base" href="/members">
                <LuLayoutDashboard data-icon="inline-start" />
                Go to the member area
              </ButtonLink>
            ) : (
              <ButtonLink size="lg" variant="outline" className="h-11 px-5 text-base" href="/login">
                <LuLogIn data-icon="inline-start" />
                Member login
              </ButtonLink>
            )}
          </div>
          <p className="text-sm text-muted-foreground">No credit card needed.</p>
        </div>
        <HeroPreview />
      </div>
      <div className="relative border-t">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {[
            ["8+", "countries represented by our members"],
            ["Every Saturday", "live classes over Zoom"],
            ["Monthly", "one-on-one mentoring"],
            ["10+ years", "of trading experience behind every lesson"],
          ].map(([value, label]) => (
            <div key={label} className="flex flex-col gap-1 py-6 pr-4">
              <dt className="sr-only">{label}</dt>
              <dd className="text-xl font-semibold tracking-tight">{value}</dd>
              <dd className="text-sm text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/** Decorative product preview with clearly fake demo data (no real member content). */
function HeroPreview() {
  return (
    <div aria-hidden className="relative hidden select-none lg:block">
      <div className="absolute -inset-6 rounded-3xl bg-gradient-to-b from-foreground/5 to-transparent blur-2xl" />
      <div className="relative flex flex-col gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-positive/12 px-2 py-0.5 text-xs font-medium text-positive">
              <LuArrowUpRight className="size-3.5" /> Buy
            </span>
            <span className="text-xs text-muted-foreground">9:42 AM ET · Demo</span>
          </div>
          <p className="mt-3 font-mono text-sm">DEMO $120.00 Call · Exp Oct 23</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {[
              ["Buy point", "$3.20 to $3.40"],
              ["Target 1", "$5.00"],
              ["Stop", "$2.40"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/60 p-2">
                <p className="text-muted-foreground">{k}</p>
                <p className="num mt-0.5 font-medium">{v}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="ml-10 rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Channel ladder</span>
            <span className="text-muted-foreground">CH 6.00 · BOC 3.00</span>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {[112, 106, 100, 94, 88].map((level, i) => (
              <div key={level} className="flex items-center gap-3 text-xs">
                <span className="num w-12 text-right text-muted-foreground">{level.toFixed(2)}</span>
                <span
                  className={
                    i === 2 ? "h-px flex-1 bg-foreground" : "h-px flex-1 border-t border-dashed border-foreground/25"
                  }
                />
                {i === 2 && (
                  <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                    Last 101.20
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">My journal · this quarter</span>
            <span className="text-muted-foreground">Demo</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["+12.4%", "Return"],
              ["71%", "Win rate"],
              ["24", "Trades"],
            ].map(([v, k]) => (
              <div key={k}>
                <p className={`num text-lg font-semibold ${k === "Return" ? "text-positive" : ""}`}>{v}</p>
                <p className="text-[11px] text-muted-foreground">{k}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
