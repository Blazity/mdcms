import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(rootDir, "../..");
const mdcmsSourceAliases = {
  "@mdcms/cli$": resolve(workspaceRoot, "apps/cli/src/index.ts"),
  "@mdcms/sdk$": resolve(workspaceRoot, "packages/sdk/src/index.ts"),
  "@mdcms/shared$": resolve(workspaceRoot, "packages/shared/src/index.ts"),
  "@mdcms/shared/action-catalog-contract$": resolve(
    workspaceRoot,
    "packages/shared/src/lib/contracts/action-catalog-contract.ts",
  ),
  "@mdcms/shared/mdx$": resolve(
    workspaceRoot,
    "packages/shared/src/lib/mdx/index.ts",
  ),
  "@mdcms/shared/mdx/auto-form$": resolve(
    workspaceRoot,
    "packages/shared/src/lib/mdx/auto-form.ts",
  ),
  "@mdcms/shared/server$": resolve(
    workspaceRoot,
    "packages/shared/src/lib/contracts/schema-hash.ts",
  ),
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@mdcms/cli",
    "@mdcms/sdk",
    "@mdcms/shared",
    "@mdcms/studio",
  ],
  turbopack: {
    root: rootDir,
  },
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      ...mdcmsSourceAliases,
    };
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };

    return config;
  },
};

export default nextConfig;
