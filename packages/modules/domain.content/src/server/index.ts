import type { ServerSurface } from "@mdcms/shared";

export const domainContentServerSurface: ServerSurface<
  unknown,
  Record<string, unknown>
> = {
  mount: (app) => {
    const serverApp = app as {
      get?: (path: string, handler: () => unknown) => unknown;
    };

    serverApp.get?.("/api/v1/modules/domain-content/preview", () => ({
      moduleId: "domain.content",
      status: "ok",
    }));
  },
  actions: [
    {
      id: "domain.content.preview",
      kind: "query",
      method: "GET",
      path: "/api/v1/modules/domain-content/preview",
      permissions: ["content:read"],
      studio: {
        visible: true,
        surface: "content",
        label: "Domain content preview",
      },
      cli: {
        visible: true,
        alias: "content:preview",
        inputMode: "json",
      },
      responseSchema: {
        type: "object",
        properties: {
          moduleId: { type: "string" },
          status: { type: "string" },
        },
        required: ["moduleId", "status"],
        additionalProperties: false,
      },
    },
  ],
};
