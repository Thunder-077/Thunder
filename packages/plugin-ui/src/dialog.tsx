import { XIcon } from "lucide-react"
import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react"
import { Button } from "./button"
import { cn } from "./utils"

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error("Dialog components must be used inside Dialog")
  }
  return context
}

type TriggerElement = ReactElement<{ onClick?: MouseEventHandler }>

export function Dialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen

  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
  }

  return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>
}

export function DialogTrigger({ render, children }: { render?: TriggerElement; children?: ReactNode }) {
  const { setOpen } = useDialogContext()

  if (render) {
    return cloneElement(render, {
      onClick: (event: MouseEvent) => {
        render.props.onClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(true)
        }
      },
    })
  }

  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  )
}

export function DialogPortal({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function DialogOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { setOpen } = useDialogContext()
  return (
    <div
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-[var(--z-modal)] bg-foreground/10", className)}
      onClick={() => setOpen(false)}
      {...props}
    />
  )
}

export function DialogContent({
  className,
  children,
  hideClose = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  hideClose?: boolean
}) {
  const { open, setOpen } = useDialogContext()

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, setOpen])

  if (!open) return null

  return (
    <>
      <DialogOverlay />
      <div
        data-slot="dialog-content"
        className={cn(
          "fixed left-1/2 top-1/2 z-[calc(var(--z-modal)+1)] grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[20px] border border-border/70 bg-popover p-5 text-sm text-popover-foreground shadow-xl outline-none sm:max-w-sm",
          className
        )}
        onClick={(event) => event.stopPropagation()}
        {...props}
      >
        {children}
        {!hideClose && (
          <Button
            variant="ghost"
            className="absolute right-2 top-2"
            size="icon-sm"
            onClick={() => setOpen(false)}
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </>
  )
}

export function DialogClose({ render, children }: { render?: TriggerElement; children?: ReactNode }) {
  const { setOpen } = useDialogContext()

  if (render) {
    return cloneElement(render, {
      onClick: (event: MouseEvent) => {
        render.props.onClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(false)
        }
      },
    })
  }

  return (
    <button type="button" onClick={() => setOpen(false)}>
      {children}
    </button>
  )
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-2.5", className)} {...props} />
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="dialog-title" className={cn("font-heading text-base font-medium leading-none", className)} {...props} />
  )
}

export function DialogDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}
