"use client";

import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getHelp, type HelpId } from "@/lib/help";
import { t } from "@/lib/i18n";
import { useStudio } from "@/lib/store/studio";
import { cn } from "@/lib/utils";

export function HelpHint({
  id,
  side = "top",
  className,
}: {
  id: HelpId;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  const locale = useStudio((s) => s.locale);
  const entry = getHelp(id);
  if (!entry) return null;

  const title = t(locale, entry.titleKey);

  return (
    <Popover>
      <PopoverTrigger
        data-testid={`help-${id}`}
        aria-label={t(locale, "help.aria", { title })}
        className={cn("size-4 shrink-0 text-ink-muted hover:text-ink", className)}
      >
        <CircleHelp className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent side={side} data-testid={`help-content-${id}`} className="flex flex-col gap-1.5">
        <p className="font-display text-sm font-semibold text-ink">{title}</p>
        <p className="text-sm leading-normal text-ink-secondary">{t(locale, entry.bodyKey)}</p>
      </PopoverContent>
    </Popover>
  );
}
