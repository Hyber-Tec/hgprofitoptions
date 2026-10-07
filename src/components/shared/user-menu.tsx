"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { LuLayoutDashboard, LuLogOut, LuSettings, LuShield } from "react-icons/lu"
import { signOut } from "@/lib/auth/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?"
}

export function UserMenu({
  viewer,
  compact = false,
}: {
  viewer: { fullName: string; email: string; role: "admin" | "member" }
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const handleSignOut = () => {
    startTransition(async () => {
      await signOut()
      router.replace("/")
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={compact ? "size-8 rounded-full p-0" : "gap-2 px-1.5"}
            aria-label="Account menu"
          />
        }
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">{initials(viewer.fullName)}</AvatarFallback>
        </Avatar>
        {!compact && (
          <span className="hidden max-w-32 truncate text-sm lg:inline">{viewer.fullName.split(" ")[0]}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate font-medium text-foreground">{viewer.fullName}</span>
            <span className="truncate text-xs font-normal">{viewer.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/members" />}>
            <LuLayoutDashboard />
            Member area
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/members/settings" />}>
            <LuSettings />
            Settings
          </DropdownMenuItem>
          {viewer.role === "admin" && (
            <DropdownMenuItem render={<Link href="/admin" />}>
              <LuShield />
              Admin
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} disabled={pending}>
          <LuLogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
