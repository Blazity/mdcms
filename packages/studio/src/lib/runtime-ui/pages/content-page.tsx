"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { StudioMountContext } from "@mdcms/shared";

import {
  createStudioContentOverviewLoadingState,
  loadStudioContentOverviewState,
  type LoadStudioContentOverviewStateInput,
  type StudioContentOverviewEntry,
  type StudioContentOverviewState,
} from "../../content-overview-state.js";
import { useStudioMountInfo } from "../app/admin/mount-info-context.js";
import Link from "../adapters/next-link.js";
import { ChevronRight, FileText, Globe, GlobeOff } from "lucide-react";
import { resolveStudioHref, useBasePath } from "../navigation.js";
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
} from "../components/layout/page-header.js";
import { Badge } from "../components/ui/badge.js";
import { Card, CardContent } from "../components/ui/card.js";

type ContentPageLoadInput = LoadStudioContentOverviewStateInput;

function findMetricValue(
  entry: StudioContentOverviewEntry,
  metricId: StudioContentOverviewEntry["metrics"][number]["id"],
): number | undefined {
  return entry.metrics.find((metric) => metric.id === metricId)?.value;
}

function renderCard(
  entry: StudioContentOverviewEntry,
  basePath: string,
): ReactNode {
  const totalCount = findMetricValue(entry, "documents");
  const publishedCount = findMetricValue(entry, "published");
  const draftCount = findMetricValue(entry, "withDrafts");
  const card = (
    <Card
      data-mdcms-content-card-type={entry.type}
      data-mdcms-content-card-disabled={entry.canNavigate ? "false" : "true"}
      className="h-full border-border py-0 transition-all hover:border-accent/50 hover:shadow-sm"
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <FileText className="h-6 w-6 text-accent" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{entry.type}</h2>
              {entry.canNavigate ? (
                <ChevronRight className="h-4 w-4 text-foreground-muted" />
              ) : null}
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {entry.directory}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {entry.metrics.length > 0 ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {totalCount !== undefined ? (
                <span
                  data-mdcms-content-metric="documents"
                  className="text-muted-foreground"
                >
                  <span className="font-medium text-foreground">
                    {totalCount}
                  </span>{" "}
                  total
                </span>
              ) : null}
              {publishedCount !== undefined ? (
                <span
                  data-mdcms-content-metric="published"
                  className="text-muted-foreground"
                >
                  <span className="font-medium text-success">
                    {publishedCount}
                  </span>{" "}
                  published
                </span>
              ) : null}
              {draftCount !== undefined ? (
                <span
                  data-mdcms-content-metric="withDrafts"
                  className="text-muted-foreground"
                >
                  <span className="font-medium text-warning">{draftCount}</span>{" "}
                  drafts
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Counts unavailable for your current permissions.
            </p>
          )}

          {entry.localized ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                Localized
              </Badge>
              {entry.locales?.length ? (
                <span className="text-xs text-muted-foreground">
                  {entry.locales.join(", ")}
                </span>
              ) : null}
            </div>
          ) : (
            <Badge variant="outline" className="gap-1">
              <GlobeOff className="h-3 w-3" />
              Single locale
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!entry.canNavigate) {
    return <div key={entry.type}>{card}</div>;
  }

  return (
    <Link
      key={entry.type}
      href={resolveStudioHref(basePath, `/content/${entry.type}`)}
    >
      {card}
    </Link>
  );
}

function renderCardGrid(
  entries: StudioContentOverviewEntry[],
  basePath: string,
) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => renderCard(entry, basePath))}
    </div>
  );
}

export function createContentPageLoadInput(
  context: StudioMountContext,
): ContentPageLoadInput | null {
  const route = context.documentRoute;

  if (!route) {
    return null;
  }

  return {
    config: {
      project: route.project,
      environment: route.environment,
      serverUrl: context.apiBaseUrl,
      supportedLocales: route.supportedLocales,
    },
    auth: context.auth,
  };
}

function createContentPageMissingRouteState(): StudioContentOverviewState {
  return {
    status: "error",
    project: "unknown",
    environment: "unknown",
    message: "Content overview requires an active project and environment.",
  };
}

export function ContentPageView({
  state,
}: {
  state: StudioContentOverviewState;
}) {
  const basePath = useBasePath();

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Content" }]} />

      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <PageHeaderHeading>Content</PageHeaderHeading>
          <PageHeaderDescription>
            Browse and manage your content by type
          </PageHeaderDescription>
        </div>

        {state.status === "loading" ? (
          <div
            data-mdcms-content-page-state="loading"
            className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
          >
            {state.message}
          </div>
        ) : state.status === "forbidden" ? (
          <section
            data-mdcms-content-page-state="forbidden"
            className="space-y-3 rounded-lg border border-dashed p-6"
          >
            <Badge variant="secondary">Forbidden</Badge>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">
              {state.project} / {state.environment}
            </p>
          </section>
        ) : state.status === "error" ? (
          <section
            data-mdcms-content-page-state="error"
            className="space-y-3 rounded-lg border border-dashed p-6"
          >
            <Badge variant="destructive">Error</Badge>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">
              {state.project} / {state.environment}
            </p>
          </section>
        ) : state.entries.length === 0 ? (
          <section
            data-mdcms-content-page-state="empty"
            className="space-y-3 rounded-lg border border-dashed p-6"
          >
            <Badge variant="outline">Empty</Badge>
            <p className="text-sm text-muted-foreground">
              No schema types were returned for this project and environment.
            </p>
            <p className="text-xs text-muted-foreground">
              {state.project} / {state.environment}
            </p>
          </section>
        ) : state.status === "permission-constrained" ? (
          <div
            data-mdcms-content-page-state="permission-constrained"
            className="space-y-4"
          >
            <section className="space-y-2 rounded-lg border border-dashed p-4">
              <Badge variant="outline">Limited access</Badge>
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </section>
            {renderCardGrid(state.entries, basePath)}
          </div>
        ) : (
          <div data-mdcms-content-page-state="ready" className="space-y-4">
            {renderCardGrid(state.entries, basePath)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContentPage({
  context,
  loadState = loadStudioContentOverviewState,
}: {
  context: StudioMountContext;
  loadState?: typeof loadStudioContentOverviewState;
}) {
  const mountInfo = useStudioMountInfo();
  const [state, setState] = useState<StudioContentOverviewState>(() =>
    createStudioContentOverviewLoadingState(),
  );

  useEffect(() => {
    if (!mountInfo.project || !mountInfo.environment) {
      setState(createContentPageMissingRouteState());
      return;
    }

    const loadInput: ContentPageLoadInput = {
      config: {
        project: mountInfo.project,
        environment: mountInfo.environment,
        serverUrl: mountInfo.apiBaseUrl,
        supportedLocales: mountInfo.supportedLocales,
      },
      auth: mountInfo.auth,
    };

    let active = true;
    setState(createStudioContentOverviewLoadingState());

    void loadState(loadInput)
      .then((nextState) => {
        if (active) {
          setState(nextState);
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setState({
          status: "error",
          project: loadInput.config.project,
          environment: loadInput.config.environment,
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Failed to load content overview.",
        });
      });

    return () => {
      active = false;
    };
  }, [
    mountInfo.apiBaseUrl,
    mountInfo.auth,
    mountInfo.environment,
    mountInfo.project,
    mountInfo.supportedLocales,
    loadState,
  ]);

  return <ContentPageView state={state} />;
}
