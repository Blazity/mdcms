"use client";

import Link from "../../../adapters/next-link.js";
import {
  FileText,
  File,
  User,
  Tag,
  Package,
  Globe,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "../../../components/ui/card.js";
import { Badge } from "../../../components/ui/badge.js";
import { PageHeader } from "../../../components/layout/page-header.js";
import { mockContentTypes } from "../../../lib/mock-data.js";

const iconMap: Record<string, React.ElementType> = {
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

      <div className="p-6 space-y-6">
        {/* Page Title */}
        <div>
          <h1 className="text-2xl font-semibold">Content</h1>
          <p className="text-sm text-foreground-muted">
            Browse and manage your content by type
          </p>
        </div>

        {/* Content Type Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockContentTypes.map((type) => {
            const IconComponent = iconMap[type.icon] || FileText;
            return (
              <Link key={type.id} href={`/admin/content/${type.id}`}>
                <Card className="border-border h-full py-0 transition-all hover:border-accent/50 hover:shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <IconComponent className="h-6 w-6 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{type.name}</h3>
                          <ChevronRight className="h-4 w-4 text-foreground-muted" />
                        </div>
                        <p className="text-sm text-foreground-muted line-clamp-2">
                          {type.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      {/* Stats */}
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

                      {/* Localization */}
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
