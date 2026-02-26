import type { CliSurface } from "@mdcms/shared";

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
      run: () => undefined,
    },
  ],
};
