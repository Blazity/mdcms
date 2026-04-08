"use client";

import { useState, useEffect } from "react";
import Link from "../../adapters/next-link.js";
import {
  FileText,
  CheckCircle,
  Edit3,
  Plus,
  ChevronRight,
  Clock,
  Loader2,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { Badge } from "../../components/ui/badge.js";
import { PageHeader } from "../../components/layout/page-header.js";
import { useStudioSession } from "./session-context.js";
import { useStudioMountInfo } from "./mount-info-context.js";
import { useAdminCapabilities } from "./capabilities-context.js";
import { createStudioSchemaRouteApi } from "../../../schema-route-api.js";
import { createStudioContentListApi } from "../../../content-list-api.js";
import { createStudioContentOverviewApi } from "../../../content-overview-api.js";
import {
  loadDashboardData,
  type DashboardLoadResult,
} from "../../../dashboard-data.js";

type DashboardState = { status: "loading" } | DashboardLoadResult;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deriveUserLabel(email: string): string {
  const local = (email || "").split("@")[0];
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function DashboardPage() {
  const session = useStudioSession();
  const mountInfo = useStudioMountInfo();
  const { canCreateContent } = useAdminCapabilities();
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  useEffect(() => {
    const { project, environment, apiBaseUrl, auth } = mountInfo;

    if (!project || !environment || !apiBaseUrl) {
      setState({ status: "loading" });
      return;
    }

    setState({ status: "loading" });

    let cancelled = false;
    const config = { project, environment, serverUrl: apiBaseUrl };
    const authOpts = { auth };

    const schemaApi = createStudioSchemaRouteApi(config, authOpts);
    const contentApi = createStudioContentListApi(config, authOpts);
    const overviewApi = createStudioContentOverviewApi(config, authOpts);

    loadDashboardData(schemaApi, contentApi, overviewApi)
      .then((result) => {
        if (!cancelled) {
          setState(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error
                ? err.message
                : "Failed to load dashboard data.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    mountInfo.project,
    mountInfo.environment,
    mountInfo.apiBaseUrl,
    mountInfo.auth,
  ]);

  const userLabel =
    session.status === "authenticated"
      ? deriveUserLabel(session.session.email)
      : null;

  if (state.status === "loading") {
    return (
      <div className="min-h-screen">
        <PageHeader breadcrumbs={[{ label: "Dashboard" }]} />
        <div className="flex items-center justify-center p-24">
          <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
        </div>
      </div>
    );
  }

  if (state.status === "forbidden") {
    return (
      <div className="min-h-screen">
        <PageHeader breadcrumbs={[{ label: "Dashboard" }]} />
        <div className="flex flex-col items-center justify-center gap-3 p-24 text-center">
          <ShieldAlert className="h-8 w-8 text-foreground-muted" />
          <h2 className="text-lg font-semibold">Access denied</h2>
          <p className="text-sm text-foreground-muted max-w-md">
            You do not have permission to view this dashboard. Contact an
            administrator for access.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="min-h-screen">
        <PageHeader breadcrumbs={[{ label: "Dashboard" }]} />
        <div className="flex flex-col items-center justify-center gap-3 p-24 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-foreground-muted max-w-md">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  const { data } = state;

  const statCards = [
    {
      label: "Documents",
      value: data.totalDocuments,
      icon: FileText,
      detail:
        data.totalContentTypes > 0
          ? `${data.totalContentTypes} content type${data.totalContentTypes !== 1 ? "s" : ""}`
          : undefined,
    },
    {
      label: "Published",
      value: data.publishedDocuments,
      icon: CheckCircle,
      detail:
        data.totalDocuments > 0
          ? `${Math.round((data.publishedDocuments / data.totalDocuments) * 100)}% of total`
          : undefined,
    },
    {
      label: "Drafts",
      value: data.draftDocuments,
      icon: Edit3,
      detail: "Unpublished documents",
    },
  ];

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Dashboard" }]} />

      <div className="p-6 space-y-6">
        {/* Page Title */}
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          {userLabel && (
            <p className="text-sm text-foreground-muted">
              Welcome back, {userLabel}
            </p>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid gap-4 md:grid-cols-3">
          {statCards.map((stat) => (
            <Card key={stat.label} className="border-border py-0 gap-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-foreground-muted">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold">{stat.value}</p>
                    {stat.detail && (
                      <p className="text-xs text-foreground-muted">
                        {stat.detail}
                      </p>
                    )}
                  </div>
                  <div className="rounded-md bg-accent/10 p-2">
                    <stat.icon className="h-5 w-5 text-accent" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        {canCreateContent && (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="default"
              asChild
              className="bg-accent hover:bg-accent-hover text-white"
            >
              <Link href="/admin/content">
                <Plus className="mr-2 h-4 w-4" />
                New Document
              </Link>
            </Button>
          </div>
        )}

        {/* Content Types & Recent Documents */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Content Types */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg font-semibold">
                Content Types
              </CardTitle>
              <Link
                href="/admin/content"
                className="text-sm text-foreground-muted hover:text-accent flex items-center gap-1"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.contentTypes.length === 0 ? (
                <p className="text-sm text-foreground-muted py-4 text-center">
                  No schema types synced yet.
                </p>
              ) : (
                data.contentTypes.map((ct) => {
                  const publishedRatio =
                    ct.totalCount > 0
                      ? (ct.publishedCount / ct.totalCount) * 100
                      : 0;
                  return (
                    <Link
                      key={ct.type}
                      href={`/admin/content/${ct.type}`}
                      className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-background-subtle"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10">
                        <FileText className="h-5 w-5 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{ct.type}</p>
                          {ct.localized && (
                            <Badge variant="outline" className="text-xs">
                              Localized
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground-muted truncate">
                          {ct.totalCount} document
                          {ct.totalCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      {ct.totalCount > 0 && (
                        <div className="w-24">
                          <div className="flex h-2 overflow-hidden rounded-full bg-border">
                            <div
                              className="bg-success transition-all"
                              style={{ width: `${publishedRatio}%` }}
                            />
                            <div
                              className="bg-warning"
                              style={{ width: `${100 - publishedRatio}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-foreground-muted text-right">
                            {ct.publishedCount}/{ct.totalCount}
                          </p>
                        </div>
                      )}
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Recently Updated */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg font-semibold">
                Recently Updated
              </CardTitle>
              <Link
                href="/admin/content"
                className="text-sm text-foreground-muted hover:text-accent flex items-center gap-1"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {data.recentDocuments.length === 0 ? (
                <p className="text-sm text-foreground-muted py-4 text-center">
                  No documents yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {data.recentDocuments.map((doc) => (
                    <div
                      key={doc.documentId}
                      className="flex items-start gap-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10">
                        <FileText className="h-4 w-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0 text-sm">
                        <p className="font-medium truncate">
                          {doc.frontmatter.title
                            ? String(doc.frontmatter.title)
                            : doc.path}
                        </p>
                        <p className="text-foreground-muted truncate">
                          <span>{doc.type}</span>
                          {doc.hasUnpublishedChanges && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-xs text-warning"
                            >
                              Draft
                            </Badge>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-foreground-muted flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(doc.updatedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
