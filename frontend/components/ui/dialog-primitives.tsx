"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { useDialogContext } from "./dialog-context"

export function DialogPortal({ children }: { children: React.ReactNode }) {
  const { open } = useDialogContext()

  if (!open || typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div data-slot="dialog-portal">{children}</div>,
    document.body
  )
}

export function DialogClose({
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { setOpen } = useDialogContext()

  return (
    <Button
      {...props}
      data-slot="dialog-close"
      onClick={(event) => {
        onClick?.(event)

        if (!event.defaultPrevented) {
          setOpen(false)
        }
      }}
    />
  )
}

export function DialogOverlay({
  className,
  onMouseDown,
  ...props
}: React.ComponentProps<"div">) {
  const { setOpen } = useDialogContext()

  return (
    <div
      {...props}
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      role="presentation"
      onMouseDown={(event) => {
        onMouseDown?.(event)

        if (!event.defaultPrevented && event.target === event.currentTarget) {
          setOpen(false)
        }
      }}
    />
  )
}

