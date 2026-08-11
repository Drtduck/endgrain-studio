import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Состояния кнопок из README, в токены не вынесены: #C7D8D5 (disabled primary),
// #8C2820/#731F19 (destructive hover/active), rgba(20,97,90,0.28) и rgba(166,51,40,0.24)
// (фокус-обводки primary/destructive).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-clip-padding px-4 text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-hover ease-out outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-fg shadow-sm hover:bg-accent-hover hover:shadow-md active:bg-accent-active active:shadow-none focus-visible:shadow-[0_0_0_3px_rgba(20,97,90,0.28)] disabled:bg-[#C7D8D5] disabled:text-accent-fg",
        outline:
          "bg-surface border-line shadow-sm hover:bg-app hover:border-line-strong active:bg-surface-sunken focus-visible:border-accent focus-visible:shadow-focus disabled:bg-surface-panel disabled:text-line-strong",
        ghost:
          "bg-transparent text-ink-secondary hover:bg-app hover:text-ink active:bg-surface-sunken focus-visible:border-accent focus-visible:shadow-focus disabled:text-line-strong",
        destructive:
          "bg-error text-ink-inverse hover:bg-[#8C2820] active:bg-[#731F19] focus-visible:shadow-[0_0_0_3px_rgba(166,51,40,0.24)] disabled:bg-error-border",
      },
      size: {
        default: "h-9 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        sm: "h-[30px] px-4 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        icon: "size-8 px-0",
        "icon-sm": "size-7 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
