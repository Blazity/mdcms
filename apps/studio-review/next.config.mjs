import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mdcms/cli", "@mdcms/shared", "@mdcms/studio"],
  outputFileTracingIncludes: {
    "/*": ["./.generated/runtime/**/*"],
  },
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
