import { Skeleton } from "@/components/ui/skeleton"

/** The conversation pane while a thread loads; the question list stays in place. */
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <span role="status" className="sr-only">
        Loading
      </span>
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 py-5">
        <Skeleton className="h-16 w-3/4 rounded-2xl" />
        <Skeleton className="h-12 w-2/3 self-end rounded-2xl" />
        <Skeleton className="h-20 w-3/4 rounded-2xl" />
      </div>
    </div>
  )
}
