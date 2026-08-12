import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-[104px] w-full resize-y rounded-sm border border-line bg-surface-raised px-2.5 py-2 text-sm leading-normal text-ink outline-none transition-[border-color,box-shadow] duration-hover ease-out placeholder:text-ink-muted hover:border-line-strong focus-visible:border-[1.5px] focus-visible:border-accent focus-visible:shadow-focus disabled:border-line-subtle disabled:bg-surface-sunken disabled:text-line-strong aria-invalid:border-error",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
