import { RuntimeError, type AiProposal } from "@mdcms/shared";

export type AiProposalStatus = "pending" | "accepted" | "rejected" | "expired";

export type AiProposalRecord = {
  proposal: AiProposal;
  status: AiProposalStatus;
  /** Actor that requested proposal creation. */
  createdByActorId: string;
  createdAt: string;
  /** Set when the proposal moves out of `pending`. */
  resolvedAt?: string;
  /** Actor that accepted or rejected the proposal. */
  resolvedByActorId?: string;
};

export type AiProposalStoreClock = () => Date;

export type AiProposalStore = {
  insert(input: { proposal: AiProposal; actorId: string }): AiProposalRecord;
  /**
   * Return the record without mutating its status. Callers should
   * separately call `markExpired` after observing an expired record.
   */
  peek(proposalId: string): AiProposalRecord | undefined;
  /**
   * Look up the record and return its current state. If the proposal's
   * `expiresAt` has elapsed and it is still pending, the record is
   * transitioned to `expired` before being returned.
   */
  observe(proposalId: string): AiProposalRecord | undefined;
  markAccepted(input: {
    proposalId: string;
    actorId: string;
  }): AiProposalRecord;
  markRejected(input: {
    proposalId: string;
    actorId: string;
  }): AiProposalRecord;
  /**
   * Iterate every stored record without filtering by status. Mostly
   * useful in tests; the store is not designed to be a long-lived
   * archive of resolved proposals.
   */
  list(): AiProposalRecord[];
};

export type CreateAiProposalStoreOptions = {
  clock?: AiProposalStoreClock;
};

const TERMINAL_STATUSES: ReadonlySet<AiProposalStatus> = new Set([
  "accepted",
  "rejected",
  "expired",
]);

function proposalNotFound(proposalId: string): RuntimeError {
  return new RuntimeError({
    code: "NOT_FOUND",
    message: "AI proposal not found.",
    statusCode: 404,
    details: { proposalId },
  });
}

function proposalAlreadyResolved(record: AiProposalRecord): RuntimeError {
  if (record.status === "expired") {
    return new RuntimeError({
      code: "AI_PROPOSAL_EXPIRED",
      message: "AI proposal has expired.",
      statusCode: 410,
      details: {
        proposalId: record.proposal.proposalId,
        status: record.status,
      },
    });
  }

  return new RuntimeError({
    code: "AI_PROPOSAL_CONFLICT",
    message: "AI proposal has already been resolved.",
    statusCode: 409,
    details: {
      proposalId: record.proposal.proposalId,
      status: record.status,
    },
  });
}

function isExpiredAt(record: AiProposalRecord, now: Date): boolean {
  if (record.status !== "pending") {
    return false;
  }

  const expiresAt = Date.parse(record.proposal.expiresAt);

  if (Number.isNaN(expiresAt)) {
    return false;
  }

  return expiresAt <= now.getTime();
}

/**
 * In-memory proposal store used by the AI module's lifecycle service.
 *
 * Proposals are short-lived (default TTL 5 minutes) and the apply
 * endpoint is the only side-effecting consumer. The store does not
 * persist proposals across process restarts; per SPEC-014, proposals
 * may be stored server-side OR in signed tokens — this implementation
 * picks server-side storage and treats the proposal id as opaque.
 */
export function createInMemoryAiProposalStore(
  options: CreateAiProposalStoreOptions = {},
): AiProposalStore {
  const clock = options.clock ?? (() => new Date());
  const records = new Map<string, AiProposalRecord>();

  return {
    insert({ proposal, actorId }) {
      if (records.has(proposal.proposalId)) {
        throw new RuntimeError({
          code: "AI_PROPOSAL_CONFLICT",
          message: "AI proposal id is already in use.",
          statusCode: 409,
          details: { proposalId: proposal.proposalId },
        });
      }

      const record: AiProposalRecord = {
        proposal,
        status: "pending",
        createdByActorId: actorId,
        createdAt: clock().toISOString(),
      };
      records.set(proposal.proposalId, record);

      return record;
    },
    peek(proposalId) {
      return records.get(proposalId);
    },
    observe(proposalId) {
      const existing = records.get(proposalId);

      if (!existing) {
        return undefined;
      }

      if (isExpiredAt(existing, clock())) {
        const expired: AiProposalRecord = {
          ...existing,
          status: "expired",
          resolvedAt: clock().toISOString(),
        };
        records.set(proposalId, expired);
        return expired;
      }

      return existing;
    },
    markAccepted({ proposalId, actorId }) {
      const existing = records.get(proposalId);

      if (!existing) {
        throw proposalNotFound(proposalId);
      }

      const now = clock();

      if (isExpiredAt(existing, now)) {
        const expired: AiProposalRecord = {
          ...existing,
          status: "expired",
          resolvedAt: now.toISOString(),
        };
        records.set(proposalId, expired);
        throw proposalAlreadyResolved(expired);
      }

      if (TERMINAL_STATUSES.has(existing.status)) {
        throw proposalAlreadyResolved(existing);
      }

      const accepted: AiProposalRecord = {
        ...existing,
        status: "accepted",
        resolvedAt: now.toISOString(),
        resolvedByActorId: actorId,
      };
      records.set(proposalId, accepted);
      return accepted;
    },
    markRejected({ proposalId, actorId }) {
      const existing = records.get(proposalId);

      if (!existing) {
        throw proposalNotFound(proposalId);
      }

      const now = clock();

      if (isExpiredAt(existing, now)) {
        const expired: AiProposalRecord = {
          ...existing,
          status: "expired",
          resolvedAt: now.toISOString(),
        };
        records.set(proposalId, expired);
        throw proposalAlreadyResolved(expired);
      }

      if (TERMINAL_STATUSES.has(existing.status)) {
        throw proposalAlreadyResolved(existing);
      }

      const rejected: AiProposalRecord = {
        ...existing,
        status: "rejected",
        resolvedAt: now.toISOString(),
        resolvedByActorId: actorId,
      };
      records.set(proposalId, rejected);
      return rejected;
    },
    list() {
      return Array.from(records.values());
    },
  };
}
