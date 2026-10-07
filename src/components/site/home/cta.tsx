import Link from "next/link"
import { LuCalendarCheck } from "react-icons/lu"
import { Button } from "@/components/ui/button"

export function CtaBand({ title = "Ready to start?", lead = "Let's discuss your trading experience and build your goals." }: { title?: string; lead?: string }) {
  return (
    <section className="px-4 pb-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border bg-card px-6 py-14 text-center sm:px-12">
        <div aria-hidden className="bg-grid mask-radial pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-4">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
          <p className="text-muted-foreground">{lead}</p>
          <Button size="lg" className="mt-2 h-11 px-5 text-base" render={<Link href="/book" target="_blank" rel="noopener" />} nativeButton={false}>
            <LuCalendarCheck data-icon="inline-start" />
            Book my free call
          </Button>
          <p className="text-xs text-muted-foreground">No credit card needed.</p>
        </div>
      </div>
    </section>
  )
}
