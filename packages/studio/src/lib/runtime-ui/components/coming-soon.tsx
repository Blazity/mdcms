"use client";

import { LucideIcon } from "lucide-react";
import { Badge } from "./ui/badge.js";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: ComingSoonProps) {
  return (
    <div className="relative flex flex-col items-center justify-center py-24">
      {/* Large watermark icon */}
      <Icon className="absolute h-64 w-64 text-foreground/[0.02] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
          <Icon className="h-6 w-6 text-accent" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        <Badge
          variant="outline"
          className="mt-4 font-normal text-muted-foreground"
        >
          Coming soon
        </Badge>
        <p className="mt-6 text-xs text-muted-foreground/60">
          Want to help build this?{" "}
          <a
            href="https://github.com/blazity/mdcms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent/70 hover:text-accent hover:underline"
          >
            Contribute on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
