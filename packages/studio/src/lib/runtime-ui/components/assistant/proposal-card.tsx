"use client";

import * as React from "react";
import { AlertTriangle, Check, ChevronRight, Send, Trash2 } from "lucide-react";

import { cn } from "../../lib/utils.js";
import type {
  AssistantProposal,
  AssistantProposalCreate,
  AssistantProposalDelete,
  AssistantProposalEdit,
  AssistantProposalInsert,
  AssistantValidation,
} from "./assistant-types.js";

const KIND_LABEL: Record<AssistantProposal["kind"], string> = {
  replace_selection: "Edit",
  insert_block: "Insert",
  update_frontmatter: "Frontmatter",
  create_document: "New doc",
  delete_document: "Delete",
};

type CardChromeProps = {
  children: React.ReactNode;
  className?: string;
};

function CardChrome({ children, className }: CardChromeProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-card-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ValidBadge({ validation }: { validation: AssistantValidation }) {
  if (validation.status === "valid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-success/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-success">
        <Check className="h-2.5 w-2.5" aria-hidden /> valid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/12 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-destructive">
      <AlertTriangle className="h-2.5 w-2.5" aria-hidden />{" "}
      {validation.errors.length} error
      {validation.errors.length === 1 ? "" : "s"}
    </span>
  );
}

type StandardHeaderProps = {
  kind: AssistantProposal["kind"];
  docPath: string;
  locale?: string;
  validation: AssistantValidation;
  dense?: boolean;
};

function StandardHeader({
  kind,
  docPath,
  locale,
  validation,
  dense,
}: StandardHeaderProps) {
  const isDelete = kind === "delete_document";
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border-b border-divider/40 bg-gradient-to-b from-primary/[0.04] to-transparent",
        dense ? "px-2.5 py-1.5" : "px-3 py-2.5",
      )}
    >
      <span
        className={cn(
          "shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
          isDelete
            ? "bg-destructive/12 text-destructive"
            : "bg-blue-100 text-primary",
        )}
      >
        {KIND_LABEL[kind]}
      </span>
      <span
        className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground-muted"
        title={docPath}
      >
        {docPath}
      </span>
      {locale && (
        <span className="shrink-0 font-mono text-[10px] text-foreground-muted/80">
          {locale}
        </span>
      )}
      <ValidBadge validation={validation} />
    </div>
  );
}

type FooterProps = {
  contentInvalidated?: boolean;
  validation: AssistantValidation;
  onAccept: () => void;
  onReject: () => void;
  acceptLabel?: React.ReactNode;
  rejectLabel?: React.ReactNode;
  destructive?: boolean;
};

function Footer({
  contentInvalidated,
  validation,
  onAccept,
  onReject,
  acceptLabel,
  rejectLabel,
  destructive,
}: FooterProps) {
  const ok = validation.status === "valid";
  const blocked = !ok || contentInvalidated;
  return (
    <div className="flex items-center gap-2 border-t border-divider/40 bg-background-subtle px-3 py-2">
      {contentInvalidated ? (
        <span className="flex flex-1 items-center gap-1.5 font-mono text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden /> source text changed
          — retry
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <button
        type="button"
        onClick={onReject}
        className="rounded border border-border bg-transparent px-2.5 py-1 font-mono text-[11px] font-medium text-foreground-muted transition-colors hover:bg-muted hover:text-foreground"
      >
        {rejectLabel ?? "Reject…"}
      </button>
      <button
        type="button"
        onClick={blocked ? undefined : onAccept}
        disabled={blocked}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors",
          blocked
            ? "cursor-not-allowed bg-muted text-foreground-muted"
            : destructive
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-sidebar text-vibrant-green hover:bg-sidebar/90",
        )}
        title={
          contentInvalidated
            ? "Source text changed — retry to regenerate"
            : ok
              ? "Apply as draft"
              : "Fix validation before accepting"
        }
      >
        <Check className="h-3 w-3" aria-hidden />
        {acceptLabel ?? "Accept"}
      </button>
    </div>
  );
}

type RejectFeedbackProps = {
  onCancel: () => void;
  onSend: (feedback: string) => void;
};

function RejectFeedback({ onCancel, onSend }: RejectFeedbackProps) {
  const [feedback, setFeedback] = React.useState("");
  return (
    <div className="space-y-2 border-t border-divider/40 bg-muted/40 px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
        Rejected — what should change?
      </div>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="e.g. Keep it under 12 words, no em dashes."
        rows={3}
        className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-2.5 py-1 font-mono text-[11px] font-medium text-foreground-muted transition-colors hover:bg-muted hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSend(feedback)}
          className="inline-flex items-center gap-1.5 rounded bg-sidebar px-2.5 py-1 font-mono text-[11px] font-semibold text-vibrant-green transition-colors hover:bg-sidebar/90"
        >
          <Send className="h-3 w-3" aria-hidden />
          Send & retry
        </button>
      </div>
    </div>
  );
}

type DiffBodyProps = {
  removed?: string;
  added: string;
  emptyLeftLabel?: string;
};

function DiffBody({ removed, added, emptyLeftLabel }: DiffBodyProps) {
  return (
    <div className="overflow-hidden rounded-md border border-divider/60 bg-background-subtle font-mono text-[12px] leading-snug">
      {removed != null ? (
        <div className="flex gap-2 border-l-2 border-destructive bg-destructive/5 px-2.5 py-1 text-foreground-muted line-through">
          <span className="w-2.5 shrink-0 text-center text-foreground-muted/80">
            −
          </span>
          <span className="whitespace-pre-wrap">{removed}</span>
        </div>
      ) : (
        <div className="flex gap-2 border-l-2 border-transparent bg-transparent px-2.5 py-1 italic text-foreground-muted/70">
          <span className="w-2.5 shrink-0 text-center text-foreground-muted/60">
            −
          </span>
          <span>{emptyLeftLabel ?? "(no existing content)"}</span>
        </div>
      )}
      <div className="flex gap-2 border-l-2 border-success bg-success/8 px-2.5 py-1 text-foreground">
        <span className="w-2.5 shrink-0 text-center text-foreground-muted/80">
          +
        </span>
        <span className="whitespace-pre-wrap">{added}</span>
      </div>
    </div>
  );
}

function CollapseHeader({
  collapsed,
  added,
  removed,
}: {
  collapsed: boolean;
  added: number;
  removed: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-left",
        collapsed ? "pb-2.5" : "pb-1",
      )}
    >
      <ChevronRight
        className={cn(
          "h-3 w-3 shrink-0 text-foreground-muted transition-transform",
          !collapsed && "rotate-90",
        )}
        aria-hidden
      />
      <span className="flex-1 font-mono text-[11px] text-foreground-muted">
        {collapsed ? "click to expand" : "click to collapse"}
      </span>
      <span className="shrink-0 font-mono text-[11px]">
        <span className="text-success">+{added}</span>{" "}
        <span
          className={removed ? "text-destructive" : "text-foreground-muted"}
        >
          −{removed}
        </span>
      </span>
    </div>
  );
}

// ─── Edit / Insert (replace_selection or insert_block) ──────────────────
function EditOrInsertCard({
  proposal,
  rejecting,
  defaultCollapsed,
  onAccept,
  onReject,
}: {
  proposal: AssistantProposalEdit | AssistantProposalInsert;
  rejecting: boolean;
  defaultCollapsed: boolean;
  onAccept: () => void;
  onReject: (feedback: string) => void;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [showReject, setShowReject] = React.useState(rejecting);
  React.useEffect(() => setShowReject(rejecting), [rejecting]);

  const isEdit = proposal.kind === "replace_selection";
  const removed = isEdit
    ? (proposal as AssistantProposalEdit).op.originalText
    : undefined;
  const added = isEdit
    ? (proposal as AssistantProposalEdit).op.replacementText
    : (proposal as AssistantProposalInsert).op.bodyMdx;
  const removedCount = proposal.diffStats?.removed ?? (removed ? 1 : 0);
  const addedCount =
    proposal.diffStats?.added ?? (added ? added.split("\n").length : 0);

  return (
    <CardChrome>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="block w-full bg-transparent text-left hover:bg-accent-subtle/50"
      >
        <StandardHeader
          kind={proposal.kind}
          docPath={proposal.docPath}
          locale={proposal.locale}
          validation={proposal.validation}
          dense={collapsed}
        />
        <CollapseHeader
          collapsed={collapsed}
          added={addedCount}
          removed={removedCount}
        />
      </button>
      {!collapsed && (
        <div className="px-3 pb-3">
          <DiffBody
            removed={removed}
            added={added}
            emptyLeftLabel="(no existing content — new block)"
          />
        </div>
      )}
      {showReject ? (
        <RejectFeedback
          onCancel={() => setShowReject(false)}
          onSend={(feedback) => {
            onReject(feedback);
            setShowReject(false);
          }}
        />
      ) : (
        <Footer
          contentInvalidated={proposal.contentInvalidated}
          validation={proposal.validation}
          onAccept={onAccept}
          onReject={() => setShowReject(true)}
        />
      )}
    </CardChrome>
  );
}

// ─── Create document ────────────────────────────────────────────────────
function CreateCard({
  proposal,
  rejecting,
  onAccept,
  onReject,
}: {
  proposal: AssistantProposalCreate;
  rejecting: boolean;
  onAccept: () => void;
  onReject: (feedback: string) => void;
}) {
  const [showReject, setShowReject] = React.useState(rejecting);
  React.useEffect(() => setShowReject(rejecting), [rejecting]);

  const hasBody = Boolean(
    proposal.op.bodyPreview && proposal.op.bodyPreview.trim(),
  );
  const isInvalid = proposal.validation.status === "invalid";

  return (
    <CardChrome>
      <StandardHeader
        kind={proposal.kind}
        docPath={proposal.docPath}
        locale={proposal.locale}
        validation={proposal.validation}
      />
      <div className="space-y-3 px-3 py-3">
        {!hasBody && !isInvalid && (
          <div className="text-[13px] text-foreground">Create new document</div>
        )}
        {Object.keys(proposal.op.frontmatter).length > 0 && (
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-divider/60 bg-background-subtle px-3 py-2.5">
            {Object.entries(proposal.op.frontmatter).map(([k, v]) => (
              <React.Fragment key={k}>
                <div className="font-mono text-[10px] tracking-wide text-foreground-muted">
                  {k}
                </div>
                <div className="text-[12px] text-foreground">
                  {Array.isArray(v)
                    ? v.map((t) => `#${t}`).join(" ")
                    : String(v)}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
        {hasBody && !isInvalid && (
          <div className="relative max-h-36 overflow-hidden rounded-md border border-divider/60 bg-background-subtle px-3 py-2.5 font-mono text-[11.5px] leading-snug text-foreground-muted">
            <pre className="whitespace-pre-wrap break-words font-mono">
              {proposal.op.bodyPreview}
            </pre>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-background-subtle to-transparent" />
          </div>
        )}
        {!isInvalid &&
          proposal.validation.status === "valid" &&
          proposal.validation.checks && (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {proposal.validation.checks.map((c, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 text-[11.5px] text-foreground-muted"
                >
                  <Check className="h-3 w-3 text-success" aria-hidden />
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        {proposal.validation.status === "invalid" && (
          <div className="space-y-2.5">
            <DiffBody
              added={proposal.op.bodyPreview || "(empty body)"}
              emptyLeftLabel="(no existing content — new document)"
            />
            <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              {proposal.validation.errors.map((e, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-foreground">
                  <span className="shrink-0 font-mono text-[10px] text-destructive">
                    {e.code}
                  </span>
                  <span className="flex-1">{e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {showReject ? (
        <RejectFeedback
          onCancel={() => setShowReject(false)}
          onSend={(feedback) => {
            onReject(feedback);
            setShowReject(false);
          }}
        />
      ) : (
        <Footer
          contentInvalidated={proposal.contentInvalidated}
          validation={proposal.validation}
          onAccept={onAccept}
          onReject={() => setShowReject(true)}
        />
      )}
    </CardChrome>
  );
}

// ─── Invalid insert/edit (renders the diff + errors below) ──────────────
function InvalidInsertCard({
  proposal,
  rejecting,
  onAccept,
  onReject,
}: {
  proposal: AssistantProposalInsert;
  rejecting: boolean;
  onAccept: () => void;
  onReject: (feedback: string) => void;
}) {
  const [showReject, setShowReject] = React.useState(rejecting);
  React.useEffect(() => setShowReject(rejecting), [rejecting]);

  if (proposal.validation.status !== "invalid") return null;

  return (
    <CardChrome>
      <StandardHeader
        kind={proposal.kind}
        docPath={proposal.docPath}
        locale={proposal.locale}
        validation={proposal.validation}
      />
      <div className="space-y-2.5 px-3 py-3">
        <DiffBody
          added={proposal.op.bodyMdx}
          emptyLeftLabel="(no existing content — new block)"
        />
        <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          {proposal.validation.errors.map((e, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-foreground">
              <span className="shrink-0 font-mono text-[10px] text-destructive">
                {e.code}
              </span>
              <span className="flex-1">{e.message}</span>
            </li>
          ))}
        </ul>
      </div>
      {showReject ? (
        <RejectFeedback
          onCancel={() => setShowReject(false)}
          onSend={(feedback) => {
            onReject(feedback);
            setShowReject(false);
          }}
        />
      ) : (
        <Footer
          contentInvalidated={proposal.contentInvalidated}
          validation={proposal.validation}
          onAccept={onAccept}
          onReject={() => setShowReject(true)}
        />
      )}
    </CardChrome>
  );
}

// ─── Delete document ────────────────────────────────────────────────────
function DeleteCard({
  proposal,
  rejecting,
  onAccept,
  onReject,
}: {
  proposal: AssistantProposalDelete;
  rejecting: boolean;
  onAccept: () => void;
  onReject: (feedback: string) => void;
}) {
  const [showReject, setShowReject] = React.useState(rejecting);
  React.useEffect(() => setShowReject(rejecting), [rejecting]);

  return (
    <CardChrome>
      <StandardHeader
        kind={proposal.kind}
        docPath={proposal.docPath}
        locale={proposal.locale}
        validation={proposal.validation}
      />
      <div className="space-y-2.5 px-3 py-3">
        <div className="overflow-hidden rounded-md border border-divider/60 bg-background-subtle font-mono text-[12px]">
          <div className="flex gap-2 border-l-2 border-destructive bg-destructive/5 px-2.5 py-1 text-foreground-muted line-through">
            <span className="w-2.5 shrink-0 text-center text-foreground-muted/80">
              −
            </span>
            <span>{proposal.docPath}</span>
          </div>
        </div>
        {proposal.op.reason && (
          <p className="text-[13px] text-foreground-muted">
            {proposal.op.reason}
          </p>
        )}
        {proposal.validation.status === "valid" &&
          proposal.validation.checks && (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {proposal.validation.checks.map((c, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 text-[11.5px] text-foreground-muted"
                >
                  <Check className="h-3 w-3 text-success" aria-hidden />
                  {c.label}
                </li>
              ))}
            </ul>
          )}
      </div>
      {showReject ? (
        <RejectFeedback
          onCancel={() => setShowReject(false)}
          onSend={(feedback) => {
            onReject(feedback);
            setShowReject(false);
          }}
        />
      ) : (
        <Footer
          contentInvalidated={proposal.contentInvalidated}
          validation={proposal.validation}
          onAccept={onAccept}
          onReject={() => setShowReject(true)}
          rejectLabel="Keep"
          acceptLabel={
            <span className="inline-flex items-center gap-1.5">
              <Trash2 className="h-3 w-3" aria-hidden /> Delete document
            </span>
          }
          destructive
        />
      )}
    </CardChrome>
  );
}

export type ProposalCardProps = {
  proposal: AssistantProposal;
  /** Force reject-feedback state (used in showcases). */
  rejecting?: boolean;
  defaultCollapsed?: boolean;
  onAccept: () => void;
  /**
   * Called when the user submits the inline reject-feedback panel. The
   * feedback string is the reason the user is rejecting; an empty string
   * means a silent reject (Cancel from the panel does NOT call this).
   */
  onReject: (feedback: string) => void;
};

export function ProposalCard({
  proposal,
  rejecting = false,
  defaultCollapsed = false,
  onAccept,
  onReject,
}: ProposalCardProps) {
  if (proposal.kind === "delete_document") {
    return (
      <DeleteCard
        proposal={proposal}
        rejecting={rejecting}
        onAccept={onAccept}
        onReject={onReject}
      />
    );
  }
  if (proposal.kind === "create_document") {
    return (
      <CreateCard
        proposal={proposal}
        rejecting={rejecting}
        onAccept={onAccept}
        onReject={onReject}
      />
    );
  }
  if (
    proposal.kind === "insert_block" &&
    proposal.validation.status === "invalid"
  ) {
    return (
      <InvalidInsertCard
        proposal={proposal}
        rejecting={rejecting}
        onAccept={onAccept}
        onReject={onReject}
      />
    );
  }
  if (
    proposal.kind === "replace_selection" ||
    proposal.kind === "insert_block"
  ) {
    return (
      <EditOrInsertCard
        proposal={proposal}
        rejecting={rejecting}
        defaultCollapsed={defaultCollapsed}
        onAccept={onAccept}
        onReject={onReject}
      />
    );
  }
  // update_frontmatter falls through to a minimal renderer.
  return (
    <FrontmatterCard
      proposal={proposal}
      rejecting={rejecting}
      onAccept={onAccept}
      onReject={onReject}
    />
  );
}

function FrontmatterCard({
  proposal,
  rejecting,
  onAccept,
  onReject,
}: {
  proposal: AssistantProposal;
  rejecting: boolean;
  onAccept: () => void;
  onReject: (feedback: string) => void;
}) {
  const [showReject, setShowReject] = React.useState(rejecting);
  React.useEffect(() => setShowReject(rejecting), [rejecting]);
  // The fallthrough only renders for non-batch proposals that carry per-doc routing.
  const docPath = "docPath" in proposal ? proposal.docPath : undefined;
  const locale = "locale" in proposal ? proposal.locale : undefined;
  return (
    <CardChrome>
      <StandardHeader
        kind={proposal.kind}
        docPath={docPath ?? ""}
        locale={locale}
        validation={proposal.validation}
      />
      <div className="px-3 py-3 text-[13px] text-foreground">
        {proposal.summary}
      </div>
      {showReject ? (
        <RejectFeedback
          onCancel={() => setShowReject(false)}
          onSend={(feedback) => {
            onReject(feedback);
            setShowReject(false);
          }}
        />
      ) : (
        <Footer
          contentInvalidated={proposal.contentInvalidated}
          validation={proposal.validation}
          onAccept={onAccept}
          onReject={() => setShowReject(true)}
        />
      )}
    </CardChrome>
  );
}
