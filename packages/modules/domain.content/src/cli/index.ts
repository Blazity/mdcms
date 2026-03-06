import { RuntimeError, type CliSurface } from "@mdcms/shared";

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
      run: ({ actionId, input }) => {
        if (actionId !== "pull") {
          return;
        }

        const payload =
          input && typeof input === "object"
            ? (input as {
                target?: { project?: unknown; environment?: unknown };
              })
            : undefined;

        const project = payload?.target?.project;
        const environment = payload?.target?.environment;
        const validProject =
          typeof project === "string" && project.trim().length > 0;
        const validEnvironment =
          typeof environment === "string" && environment.trim().length > 0;

        if (!validProject || !validEnvironment) {
          throw new RuntimeError({
            code: "CLI_PREFLIGHT_FAILED",
            message:
              "pull preflight requires resolved project/environment target values.",
            statusCode: 400,
            details: {
              hookId: "domain.content.default-preflight",
              actionId,
            },
          });
        }
      },
    },
  ],
};
