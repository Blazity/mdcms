import type { MdcmsModulePackage } from "@mdcms/shared";

import { coreSystemCliSurface } from "./cli/index.js";
import { coreSystemManifest } from "./manifest.js";
import { coreSystemServerSurface } from "./server/index.js";

export const coreSystemModule: MdcmsModulePackage<
  unknown,
  Record<string, unknown>
> = {
  manifest: coreSystemManifest,
  server: coreSystemServerSurface,
  cli: coreSystemCliSurface,
};
