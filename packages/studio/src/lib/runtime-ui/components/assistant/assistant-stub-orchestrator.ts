/**
 * Client-side stub orchestrator for the global assistant.
 *
 * This module is the seam where the UI talks to the AI today and where
 * the real `/api/v1/ai/chat/messages` server route will plug in once the
 * server side of CMS-226 lands. Until then, the stub produces
 * deterministic structured proposals from the user's prompt so the rail
 * is interactive end-to-end (compose → send → assistant turn with
 * accept/reject controls) without a backend.
 *
 * The contract returned by `respondToUserMessage` matches the shape the
 * real chat endpoint will return, so swapping this for a real fetcher
 * is a one-file change.
 */

import type {
  AssistantMessage,
  AssistantProposal,
  AssistantSelectionContext,
  AssistantThread,
} from "./assistant-types.js";

export type StubResponseInput = {
  thread: AssistantThread;
  userMessage: AssistantMessage;
  rejectionFeedback?: { proposalId: string; feedback: string };
};

export type StubResponseResult = {
  assistantMessage: AssistantMessage;
  newProposals: AssistantProposal[];
};

const DEFAULT_LOCALE = "en";
const DEFAULT_TYPE = "doc";

function lower(text: string | undefined): string {
  return (text ?? "").toLowerCase();
}

function takeContextDocPath(thread: AssistantThread): string {
  return (
    thread.contextDocs[0]?.path ??
    thread.attachedSelection?.path ??
    "drafts/untitled"
  );
}

function takeContextDocType(thread: AssistantThread): string {
  return thread.contextDocs[0]?.type ?? DEFAULT_TYPE;
}

function takeContextDocLocale(thread: AssistantThread): string {
  return thread.contextDocs[0]?.locale ?? DEFAULT_LOCALE;
}

function nextId(prefix: string): string {
  // Date.now is fine for a UI stub — the real backend mints these.
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function makeIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function trimSentenceCase(text: string, max = 120): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

/**
 * Pick the proposal kind the user appears to be asking for. The
 * heuristics are intentionally simple and obvious — the real
 * orchestrator runs against an actual LLM. The stub only needs to
 * exercise every UI variant.
 */
function inferKind(prompt: string): AssistantProposal["kind"] {
  const p = lower(prompt);
  if (/\bdelete\b|\barchive\b|\bremove\b/.test(p)) return "delete_document";
  if (/\bbatch\b|\bacross all\b|\bevery\b/.test(p)) return "batch";
  if (/\bcreate\b|\bnew (post|doc|draft|article)\b|\bdraft\b/.test(p))
    return "create_document";
  if (/\binsert\b|\badd a section\b|\badd section\b/.test(p))
    return "insert_block";
  return "replace_selection";
}

function buildEditProposal(
  thread: AssistantThread,
  selection: AssistantSelectionContext | undefined,
  prompt: string,
): AssistantProposal {
  const docPath = selection?.path ?? takeContextDocPath(thread);
  const original =
    selection?.text?.trim() ||
    "The selected paragraph from the active document.";
  const replacement = trimSentenceCase(
    `${prompt.replace(/^[\s>]+/, "")} — rewritten for ${
      /\bshorten\b/i.test(prompt) ? "concision" : "clarity"
    }.`,
  );
  return {
    proposalId: nextId("p-edit"),
    kind: "replace_selection",
    docPath,
    type: takeContextDocType(thread),
    locale: takeContextDocLocale(thread),
    summary: `Rewrite selection · ${prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt}`,
    baseDraftRevision: 1,
    validation: { status: "valid" },
    expiresAt: makeIso(15 * 60 * 1000),
    op: {
      op: "replace_selection",
      selectionId: selection?.selectionId ?? "selection",
      originalText: original,
      replacementText: replacement,
    },
    diffStats: {
      added: replacement.split(/\s+/).filter(Boolean).length,
      removed: original.split(/\s+/).filter(Boolean).length,
    },
  };
}

function buildInsertProposal(
  thread: AssistantThread,
  prompt: string,
): AssistantProposal {
  const docPath = takeContextDocPath(thread);
  const bodyMdx = `## ${trimSentenceCase(prompt, 60)}\n\n${trimSentenceCase(
    prompt,
    240,
  )}`;
  return {
    proposalId: nextId("p-insert"),
    kind: "insert_block",
    docPath,
    type: takeContextDocType(thread),
    locale: takeContextDocLocale(thread),
    summary: `Insert block · ${trimSentenceCase(prompt, 60)}`,
    baseDraftRevision: 1,
    validation: { status: "valid" },
    expiresAt: makeIso(15 * 60 * 1000),
    op: { op: "insert_block", bodyMdx },
    diffStats: { added: bodyMdx.split("\n").length, removed: 0 },
  };
}

function buildCreateProposal(
  thread: AssistantThread,
  prompt: string,
): AssistantProposal {
  const slug = trimSentenceCase(
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "untitled",
    32,
  );
  const path = `${takeContextDocType(thread)}/drafts/${slug}`;
  return {
    proposalId: nextId("p-create"),
    kind: "create_document",
    docPath: path,
    type: takeContextDocType(thread),
    locale: takeContextDocLocale(thread),
    summary: `Create draft · ${slug}`,
    validation: { status: "valid" },
    expiresAt: makeIso(15 * 60 * 1000),
    op: {
      op: "create_document",
      path,
      format: "mdx",
      frontmatter: {
        title: trimSentenceCase(prompt, 80),
        publishedAt: new Date().toISOString().slice(0, 10),
        author: "assistant",
      },
      bodyPreview: trimSentenceCase(prompt, 320),
      bodyLines: 3,
    },
  };
}

function buildDeleteProposal(
  thread: AssistantThread,
  prompt: string,
): AssistantProposal {
  const docPath = takeContextDocPath(thread);
  return {
    proposalId: nextId("p-delete"),
    kind: "delete_document",
    docPath,
    type: takeContextDocType(thread),
    locale: takeContextDocLocale(thread),
    summary: `Delete ${docPath}`,
    baseDraftRevision: 1,
    validation: {
      status: "valid",
      checks: [
        { label: "no inbound links", ok: true },
        { label: "no published version", ok: true },
        { label: "actor confirmed delete", ok: true },
      ],
    },
    expiresAt: makeIso(15 * 60 * 1000),
    op: {
      op: "delete_document",
      path: docPath,
      reason: trimSentenceCase(prompt, 200),
    },
  };
}

function buildBatchProposal(
  thread: AssistantThread,
  prompt: string,
): AssistantProposal {
  const docs = thread.contextDocs.length
    ? thread.contextDocs
    : [{ path: takeContextDocPath(thread), type: DEFAULT_TYPE, locale: "en" }];
  return {
    proposalId: nextId("p-batch"),
    kind: "batch",
    summary: `Batch · ${trimSentenceCase(prompt, 60)}`,
    validation: { status: "valid" },
    expiresAt: makeIso(15 * 60 * 1000),
    children: docs.map((doc, i) => ({
      proposalId: nextId(`p-batch-child-${i}`),
      kind: "replace_selection",
      docPath: doc.path,
      locale: doc.locale,
      summary: `Update ${doc.path}`,
      preview: trimSentenceCase(prompt, 200),
      validation: { status: "valid" },
    })),
  };
}

/**
 * Build a stub assistant response from the user's message + thread
 * context. Honors `rejectionFeedback` by tilting the resulting proposal
 * toward the rejection's reason — the visible difference is just the
 * summary tag, which is enough to demonstrate the regenerate flow.
 */
export function respondToUserMessage(
  input: StubResponseInput,
): StubResponseResult {
  const prompt = input.userMessage.text?.trim() ?? "";
  if (!prompt) {
    return {
      assistantMessage: {
        id: nextId("m-asst"),
        role: "assistant",
        at: new Date().toISOString(),
        text: "I didn't catch a message — try again with a question or instruction.",
      },
      newProposals: [],
    };
  }

  const kind = input.rejectionFeedback
    ? "replace_selection"
    : inferKind(prompt);
  let proposal: AssistantProposal;
  switch (kind) {
    case "create_document":
      proposal = buildCreateProposal(input.thread, prompt);
      break;
    case "insert_block":
      proposal = buildInsertProposal(input.thread, prompt);
      break;
    case "delete_document":
      proposal = buildDeleteProposal(input.thread, prompt);
      break;
    case "batch":
      proposal = buildBatchProposal(input.thread, prompt);
      break;
    case "replace_selection":
    default:
      proposal = buildEditProposal(
        input.thread,
        input.thread.attachedSelection,
        input.rejectionFeedback
          ? `${input.rejectionFeedback.feedback} (regenerated)`
          : prompt,
      );
      break;
  }

  return {
    assistantMessage: {
      id: nextId("m-asst"),
      role: "assistant",
      at: new Date().toISOString(),
      proposals: [proposal.proposalId],
    },
    newProposals: [proposal],
  };
}
