import type { ServerSurface } from "@mdcms/shared";

export const coreSystemServerSurface: ServerSurface<
  unknown,
  Record<string, unknown>
> = {
  mount: (app) => {
    const serverApp = app as {
      get?: (path: string, handler: () => unknown) => unknown;
    };

    serverApp.get?.("/api/v1/modules/core-system/ping", () => ({
      moduleId: "core.system",
      status: "ok",
    }));
  },
  actions: [
    {
      id: "core.system.ping",
      kind: "query",
      method: "GET",
      path: "/api/v1/modules/core-system/ping",
      permissions: ["system:read"],
      studio: {
        visible: true,
        surface: "settings",
        label: "Core system ping",
      },
      cli: {
        visible: true,
        alias: "system:ping",
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
