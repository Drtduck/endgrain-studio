"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Тонкая обёртка над Base UI Menu, ровно в том же духе, что dialog.tsx и popover.tsx.
 * Escape, клик вне, возврат фокуса на триггер, навигация стрелками и роли
 * menu/menuitem даёт сам примитив, поэтому руками они здесь не написаны.
 */
function Menu(props: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root {...props} />
}

function MenuTrigger({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  return (
    <MenuPrimitive.Trigger
      data-slot="menu-trigger"
      className={cn(
        "inline-flex items-center justify-center rounded-md outline-none transition-colors duration-hover ease-out focus-visible:shadow-focus",
        className
      )}
      {...props}
    />
  )
}

function MenuContent({
  className,
  side = "bottom",
  sideOffset = 8,
  align = "end",
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Popup> & {
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  align?: "start" | "center" | "end"
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="z-50 outline-none"
        side={side}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            // max-w держит меню внутри экрана на 375px, где до края остаётся меньше ширины popup.
            "w-60 max-w-[calc(100vw-24px)] rounded-lg border border-line-subtle bg-surface-raised py-1 text-sm text-ink shadow-lg outline-none",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

const itemClass =
  "flex w-full cursor-default select-none items-center gap-2 px-3 py-2 text-left text-sm text-ink outline-none transition-colors duration-hover data-highlighted:bg-app data-disabled:text-line-strong [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"

function MenuItem({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return <MenuPrimitive.Item data-slot="menu-item" className={cn(itemClass, className)} {...props} />
}

function MenuLinkItem({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.LinkItem>) {
  return <MenuPrimitive.LinkItem data-slot="menu-link-item" className={cn(itemClass, className)} {...props} />
}

function MenuSeparator({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("my-1 h-px bg-line-subtle", className)}
      {...props}
    />
  )
}

export { Menu, MenuContent, MenuItem, MenuLinkItem, MenuPrimitive, MenuSeparator, MenuTrigger }
