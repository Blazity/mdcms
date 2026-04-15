#!/usr/bin/env bun

import { runMdcmsCli } from "../lib/framework.js";

const exitCode = await runMdcmsCli(process.argv.slice(2), {
  env: process.env,
});
process.exit(exitCode);
