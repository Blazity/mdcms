// @ts-nocheck
"use client";

import type { ElementType } from "react";

import Link from "../adapters/next-link";
import {
  ChevronRight,
  File,
  FileText,
  Globe,
  Package,
  Tag,
  User,
} from "lucide-react";
import { PageHeader } from "../components/layout/page-header";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { mockContentTypes } from "../lib/mock-data";

const iconMap: Record<string, ElementType> = {
  FileText,
  File,
  User,
  Tag,
  Package,
};

export default function ContentPage() {
  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Content" }]} />

      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Content</h1>
          <p className="text-sm text-foreground-muted">
            Browse and manage your content by type
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockContentTypes.map((type) => {
            const IconComponent = iconMap[type.icon] || FileText;

            return (
              <Link key={type.id} href={`/admin/content/${type.id}`}>
                <Card className="h-full border-border transition-all hover:border-accent/50 hover:shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <IconComponent className="h-6 w-6 text-accent" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">{type.name}</h3>
                          <ChevronRight className="h-4 w-4 text-foreground-muted" />
                        </div>
                        <p className="line-clamp-2 text-sm text-foreground-muted">
                          {type.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-foreground-muted">
                          <span className="font-medium text-foreground">
                            {type.documentCount}
                          </span>{" "}
                          total
                        </span>
                        <span className="text-foreground-muted">
                          <span className="font-medium text-success">
                            {type.publishedCount}
                          </span>{" "}
                          published
                        </span>
                        <span className="text-foreground-muted">
                          <span className="font-medium text-warning">
                            {type.draftCount}
                          </span>{" "}
                          drafts
                        </span>
                      </div>

                      {type.localized ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-1">
                            <Globe className="h-3 w-3" />
                            Localized
                          </Badge>
                          <span className="text-xs text-foreground-muted">
                            {type.locales?.join(", ")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-foreground-muted">
                          Single locale
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
