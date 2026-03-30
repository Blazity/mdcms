// @ts-nocheck
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[var(--radius-pill)] border px-3 py-1 text-[10px] font-bold uppercase tracking-wider font-mono w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-2 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-light-grey)] text-foreground [a&]:hover:bg-[var(--color-neutral-grey)]",
        secondary:
          "border-transparent bg-[var(--color-neutral-grey)] text-foreground [a&]:hover:bg-[var(--color-neutral-grey)]/80",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground border-[var(--color-purple-grey)] [a&]:hover:bg-background-subtle",
        accent:
          "border-transparent bg-[var(--color-vibrant-green)] text-foreground rounded-[var(--radius-sm)] px-4 py-2 text-[12px]",
        blue:
          "border-transparent bg-[var(--color-light-blue)] text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
