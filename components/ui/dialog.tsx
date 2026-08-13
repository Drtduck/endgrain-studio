"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import * as React from "react"

import { cn } from "@/lib/utils"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />
}

function DialogTrigger({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      className={cn("outline-none transition-colors duration-hover ease-out focus-visible:shadow-focus", className)}
      {...props}
    />
  )
}

/**
 * Escape, клик вне, focus-trap и возврат фокуса на триггер даёт Base UI в modal-режиме,
 * поэтому руками они здесь не написаны (в отличие от старого ForkDialog).
 */
function DialogContent({
  className,
  backdropTestId,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup> & { backdropTestId?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        data-testid={backdropTestId}
        className="fixed inset-0 z-50 bg-[var(--overlay)]"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(1100px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-auto rounded-lg border border-line bg-surface p-4 shadow-dialog outline-none",
          className
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-display text-lg font-semibold text-ink", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm leading-normal text-ink-secondary", className)}
      {...props}
    />
  )
}

function DialogClose({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      className={cn(
        "absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-md text-ink-secondary outline-none transition-colors duration-hover hover:bg-app hover:text-ink focus-visible:shadow-focus",
        className
      )}
      {...props}
    />
  )
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger, DialogPrimitive }
