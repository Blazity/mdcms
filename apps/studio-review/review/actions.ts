import type { ActionCatalogItem } from "@mdcms/shared";

import { getReviewScenario } from "./scenarios";

const REVIEW_ACTIONS: readonly ActionCatalogItem[] = [
  {
    id: "content.list",
    kind: "query",
    method: "GET",
    path: "/api/v1/content",
    permissions: ["content:read"],
    studio: {
      visible: true,
      label: "Browse content",
    },
  },
  {
    id: "content.publish",
    kind: "command",
    method: "POST",
    path: "/api/v1/content/:id/publish",
    permissions: ["content:publish"],
    studio: {
      visible: true,
      surface: "content.document",
      label: "Publish entry",
      confirm: "Publish the current draft?",
    },
  },
  {
    id: "content.create",
    kind: "command",
    method: "POST",
    path: "/api/v1/content",
    permissions: ["content:write"],
    studio: {
      visible: true,
      surface: "content.list",
      label: "Create document",
    },
  },
  {
    id: "content.duplicate",
    kind: "command",
    method: "POST",
    path: "/api/v1/content/:id/duplicate",
    permissions: ["content:write"],
    studio: {
      visible: true,
      surface: "content.list",
      label: "Duplicate document",
    },
  },
  {
    id: "content.unpublish",
    kind: "command",
    method: "POST",
    path: "/api/v1/content/:id/unpublish",
    permissions: ["content:publish"],
    studio: {
      visible: true,
      surface: "content.document",
      label: "Unpublish entry",
      confirm: "Revert this document to draft?",
    },
  },
  {
    id: "content.delete",
    kind: "command",
    method: "DELETE",
    path: "/api/v1/content/:id",
    permissions: ["content:delete"],
    studio: {
      visible: true,
      surface: "content.document",
      label: "Delete entry",
      confirm: "Delete this document? It can be restored from trash.",
    },
  },
  {
    id: "content.restore",
    kind: "command",
    method: "POST",
    path: "/api/v1/content/:id/restore",
    permissions: ["content:write"],
    studio: {
      visible: true,
      surface: "content.trash",
      label: "Restore document",
      confirm: "Restore this document? It will return to draft state.",
    },
  },
  {
    id: "schema.list",
    kind: "query",
    method: "GET",
    path: "/api/v1/schema",
    permissions: ["schema:read"],
    studio: {
      visible: true,
      label: "Review schema",
    },
  },
  {
    id: "users.list",
    kind: "query",
    method: "GET",
    path: "/api/v1/users",
    permissions: ["users:manage"],
    studio: {
      visible: true,
      label: "Manage users",
    },
  },
  {
    id: "settings.read",
    kind: "query",
    method: "GET",
    path: "/api/v1/settings",
    permissions: ["settings:manage"],
    studio: {
      visible: true,
      label: "Open settings",
    },
  },
];

function hasScenarioPermission(
  scenarioId: string,
  permission: string,
): boolean {
  const scenario = getReviewScenario(scenarioId);

  switch (permission) {
    case "content:read":
      return scenario.capabilities.content.read;
    case "content:write":
      return scenario.capabilities.content.write;
    case "content:publish":
      return scenario.capabilities.content.publish;
    case "content:delete":
      return scenario.capabilities.content.delete;
    case "schema:read":
      return scenario.capabilities.schema.read;
    case "users:manage":
      return scenario.capabilities.users.manage;
    case "settings:manage":
      return scenario.capabilities.settings.manage;
    default:
      return false;
  }
}

export function listReviewActions(scenarioId: string): ActionCatalogItem[] {
  return REVIEW_ACTIONS.filter((action) =>
    action.permissions.every((permission) =>
      hasScenarioPermission(scenarioId, permission),
    ),
  );
}

export function getReviewAction(
  scenarioId: string,
  actionId: string,
): ActionCatalogItem | undefined {
  return listReviewActions(scenarioId).find((action) => action.id === actionId);
}
