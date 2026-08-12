"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import * as React from "react"

import { cn } from "@/lib/utils"

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger({ className, ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn(
        "inline-flex items-center justify-center rounded-sm outline-none transition-colors duration-hover ease-out focus-visible:shadow-focus",
        className
      )}
      {...props}
    />
  )
}

function PopoverContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> & {
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  align?: "start" | "center" | "end"
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} collisionPadding={12}>
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 w-80 max-w-[calc(100vw-24px)] rounded-lg border border-line-subtle bg-surface-raised p-3.5 text-sm text-ink shadow-lg outline-none",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverContent, PopoverTrigger, PopoverPrimitive }
