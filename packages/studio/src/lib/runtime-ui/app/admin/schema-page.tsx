"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { SchemaRegistryEntry, StudioMountContext } from "@mdcms/shared";

import { useStudioMountInfo } from "./mount-info-context.js";
import {
  createStudioSchemaLoadingState,
  loadStudioSchemaState,
  type StudioSchemaState,
} from "../../../schema-state.js";
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
} from "../../components/layout/page-header.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { Badge } from "../../components/ui/badge.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.js";

type SchemaPageLoadInput = {
  config: {
    project: string;
    environment: string;
    serverUrl: string;
  };
  auth: StudioMountContext["auth"];
};

type SchemaFieldSnapshot =
  SchemaRegistryEntry["resolvedSchema"]["fields"][string];

const SCHEMA_READ_ONLY_COPY =
  "Schema definitions are managed in code and synced with cms schema sync. Studio shows the active types, fields, and validation rules for this target.";

function formatConstraintValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatCheckValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => formatConstraintValue(entry)).join(", ");
  }

  return formatConstraintValue(value);
}

function describeCheckDefinition(
  check: Record<string, unknown>,
): string | null {
  const kind = typeof check.kind === "string" ? check.kind : "rule";
  const details = Object.entries(check).filter(
    ([key, value]) => key !== "kind" && value !== undefined,
  );

  if (details.length === 0) {
    return kind;
  }

  if (details.length === 1) {
    return `${kind}: ${formatCheckValue(details[0][1])}`;
  }

  return `${kind}: ${details
    .map(([key, value]) => `${key} ${formatCheckValue(value)}`)
    .join(", ")}`;
}

function describeSchemaFieldConstraints(field: SchemaFieldSnapshot): string[] {
  const constraints: string[] = [];

  if (field.default !== undefined) {
    constraints.push(`default: ${formatConstraintValue(field.default)}`);
  }

  if (field.reference) {
    constraints.push(`reference: ${field.reference.targetType}`);
  }

  if (field.item) {
    constraints.push(`item: ${field.item.kind}`);
  }

  if (field.fields) {
    constraints.push(`fields: ${Object.keys(field.fields).join(", ")}`);
  }

  if (field.options) {
    constraints.push(
      `options: ${field.options.map((option) => formatConstraintValue(option)).join(", ")}`,
    );
  }

  if (field.checks?.length) {
    constraints.push(
      ...field.checks
        .map((check) => describeCheckDefinition(check))
        .filter((summary): summary is string => summary !== null),
    );
  }

  return constraints;
}

function renderConstraintSummary(field: SchemaFieldSnapshot): ReactNode {
  const constraints = describeSchemaFieldConstraints(field);

  if (constraints.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {constraints.map((constraint) => (
        <li key={constraint}>{constraint}</li>
      ))}
    </ul>
  );
}

/** Maps a StudioMountContext to a schema load input. Exported for tests. */
export function createSchemaPageLoadInput(
  context: StudioMountContext,
): SchemaPageLoadInput | null {
  const route = context.documentRoute;

  if (!route) {
    return null;
  }

  return {
    config: {
      project: route.project,
      environment: route.initialEnvironment,
      serverUrl: context.apiBaseUrl,
    },
    auth: context.auth,
  };
}

function createSchemaPageLoadingState(): StudioSchemaState {
  return createStudioSchemaLoadingState("Loading schema state.");
}

function createSchemaPageMissingRouteState(): StudioSchemaState {
  return {
    status: "error",
    project: "unknown",
    environment: "unknown",
    message: "Schema browser requires an active project and environment.",
  };
}

function sortEntries(entries: SchemaRegistryEntry[]): SchemaRegistryEntry[] {
  return [...entries].sort((left, right) =>
    left.type.localeCompare(right.type),
  );
}

function sortFields(fields: SchemaRegistryEntry["resolvedSchema"]["fields"]) {
  return Object.entries(fields).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function getSharedSchemaSyncSummary(entries: SchemaRegistryEntry[]): {
  schemaHash?: string;
  syncedAt?: string;
} | null {
  const firstEntry = entries[0];

  if (!firstEntry) {
    return null;
  }

  const schemaHash = firstEntry.schemaHash.trim();
  const syncedAt = firstEntry.syncedAt.trim();

  return {
    ...(schemaHash.length > 0 &&
    entries.every((entry) => entry.schemaHash === schemaHash)
      ? { schemaHash }
      : {}),
    ...(syncedAt.length > 0 &&
    entries.every((entry) => entry.syncedAt === syncedAt)
      ? { syncedAt }
      : {}),
  };
}

export function SchemaPageView({ state }: { state: StudioSchemaState }) {
  const pageDescription =
    state.status === "loading"
      ? state.message
      : `Read-only schema browser for ${state.project} / ${state.environment}.`;
  const sharedSyncSummary =
    state.status === "ready" ? getSharedSchemaSyncSummary(state.entries) : null;

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Schema" }]} />

      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <PageHeaderHeading>Schema</PageHeaderHeading>
          <PageHeaderDescription>{pageDescription}</PageHeaderDescription>
        </div>

        <Card>
          <CardContent className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="flex flex-wrap items-start gap-3">
              <Badge variant="default">Read-only</Badge>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {SCHEMA_READ_ONLY_COPY}
              </p>
            </div>

            {sharedSyncSummary &&
            (sharedSyncSummary.schemaHash || sharedSyncSummary.syncedAt) ? (
              <div
                data-mdcms-schema-sync-summary="page"
                className="grid gap-2 text-xs text-muted-foreground xl:justify-items-end"
              >
                {sharedSyncSummary.syncedAt ? (
                  <p className="flex flex-wrap items-baseline gap-1 xl:justify-end">
                    <span className="font-medium text-foreground">
                      Synced at
                    </span>
                    <span>{sharedSyncSummary.syncedAt}</span>
                  </p>
                ) : null}
                {sharedSyncSummary.schemaHash ? (
                  <p className="flex flex-wrap items-start gap-1 xl:justify-end">
                    <span className="font-medium text-foreground">
                      Schema hash
                    </span>
                    <code className="break-all font-mono text-[11px] leading-relaxed">
                      {sharedSyncSummary.schemaHash}
                    </code>
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {state.status === "loading" ? (
          <div
            data-mdcms-schema-page-state="loading"
            className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
          >
            {state.message}
          </div>
        ) : state.status === "forbidden" ? (
          <section
            data-mdcms-schema-page-state="forbidden"
            className="space-y-3 rounded-lg border border-dashed p-6"
          >
            <Badge variant="default">Forbidden</Badge>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">
              {state.project} / {state.environment}
            </p>
          </section>
        ) : state.status === "error" ? (
          <section
            data-mdcms-schema-page-state="error"
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
            data-mdcms-schema-page-state="empty"
            className="space-y-3 rounded-lg border border-dashed p-6"
          >
            <Badge variant="outline">Empty</Badge>
            <p className="text-sm text-muted-foreground">
              No synced schema is available for this project and environment.
            </p>
            <p className="text-sm text-muted-foreground">
              Ask an admin or developer to run <code>cms schema sync</code> from
              the host app repo to publish the latest schema.
            </p>
            <p className="text-xs text-muted-foreground">
              {state.project} / {state.environment}
            </p>
          </section>
        ) : (
          <div data-mdcms-schema-page-state="ready" className="space-y-4">
            {sortEntries(state.entries).map((entry) => (
              <Card key={entry.type} data-mdcms-schema-entry-type={entry.type}>
                <CardHeader className="gap-2">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-2xl tracking-tight">
                        {entry.type}
                      </CardTitle>
                      <Badge
                        variant={entry.localized ? "default" : "outline"}
                      >
                        {entry.localized ? "Localized" : "Single locale"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {entry.directory}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Nullable</TableHead>
                        <TableHead>Constraints</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortFields(entry.resolvedSchema.fields).map(
                        ([fieldName, field]) => (
                          <TableRow
                            key={fieldName}
                            data-mdcms-schema-field-name={fieldName}
                            data-mdcms-schema-field-kind={field.kind}
                          >
                            <TableCell className="font-medium">
                              {fieldName}
                            </TableCell>
                            <TableCell>{field.kind}</TableCell>
                            <TableCell>
                              {field.required ? "Yes" : "No"}
                            </TableCell>
                            <TableCell>
                              {field.nullable ? "Yes" : "No"}
                            </TableCell>
                            <TableCell>
                              <div
                                data-mdcms-schema-field-constraints={describeSchemaFieldConstraints(
                                  field,
                                ).join(" | ")}
                              >
                                {renderConstraintSummary(field)}
                              </div>
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SchemaPage({
  context,
}: {
  context: StudioMountContext;
}) {
  const mountInfo = useStudioMountInfo();
  const [state, setState] = useState<StudioSchemaState>(() =>
    createSchemaPageLoadingState(),
  );

  useEffect(() => {
    if (!mountInfo.project || !mountInfo.environment) {
      setState(createSchemaPageMissingRouteState());
      return;
    }

    const loadInput: SchemaPageLoadInput = {
      config: {
        project: mountInfo.project,
        environment: mountInfo.environment,
        serverUrl: mountInfo.apiBaseUrl,
      },
      auth: mountInfo.auth,
    };

    let active = true;
    setState(createSchemaPageLoadingState());

    void loadStudioSchemaState(loadInput)
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
              : "Failed to load schema state.",
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
  ]);

  return <SchemaPageView state={state} />;
}
