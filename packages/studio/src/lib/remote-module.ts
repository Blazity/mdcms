import {
  type RemoteStudioModule,
  type StudioMountContext,
} from "@mdcms/shared";

type MountTarget = {
  textContent?: string;
};

function resolveMountTarget(container: unknown): MountTarget | undefined {
  if (
    typeof container === "object" &&
    container !== null &&
    "textContent" in container
  ) {
    return container as MountTarget;
  }

  return undefined;
}

/**
 * mount is the typed remote Studio runtime entrypoint.
 */
export const mount: RemoteStudioModule["mount"] = (
  container: unknown,
  context: StudioMountContext,
): (() => void) => {
  const target = resolveMountTarget(container);

  if (target) {
    target.textContent = `MDCMS Studio runtime loaded from ${context.apiBaseUrl} (${context.auth.mode})`;
  }

  return () => {
    if (target) {
      target.textContent = "";
    }
  };
};
