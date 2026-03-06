import { RuntimeError, type CliSurface } from "@mdcms/shared";

export const coreSystemCliSurface: CliSurface = {
  actionAliases: [
    {
      alias: "system:ping",
      actionId: "core.system.ping",
    },
  ],
  outputFormatters: [
    {
      actionId: "core.system.ping",
      format: (output) => `core.system.ping => ${JSON.stringify(output)}`,
    },
  ],
  preflightHooks: [
    {
      id: "core.system.default-preflight",
      run: ({ actionId }) => {
        if (actionId.trim().length === 0) {
          throw new RuntimeError({
            code: "CLI_PREFLIGHT_FAILED",
            message: "Action id is required for CLI preflight execution.",
            statusCode: 400,
            details: {
              hookId: "core.system.default-preflight",
            },
          });
        }
      },
    },
  ],
};
