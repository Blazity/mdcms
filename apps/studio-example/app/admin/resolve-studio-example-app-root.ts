import { resolve } from "node:path";

export function resolveStudioExampleAppRoot(cwd: string = process.cwd()) {
  const normalizedCwd = cwd.replaceAll("\\", "/");

  return normalizedCwd.endsWith("/apps/studio-example")
    ? cwd
    : resolve(cwd, "apps/studio-example");
}
