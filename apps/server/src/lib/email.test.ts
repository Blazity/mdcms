import assert from "node:assert/strict";
import { test } from "bun:test";

import { RuntimeError } from "@mdcms/shared";

import {
  createEmailService,
  type EmailTransportFactory,
} from "./email.js";

function createMockTransport() {
  const calls: Array<{
    from: string;
    to: string;
    subject: string;
    html: string;
  }> = [];

  const factory: EmailTransportFactory = {
    createTransport: () => ({
      sendMail: async (opts) => {
        calls.push(opts);
        return { messageId: "mock-message-id" };
      },
    }),
  };

  return { factory, calls };
}

test("createEmailService throws EMAIL_NOT_CONFIGURED when SMTP_HOST is missing", () => {
  assert.throws(
    () => createEmailService({}),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "EMAIL_NOT_CONFIGURED",
  );
});

test("createEmailService creates service when SMTP_HOST is provided", () => {
  const { factory } = createMockTransport();
  const service = createEmailService({ SMTP_HOST: "mail.example.com" }, factory);

  assert.ok(service);
  assert.equal(typeof service.sendInviteEmail, "function");
});

test("sendInviteEmail calls transport.sendMail with correct fields", async () => {
  const { factory, calls } = createMockTransport();
  const service = createEmailService({ SMTP_HOST: "mail.example.com" }, factory);

  await service.sendInviteEmail({
    to: "user@example.com",
    inviterName: "Alice",
    studioUrl: "https://studio.example.com",
    token: "abc123",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.to, "user@example.com");
  assert.equal(calls[0]?.subject, "Alice invited you to MDCMS");
  assert.equal(calls[0]?.from, "noreply@mail.example.com");
  assert.ok(calls[0]?.html.includes("Alice"));
});

test("sendInviteEmail uses SMTP_FROM when provided", async () => {
  const { factory, calls } = createMockTransport();
  const service = createEmailService(
    { SMTP_HOST: "mail.example.com", SMTP_FROM: "admin@custom.com" },
    factory,
  );

  await service.sendInviteEmail({
    to: "user@example.com",
    inviterName: "Alice",
    studioUrl: "https://studio.example.com",
    token: "abc123",
  });

  assert.equal(calls[0]?.from, "admin@custom.com");
});

test("sendInviteEmail defaults from address to noreply@{SMTP_HOST}", async () => {
  const { factory, calls } = createMockTransport();
  const service = createEmailService({ SMTP_HOST: "smtp.myhost.io" }, factory);

  await service.sendInviteEmail({
    to: "user@example.com",
    inviterName: "Bob",
    studioUrl: "https://studio.example.com",
    token: "tok",
  });

  assert.equal(calls[0]?.from, "noreply@smtp.myhost.io");
});

test("sendInviteEmail includes token in accept URL", async () => {
  const { factory, calls } = createMockTransport();
  const service = createEmailService({ SMTP_HOST: "mail.example.com" }, factory);

  await service.sendInviteEmail({
    to: "user@example.com",
    inviterName: "Alice",
    studioUrl: "https://studio.example.com",
    token: "my-secret-token",
  });

  assert.ok(
    calls[0]?.html.includes("https://studio.example.com/invite/my-secret-token"),
  );
});

test("sendInviteEmail includes inviter name in email HTML", async () => {
  const { factory, calls } = createMockTransport();
  const service = createEmailService({ SMTP_HOST: "mail.example.com" }, factory);

  await service.sendInviteEmail({
    to: "user@example.com",
    inviterName: "Charlie Brown",
    studioUrl: "https://studio.example.com",
    token: "tok",
  });

  assert.ok(calls[0]?.html.includes("Charlie Brown"));
});
