import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

// Segmented control built on shadcn/ui's ToggleGroup (Radix). Single-select, never empty.
type Option<T extends string> = { value: T; label: React.ReactNode; disabled?: boolean };

export function Segmented<T extends string>({ value, onChange, options, className, size = "md", "aria-label": ariaLabel }: { value: T; onChange: (v: T) => void; options: Option<T>[]; className?: string; size?: "md" | "sm"; "aria-label"?: string }) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn("inline-flex items-center rounded-full bg-muted p-1", className)}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold text-muted-foreground transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_3px_rgb(0_0_0/0.12)]",
            size === "md" ? "h-10 min-w-12 px-4 text-sm" : "h-9 px-3 text-[13px]",
          )}
        >
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
