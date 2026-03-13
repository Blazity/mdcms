import { Elysia } from "elysia";

import {
  API_V1_BASE_PATH,
  type ActionCatalogItem,
  type ActionCatalogListResponse,
} from "./action-catalog.js";

export type ActionCatalogRouteHandlers = {
  list: (context: {
    request: Request;
  }) => Promise<ActionCatalogListResponse> | ActionCatalogListResponse;
  getById: (context: {
    id: string;
    request: Request;
  }) => Promise<ActionCatalogItem | Response> | ActionCatalogItem | Response;
};

export function createActionCatalogContractApp(
  handlers: ActionCatalogRouteHandlers,
) {
  return new Elysia({ prefix: API_V1_BASE_PATH })
    .get("/actions", ({ request }) => handlers.list({ request }))
    .get("/actions/:id", ({ params, request }) =>
      handlers.getById({
        id: params.id,
        request,
      }),
    );
}

export type ActionCatalogContractApp = ReturnType<
  typeof createActionCatalogContractApp
>;
