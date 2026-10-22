import type { Metadata } from "next"
import Image from "next/image"
import type { IconType } from "react-icons"
import { LuChartLine, LuLayers, LuTarget, LuTrophy } from "react-icons/lu"
import { CtaBand } from "@/components/site/home/cta"
import { Eyebrow } from "@/components/site/section"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "About HG",
  description:
    "Hubert Gaffney (HG) is an entrepreneur, market strategist and full-time options trader, and the founder of HG Profit Options.",
}

const FACTS = [
  "Entrepreneur since 1999",
  "Stakes-winning thoroughbred trainer, 2003 to 2021",
  "Full-time options trader since 2016",
  "Founded HG Profit Options in 2023",
  "Top 100 NHC handicapper",
]

type Photo = { src: string; alt: string; width: number; height: number }

const TIMELINE: {
  period: string
  title: string
  body: string
  image?: Photo
  Icon: IconType
}[] = [
  {
    period: "2003 to 2021",
    title: "Early career",
    body: "HG was a stakes-winning thoroughbred trainer, earning over $2 million in purse winnings and establishing a reputation for precision, discipline, and competitive excellence. His ability to analyze patterns, manage risk, and execute under pressure seamlessly transitioned into the world of trading.",
    image: {
      src: "/media/about/hg-racing.webp",
      alt: "Waiting for a Star, a horse HG trained, winning at Tampa Bay Downs in 2021",
      width: 840,
      height: 708,
    },
    Icon: LuTrophy,
  },
  {
    period: "2016",
    title: "Transition to trading",
    body: "HG became a full-time professional trader, specializing in options and strategic equities. His analytical approach and deep market insight quickly positioned him as a trusted educator in the trading community. He is known for breaking down complex concepts into actionable strategies that empower traders at every level.",
    Icon: LuChartLine,
  },
  {
    period: "2023",
    title: "HG Profit Options",
    body: "HG launched HG Profit Options, a comprehensive trading platform designed to demystify the markets and deliver results. It focuses on all facets of trading, with a core emphasis on options, and identifies strategic and future stocks that, as they perform, funnel into lucrative opportunities within the options space.",
    Icon: LuLayers,
  },
  {
    period: "Today",
    title: "Recognitions",
    body: "Outside of trading, HG is a top-ranked thoroughbred handicapper, competing annually in Las Vegas for the coveted title of NHC (National Horseplayers Championship) champion. He is ranked among the top 100 handicappers worldwide, a testament to his sharp analytical skills and competitive drive.",
    image: { src: "/media/about/hg-trophy.webp", alt: "A championship trophy won by HG", width: 672, height: 896 },
    Icon: LuTarget,
  },
]

// Timeline photos keep their own shape, so nothing in them is cut off. Each covers the area of a
// 256 px square, which gives a wide photo and a tall one the same weight on the page.
function photoWidth({ width, height }: Photo) {
  return Math.round(256 * Math.sqrt(width / height))
}

export default function AboutPage() {
  return (
    <>
      <section className="border-b">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 *:min-w-0 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="relative mx-auto w-full max-w-sm">
            <div className="overflow-hidden rounded-2xl border bg-muted shadow-sm">
              <Image
                src="/media/about/hg-portrait.webp"
                alt="Hubert Gaffney (HG) with one of his horses"
                width={960}
                height={1200}
                preload
                className="aspect-[4/5] h-auto w-full object-cover"
              />
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <Eyebrow className="w-fit">About HG</Eyebrow>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Hubert Gaffney</h1>
              <p className="text-lg text-muted-foreground">Founder of HG Profit Options</p>
            </div>
            <p className="text-base leading-relaxed text-pretty sm:text-lg">
              HG is a seasoned entrepreneur and market strategist with over two decades of entrepreneurial success and
              more than 10 years of trading experience. Since 1999, he has carved out a dynamic career path that spans
              high-performance sports and high-stakes finance.
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Quick facts">
              {FACTS.map((fact) => (
                <li key={fact}>
                  <Badge variant="outline" className="h-7 rounded-full px-3 font-normal">
                    {fact}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-3xl font-semibold tracking-tight sm:text-4xl">The journey</h2>
          <ol className="relative flex flex-col gap-12 before:absolute before:top-2 before:bottom-2 before:left-[19px] before:w-px before:bg-border">
            {TIMELINE.map(({ period, title, body, image, Icon }) => (
              <li key={title} className="relative grid gap-6 pl-14 md:grid-cols-[1fr_auto] md:items-start">
                <span className="absolute top-0 left-0 inline-flex size-10 items-center justify-center rounded-full border bg-background">
                  <Icon className="size-4" />
                </span>
                <div className="flex flex-col gap-2">
                  <p className="num text-sm text-muted-foreground">{period}</p>
                  <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="leading-relaxed text-pretty text-muted-foreground">{body}</p>
                </div>
                {image && (
                  <div
                    className="max-w-full overflow-hidden rounded-xl border bg-muted"
                    style={{ width: photoWidth(image) }}
                  >
                    <Image
                      src={image.src}
                      alt={image.alt}
                      width={image.width}
                      height={image.height}
                      sizes={`${photoWidth(image)}px`}
                      className="h-auto w-full"
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y bg-muted/30 py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 *:min-w-0 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Personal life</h2>
            <p className="text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
              HG is deeply committed to his family and takes immense pride in being a life partner to his beloved Sheri,
              with whom he has shared his life since October 2013. Together they are raising their daughter, Gianna. His
              dedication to her future fuels his passion for building sustainable success and sharing knowledge with
              others.
            </p>
          </div>
          <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border bg-muted">
            <Image
              src="/media/about/hg-family.webp"
              alt="HG's daughter with one of the family's horses"
              width={960}
              height={1200}
              className="aspect-[4/5] h-auto w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <figure className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 text-center sm:px-6">
          <Eyebrow>Mission</Eyebrow>
          <blockquote className="text-2xl leading-snug font-medium tracking-tight text-balance sm:text-3xl">
            &ldquo;To help traders navigate the markets with clarity, confidence, and consistency.&rdquo;
          </blockquote>
          <figcaption className="max-w-2xl leading-relaxed text-pretty text-muted-foreground">
            Whether through mentorship, market analysis, or innovative tools, HG continues to shape the future of
            trading, one student at a time.
          </figcaption>
        </figure>
      </section>

      <CtaBand
        title="Learn directly from HG"
        lead="Book a free 15-minute call to talk about your experience and goals."
      />
    </>
  )
}
