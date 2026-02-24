import {
  API_V1_BASE_PATH,
  type ActionCatalogGetResponse,
  type ActionCatalogListResponse,
} from "@mdcms/shared";
import { Elysia } from "elysia";

export type ActionCatalogRouteHandlers = {
  list: (context: {
    request: Request;
  }) => Promise<ActionCatalogListResponse> | ActionCatalogListResponse;
  getById: (context: {
    id: string;
    request: Request;
  }) =>
    | Promise<ActionCatalogGetResponse | Response>
    | ActionCatalogGetResponse
    | Response;
};

/**
 * createActionCatalogContractApp defines the canonical `/api/v1/actions` route
 * contract owned by the server and consumed by Eden/Treaty clients.
 */
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
