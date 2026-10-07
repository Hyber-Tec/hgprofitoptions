import Link from "next/link"
import { LogoMark } from "@/components/site/logo"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <LogoMark className="size-12 text-muted-foreground" />
      <div className="flex flex-col gap-2">
        <p className="num text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="text-muted-foreground">The link may be old, or the page may have moved.</p>
      </div>
      <Button render={<Link href="/" />} nativeButton={false}>
        Back to the home page
      </Button>
    </main>
  )
}
