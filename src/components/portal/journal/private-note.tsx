"use client"

import { onAuthStateChanged } from "firebase/auth"
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { useEffect, useState, useTransition } from "react"
import { LuLock, LuSave } from "react-icons/lu"
import { clientAuth, clientDb } from "@/lib/firebase/client"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"

/**
 * A note only the member can read. It is read and written straight from the browser; security rules
 * allow the owner only, and no admin screen or server code ever reads it.
 */
export function PrivateNote({ uid, tradeId, editable }: { uid: string; tradeId: string; editable: boolean }) {
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading")
  const [body, setBody] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    return onAuthStateChanged(clientAuth(), (user) => {
      if (user?.uid !== uid) {
        setState("unavailable")
        return
      }
      getDoc(doc(clientDb(), "members", uid, "privateNotes", tradeId))
        .then((snap) => {
          setBody(typeof snap.get("body") === "string" ? (snap.get("body") as string) : "")
          setState("ready")
        })
        .catch(() => setState("unavailable"))
    })
  }, [uid, tradeId])

  const save = () =>
    startTransition(async () => {
      try {
        const ref = doc(clientDb(), "members", uid, "privateNotes", tradeId)
        if (body.trim() === "") await deleteDoc(ref)
        else await setDoc(ref, { body, updatedAt: serverTimestamp() })
        toast.add({ title: "Private note saved", type: "success" })
      } catch {
        toast.add({ title: "Not saved", description: "Please sign in again and retry.", type: "error" })
      }
    })

  if (state === "loading") return <Spinner className="text-muted-foreground" />
  if (state === "unavailable")
    return <p className="text-sm text-muted-foreground">Private notes load after you sign in on this device.</p>
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        readOnly={!editable}
        placeholder="Only you can read this."
        aria-label="Private note"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LuLock className="size-3.5" /> Only you can see this note. HG and admins cannot.
        </span>
        {editable && (
          <Button size="sm" variant="outline" onClick={save} disabled={pending}>
            {pending ? <Spinner /> : <LuSave />}
            Save
          </Button>
        )}
      </div>
    </div>
  )
}
