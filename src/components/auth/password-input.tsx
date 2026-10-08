"use client"

import { useState, type ComponentProps } from "react"
import { LuEye, LuEyeOff } from "react-icons/lu"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"

export function PasswordInput(props: Omit<ComponentProps<typeof InputGroupInput>, "type">) {
  const [visible, setVisible] = useState(false)
  return (
    <InputGroup>
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <LuEyeOff /> : <LuEye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
