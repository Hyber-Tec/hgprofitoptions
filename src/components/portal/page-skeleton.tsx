import type { ReactNode } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * The loading state of a portal page, shown by loading.tsx the moment a link is clicked while the
 * page renders on the server. The header keeps PageHeader's line heights, so nothing moves when the
 * page arrives.
 */
export function PageSkeleton({ title, nav }: { title?: string; nav?: ReactNode }) {
  return (
    <>
      <span role="status" className="sr-only">
        Loading
      </span>
      <PageHeaderSkeleton title={title} />
      {nav}
      <CardSkeleton lines={6} />
    </>
  )
}

/** PageHeader's title and description lines. A known title is shown as is. */
export function PageHeaderSkeleton({ title }: { title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {title ? (
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      ) : (
        <div className="flex h-8 items-center">
          <Skeleton className="h-6 w-56 max-w-full" />
        </div>
      )}
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
    </div>
  )
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}
