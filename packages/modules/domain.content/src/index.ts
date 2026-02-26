import type { MdcmsModulePackage } from "@mdcms/shared";

import { domainContentCliSurface } from "./cli/index.js";
import { domainContentManifest } from "./manifest.js";
import { domainContentServerSurface } from "./server/index.js";

export const domainContentModule: MdcmsModulePackage<
  unknown,
  Record<string, unknown>
> = {
  manifest: domainContentManifest,
  server: domainContentServerSurface,
  cli: domainContentCliSurface,
};
