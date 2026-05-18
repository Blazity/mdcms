import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

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
    const conditionNames = config.resolve.conditionNames ?? [];

    config.resolve.conditionNames = [
      "@mdcms/source",
      ...conditionNames.filter(
        (conditionName) => conditionName !== "@mdcms/source",
      ),
    ];
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };

    return config;
  },
};

export default nextConfig;
