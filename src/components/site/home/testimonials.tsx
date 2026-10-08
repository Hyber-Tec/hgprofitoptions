"use client"

import BG from "country-flag-icons/react/3x2/BG"
import CA from "country-flag-icons/react/3x2/CA"
import GB from "country-flag-icons/react/3x2/GB"
import IE from "country-flag-icons/react/3x2/IE"
import RW from "country-flag-icons/react/3x2/RW"
import SG from "country-flag-icons/react/3x2/SG"
import US from "country-flag-icons/react/3x2/US"
import Image from "next/image"
import { useEffect, useState } from "react"
import type { FlagComponent } from "country-flag-icons/react/3x2"
import { LuQuote } from "react-icons/lu"
import { formatPercent, formatSignedMoney } from "@/core/format"
import type { TestimonialDoc } from "@/server/model"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"

const FLAGS: Record<string, FlagComponent> = { BG, CA, GB, IE, RW, SG, US }

function MemberAvatar({ testimonial }: { testimonial: TestimonialDoc }) {
  const Flag = testimonial.flag ? FLAGS[testimonial.flag] : undefined
  return (
    <Avatar className="size-11 overflow-hidden">
      {testimonial.avatar ? (
        <Image src={testimonial.avatar} alt="" width={88} height={88} className="size-full rounded-full object-cover" />
      ) : Flag ? (
        <Flag title={testimonial.location} className="h-full w-auto max-w-none scale-150 object-cover" />
      ) : (
        <AvatarFallback>{testimonial.name.slice(0, 1)}</AvatarFallback>
      )}
    </Avatar>
  )
}

function TradeCard({ trade }: { trade: NonNullable<TestimonialDoc["trade"]> }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="font-mono text-sm">
        {trade.symbol} ${trade.strike.toFixed(2)} {trade.type === "call" ? "Call" : "Put"} · Exp {trade.expiryLabel}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-xs text-muted-foreground">Realized profit</span>
        <div className="flex items-center gap-2">
          <span className="num text-lg font-semibold text-positive">
            {formatSignedMoney(trade.realizedProfit, trade.currency)}
            {trade.currency !== "USD" && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">{trade.currency}</span>
            )}
          </span>
          <Badge variant="outline" className="num border-positive/30 text-positive">
            {formatPercent(trade.percentGain, { digits: 0 })}
          </Badge>
        </div>
      </div>
    </div>
  )
}

export function Testimonials({ items }: { items: TestimonialDoc[] }) {
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(1)

  useEffect(() => {
    if (!api) return
    const update = () => setCurrent(api.selectedScrollSnap() + 1)
    update()
    api.on("select", update)
    return () => {
      api.off("select", update)
    }
  }, [api])

  return (
    <div className="flex flex-col gap-6">
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: true }}
        className="w-full"
        aria-label="Member testimonials"
      >
        <CarouselContent>
          {items.map((t) => (
            <CarouselItem key={t.id} className="basis-full md:basis-1/2 lg:basis-1/3">
              <Card className="h-full ring-inset">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <MemberAvatar testimonial={t} />
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-sm text-muted-foreground">{t.location}</p>
                    </div>
                  </div>
                  {t.trade && <TradeCard trade={t.trade} />}
                  <blockquote className="relative flex-1 text-sm leading-relaxed text-pretty text-muted-foreground">
                    <LuQuote aria-hidden className="mb-2 size-4 text-foreground/40" />
                    <p>&ldquo;{t.quote}&rdquo;</p>
                  </blockquote>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="mt-6 flex items-center justify-center gap-4">
          <CarouselPrevious className="static translate-y-0" />
          <span className="num min-w-16 text-center text-sm text-muted-foreground" aria-live="polite">
            {current} / {items.length}
          </span>
          <CarouselNext className="static translate-y-0" />
        </div>
      </Carousel>
      <p className="text-center text-xs text-muted-foreground">
        Testimonials reflect individual members&apos; experiences. Results are not typical and do not guarantee future
        results.
      </p>
    </div>
  )
}
