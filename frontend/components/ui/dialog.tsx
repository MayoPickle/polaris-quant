"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { useI18n } from "@/lib/i18n/client"

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  titleId: string
  descriptionId: string
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const context = React.useContext(DialogContext)

  if (!context) {
    throw new Error("Dialog components must be used inside <Dialog>.")
  }

  return context
}

function Dialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const generatedId = React.useId()
  const open = openProp ?? uncontrolledOpen

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setUncontrolledOpen(nextOpen)
      }

      onOpenChange?.(nextOpen)
    },
    [onOpenChange, openProp]
  )

  const contextValue = React.useMemo(
    () => ({
      open,
      setOpen,
      titleId: `${generatedId}-title`,
      descriptionId: `${generatedId}-description`,
    }),
    [generatedId, open, setOpen]
  )

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
    </DialogContext.Provider>
  )
}

function DialogTrigger({
  onClick,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  const { setOpen } = useDialogContext()

  return (
    <button
      {...props}
      data-slot="dialog-trigger"
      type={type}
      onClick={(event) => {
        onClick?.(event)

        if (!event.defaultPrevented) {
          setOpen(true)
        }
      }}
    />
  )
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  const { open } = useDialogContext()

  if (!open || typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div data-slot="dialog-portal">{children}</div>,
    document.body
  )
}

function DialogClose({
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

function DialogOverlay({
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

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const { t } = useI18n()
  const { descriptionId, open, setOpen, titleId } = useDialogContext()
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) {
      return
    }

    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = "hidden"
    contentRef.current?.focus({ preventScroll: true })

    return () => {
      document.body.style.overflow = previousOverflow

      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [open])

  React.useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        setOpen(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, setOpen])

  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        data-slot="dialog-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        ref={contentRef}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-[0_16px_48px_rgba(15,23,42,0.14)] duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        data-open=""
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose
            data-slot="dialog-close"
            variant="ghost"
            className="absolute top-2 right-2"
            size="icon-sm"
          >
            <XIcon
            />
            <span className="sr-only">{t.common.close}</span>
          </DialogClose>
        )}
      </div>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose variant="outline">
          Close
        </DialogClose>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const { titleId } = useDialogContext()

  return (
    <h2
      data-slot="dialog-title"
      id={titleId}
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  const { descriptionId } = useDialogContext()

  return (
    <p
      data-slot="dialog-description"
      id={descriptionId}
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
