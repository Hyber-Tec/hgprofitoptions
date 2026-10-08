import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Eyebrow } from "@/components/site/section"
import { LEGAL } from "@/content/legal"

type Slug = keyof typeof LEGAL

function isSlug(value: string): value is Slug {
  return value in LEGAL
}

export function generateStaticParams() {
  return Object.keys(LEGAL).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params
  if (!isSlug(slug)) return {}
  return { title: LEGAL[slug].title, description: LEGAL[slug].description }
}

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params
  if (!isSlug(slug)) notFound()
  const doc = LEGAL[slug]
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <header className="mb-10 flex flex-col gap-3 border-b pb-8">
        <Eyebrow className="w-fit">Legal</Eyebrow>
        <h1 className="text-4xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {doc.updated}</p>
      </header>
      <div className="flex flex-col gap-8">
        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.paragraphs.map((p) => (
              <p key={p} className="leading-relaxed text-pretty text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  )
}
