import {
  RuntimeError,
  extendEnv,
  parseCoreEnv,
  type CoreEnv,
} from "@mdcms/shared";

export type ServerEnv = CoreEnv & {
  PORT: number;
  SERVICE_NAME: string;
};

function parsePort(rawValue: string | undefined): number {
  const resolvedValue = rawValue ?? "4000";
  const parsedPort = Number(resolvedValue);

  if (Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) {
    return parsedPort;
  }

  throw new RuntimeError({
    code: "INVALID_ENV",
    message: "PORT must be an integer between 1 and 65535.",
    details: {
      key: "PORT",
      value: resolvedValue,
    },
  });
}

/**
 * parseServerEnv extends the shared core runtime env with server-specific
 * settings used for health and request handling.
 */
export function parseServerEnv(rawEnv: NodeJS.ProcessEnv): ServerEnv {
  const core = parseCoreEnv(rawEnv);

  return extendEnv(core, () => ({
    PORT: parsePort(rawEnv.PORT),
    SERVICE_NAME: rawEnv.SERVICE_NAME?.trim() || "mdcms-server",
  }));
}
