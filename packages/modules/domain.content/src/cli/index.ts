import type { CliSurface } from "@mdcms/shared";

export const domainContentCliSurface: CliSurface = {
  actionAliases: [
    {
      alias: "content:preview",
      actionId: "domain.content.preview",
    },
  ],
  outputFormatters: [
    {
      actionId: "domain.content.preview",
      format: (output) => `domain.content.preview => ${JSON.stringify(output)}`,
    },
  ],
  preflightHooks: [
    {
      id: "domain.content.default-preflight",
      run: () => undefined,
    },
  ],
};
