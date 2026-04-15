#!/usr/bin/env bun

import { createRequire } from "node:module";

import { runMdcmsCli } from "../lib/framework.js";
import { createCliRuntimeContextWithModules } from "../lib/runtime-with-modules.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const runtimeWithModules = createCliRuntimeContextWithModules(process.env);
const exitCode = await runMdcmsCli(process.argv.slice(2), {
  env: process.env,
  version,
  runtimeWithModules,
});
process.exit(exitCode);
