import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "h-9 w-full rounded-sm border border-line bg-surface-raised px-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-hover ease-out placeholder:text-ink-muted hover:border-line-strong focus-visible:border-[1.5px] focus-visible:border-accent focus-visible:shadow-focus disabled:border-line-subtle disabled:bg-surface-sunken disabled:text-line-strong aria-invalid:border-error",
        className
      )}
      {...props}
    />
  )
}

export { Input }
