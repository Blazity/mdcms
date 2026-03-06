#!/usr/bin/env bun

import { runMdcmsCli } from "../lib/framework.js";
import { createCliRuntimeContextWithModules } from "../lib/runtime-with-modules.js";

const runtimeWithModules = createCliRuntimeContextWithModules(process.env);
const exitCode = await runMdcmsCli(process.argv.slice(2), {
  env: process.env,
  runtimeWithModules,
});
process.exit(exitCode);
