"use client";

import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./ui/card.js";
import { Badge } from "./ui/badge.js";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-lg border-dashed">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <Badge variant="secondary" className="mb-4">
            Coming Soon
          </Badge>
          <h2 className="mb-2 text-2xl font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mb-6 max-w-sm text-muted-foreground">{description}</p>
          <p className="text-sm text-muted-foreground">
            Want to help build this?{" "}
            <a
              href="https://github.com/blazity/mdcms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Contribute on GitHub
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
