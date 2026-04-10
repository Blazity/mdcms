import assert from "node:assert/strict";

import { test } from "bun:test";

import { POST } from "./route";

test("environment review POST returns 400 for malformed json bodies", async () => {
  const response = await POST(
    new Request("http://localhost/review-api/owner/api/v1/environments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    }),
    {
      params: Promise.resolve({
        scenario: "owner",
      }),
    },
  );

  const payload = (await response.json()) as {
    code?: string;
    statusCode?: number;
  };

  assert.equal(response.status, 400);
  assert.equal(payload.code, "INVALID_INPUT");
  assert.equal(payload.statusCode, 400);
});
