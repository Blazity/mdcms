// @ts-nocheck
"use client";

import { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
  features?: string[];
}

export function ComingSoon({
  icon: Icon,
  title,
  description,
  features,
}: ComingSoonProps) {
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
          {features && features.length > 0 && (
            <div className="mb-6 text-left">
              <p className="mb-2 text-sm font-medium">Planned features:</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="outline" disabled>
            Notify Me When Available
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
