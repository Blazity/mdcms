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
    constraints.push(`checks: ${field.checks.length}`);
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
      environment: route.environment,
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

export function SchemaPageView({ state }: { state: StudioSchemaState }) {
  const pageDescription =
    state.status === "loading"
      ? state.message
      : `Read-only schema browser for ${state.project} / ${state.environment}.`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div className="space-y-1">
          <PageHeaderHeading>Schema</PageHeaderHeading>
          <PageHeaderDescription>{pageDescription}</PageHeaderDescription>
        </div>
      </PageHeader>

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
          <Badge variant="secondary">Forbidden</Badge>
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
            No schema entries were returned for this project and environment.
          </p>
          <p className="text-xs text-muted-foreground">
            {state.project} / {state.environment}
          </p>
        </section>
      ) : (
        <div data-mdcms-schema-page-state="ready" className="space-y-4">
          {sortEntries(state.entries).map((entry) => (
            <article
              key={entry.type}
              data-mdcms-schema-entry-type={entry.type}
              className="space-y-4 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                      {entry.type}
                    </h2>
                    <Badge variant={entry.localized ? "secondary" : "outline"}>
                      {entry.localized ? "Localized" : "Single locale"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {entry.directory}
                  </p>
                </div>
                <div className="space-y-1 text-right text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">
                      Synced at
                    </span>{" "}
                    {entry.syncedAt}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      Schema hash
                    </span>{" "}
                    <code>{entry.schemaHash}</code>
                  </p>
                </div>
              </div>

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
                        <TableCell>{field.required ? "Yes" : "No"}</TableCell>
                        <TableCell>{field.nullable ? "Yes" : "No"}</TableCell>
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
            </article>
          ))}
        </div>
      )}
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
