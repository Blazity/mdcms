// @ts-nocheck
"use client";

import { cn } from "../lib/utils";

interface MDCMSLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function MDCMSLogo({ collapsed = false, className }: MDCMSLogoProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="text-xl font-bold tracking-tight text-foreground">
        {collapsed ? "m" : "mdcms"}
      </span>
      <span className="h-2 w-2 rounded-full bg-accent" />
    </div>
  );
}
