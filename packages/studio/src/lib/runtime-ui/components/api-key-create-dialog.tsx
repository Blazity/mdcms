"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";
import { Badge } from "./ui/badge.js";
import { cn } from "../lib/utils.js";

import type {
  ApiKeyOperationScope,
  ApiKeyCreateInput,
  ApiKeyCreateResult,
} from "../../api-keys-api.js";
import { useStudioMountInfo } from "../app/admin/mount-info-context.js";

/* ------------------------------------------------------------------ */
/*  Scope groups for organized display                                 */
/* ------------------------------------------------------------------ */

type ScopeGroup = {
  label: string;
  scopes: ApiKeyOperationScope[];
};

const SCOPE_GROUPS: ScopeGroup[] = [
  {
    label: "Content",
    scopes: [
      "content:read",
      "content:read:draft",
      "content:write",
      "content:write:draft",
      "content:publish",
      "content:delete",
    ],
  },
  {
    label: "Schema",
    scopes: ["schema:read", "schema:write"],
  },
  {
    label: "Projects",
    scopes: ["projects:read", "projects:write"],
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export type ApiKeyCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: ApiKeyCreateInput) => Promise<ApiKeyCreateResult>;
  isSubmitting: boolean;
  error: Error | null;
};

type Step = "form" | "created";

export function ApiKeyCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
}: ApiKeyCreateDialogProps) {
  const mountInfo = useStudioMountInfo();
  const [step, setStep] = useState<Step>("form");
  const [label, setLabel] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<
    Set<ApiKeyOperationScope>
  >(new Set());
  const [createdResult, setCreatedResult] = useState<ApiKeyCreateResult | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("form");
      setLabel("");
      setSelectedScopes(new Set());
      setCreatedResult(null);
      setCopied(false);
      setExpiresAt("");
    }
  }, [open]);

  const toggleScope = useCallback((scope: ApiKeyOperationScope) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }, []);

  const canSubmit =
    label.trim().length > 0 && selectedScopes.size > 0 && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const contextAllowlist =
      mountInfo.project && mountInfo.environment
        ? [{ project: mountInfo.project, environment: mountInfo.environment }]
        : [];

    const input: ApiKeyCreateInput = {
      label: label.trim(),
      scopes: Array.from(selectedScopes),
      contextAllowlist,
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    };

    const result = await onSubmit(input);
    setCreatedResult(result);
    setStep("created");
  };

  const handleCopy = async () => {
    if (!createdResult) return;
    await navigator.clipboard.writeText(createdResult.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDismiss = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === "form" && (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create a new API key with specific permissions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Label input */}
              <div className="space-y-2">
                <Label htmlFor="api-key-label">Label</Label>
                <Input
                  id="api-key-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. CI/CD Pipeline"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              {/* Scope selection */}
              <div className="space-y-3">
                <Label>Scopes</Label>
                {SCOPE_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.scopes.map((scope) => {
                        const isSelected = selectedScopes.has(scope);
                        return (
                          <button
                            key={scope}
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => toggleScope(scope)}
                          >
                            <Badge
                              variant={isSelected ? "default" : "outline"}
                              className={cn(
                                "cursor-pointer select-none",
                                isSubmitting && "opacity-50 cursor-not-allowed",
                              )}
                            >
                              {scope}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Expiration date */}
              <div className="space-y-2">
                <Label htmlFor="api-key-expires">Expires</Label>
                <Input
                  id="api-key-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  disabled={isSubmitting}
                  min={new Date().toISOString().split("T")[0]}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty for no expiration.
                </p>
              </div>

              {/* Error display */}
              {error && (
                <p className="text-sm text-destructive">{error.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleDismiss}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-accent hover:bg-accent-hover text-white"
                disabled={!canSubmit}
              >
                {isSubmitting ? "Creating..." : "Create API Key"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "created" && createdResult && (
          <div>
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
              <DialogDescription>
                Copy your API key now. You will not be able to see it again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono break-all">
                    {createdResult.key}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <Check className="size-4 text-green-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                className="bg-accent hover:bg-accent-hover text-white"
                onClick={handleDismiss}
              >
                I've saved this key
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
