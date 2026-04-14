import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-muted text-foreground",
        white:
          "bg-card text-foreground",
        grey:
          "bg-neutral-grey text-foreground",
        "light-blue":
          "bg-light-blue text-primary",
        accent:
          "bg-vibrant-green text-foreground text-tag-2 rounded-sm px-4 py-2",
        destructive:
          "bg-destructive/10 text-destructive",
        outline:
          "border-border text-foreground [a&]:hover:bg-muted",
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
