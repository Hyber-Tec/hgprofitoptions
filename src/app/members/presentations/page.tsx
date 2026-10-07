import type { Metadata } from "next"
import { LuDownload, LuPresentation, LuVideo } from "react-icons/lu"
import { formatDateWithWeekday } from "@/core/format"
import { requireActiveMember } from "@/lib/auth/guards"
import { listPresentations } from "@/lib/data/content"
import { PageHeader } from "@/components/portal/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Presentations" }

export default async function PresentationsPage() {
  await requireActiveMember("/members/presentations")
  const presentations = await listPresentations()
  return (
    <>
      <PageHeader
        title="Presentations"
        description="Slides and recordings from the Saturday classes, newest first. Downloads carry your name."
      />
      {presentations.length === 0 ? (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuPresentation />
            </EmptyMedia>
            <EmptyTitle>No presentations yet</EmptyTitle>
            <EmptyDescription>Slides from each class are posted here after the session.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {presentations.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardDescription>{formatDateWithWeekday(p.sessionDate)}</CardDescription>
                <CardTitle>{p.title}</CardTitle>
              </CardHeader>
              {p.summary && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{p.summary}</p>
                </CardContent>
              )}
              <CardFooter className="mt-auto flex flex-wrap gap-2 border-t pt-4">
                {p.slidesPath && (
                  <>
                    <Button
                      size="sm"
                      render={<a href={`/members/presentations/${p.id}/slides`} target="_blank" rel="noopener" />}
                      nativeButton={false}
                    >
                      <LuPresentation />
                      View slides
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      render={<a href={`/members/presentations/${p.id}/slides?download=1`} />}
                      nativeButton={false}
                    >
                      <LuDownload />
                      Download
                    </Button>
                  </>
                )}
                {p.videoUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    render={<a href={p.videoUrl} target="_blank" rel="noopener noreferrer" />}
                    nativeButton={false}
                  >
                    <LuVideo />
                    Recording
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
