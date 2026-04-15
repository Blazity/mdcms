import assert from "node:assert/strict";
import { test } from "bun:test";

import { createCliConsoleSink } from "./logger.js";
import type { LogEntry } from "./logger.js";

function makeEntry(
  level: LogEntry["level"],
  message: string,
  meta?: LogEntry["meta"],
): LogEntry {
  return {
    level,
    message,
    timestamp: "2026-04-15T00:00:00.000Z",
    meta,
  };
}

test("debug entries get [debug] prefix with meta as key=value pairs", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(makeEntry("debug", "loading module", { moduleId: "core.system" }));

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "[debug] loading module moduleId=core.system");
});

test("info entries are just the message, no prefix", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(makeEntry("info", "server started"));

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "server started");
});

test("warn entries get Warning: prefix", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(makeEntry("warn", "deprecated config option"));

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "Warning: deprecated config option");
});

test("error entries get Error: prefix with meta", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(
    makeEntry("error", "connection failed", { host: "localhost", port: 5432 }),
  );

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "Error: connection failed host=localhost port=5432");
});

test("fatal entries get Error: prefix", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(makeEntry("fatal", "out of memory"));

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "Error: out of memory");
});

test("debug with no meta omits trailing space", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(makeEntry("debug", "checkpoint reached"));

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "[debug] checkpoint reached");
});

test("multiple meta keys are space-separated", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(
    makeEntry("debug", "action dispatched", {
      action: "publish",
      status: "ok",
      retries: 3,
    }),
  );

  assert.equal(lines.length, 1);
  assert.equal(
    lines[0],
    "[debug] action dispatched action=publish status=ok retries=3",
  );
});

test("trace entries get [trace] prefix", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(makeEntry("trace", "entering function", { fn: "loadModule" }));

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "[trace] entering function fn=loadModule");
});

test("context fields are included in formatted output", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink({
    level: "debug",
    message: "loading",
    timestamp: "2026-04-15T00:00:00.000Z",
    context: { runtime: "cli" },
    meta: { moduleId: "core.system" },
  });

  assert.equal(lines[0], "[debug] loading runtime=cli moduleId=core.system");
});

test("meta overrides context when keys overlap", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink({
    level: "debug",
    message: "event",
    timestamp: "2026-04-15T00:00:00.000Z",
    context: { source: "base" },
    meta: { source: "override" },
  });

  assert.equal(lines[0], "[debug] event source=override");
});

test("array values in meta are joined with commas", () => {
  const lines: string[] = [];
  const sink = createCliConsoleSink((line) => lines.push(line));

  sink(
    makeEntry("info", "modules loaded", {
      moduleIds: ["core.system", "domain.content"],
    }),
  );

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "modules loaded moduleIds=core.system,domain.content");
});
