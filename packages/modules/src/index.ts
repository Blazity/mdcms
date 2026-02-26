import type { MdcmsModulePackage } from "@mdcms/shared";

import { coreSystemModule } from "../core.system/src/index.js";
import { domainContentModule } from "../domain.content/src/index.js";

type LocalModulePackage = MdcmsModulePackage<unknown, Record<string, unknown>>;

const localModules: LocalModulePackage[] = [
  domainContentModule,
  coreSystemModule,
];

/**
 * installedModules is the compile-time local registry consumed by app loaders.
 * It is sorted deterministically by manifest.id.
 */
export const installedModules = Object.freeze(
  [...localModules].sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id),
  ),
) as readonly LocalModulePackage[];
