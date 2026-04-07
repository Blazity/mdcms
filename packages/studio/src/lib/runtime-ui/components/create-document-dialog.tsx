"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.js";

export type CreateDocumentDialogProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  error?: string;
  typeDirectory: string;
  localized: boolean;
  locales?: string[];
  onClose: () => void;
  onSubmit: (input: { path: string; locale?: string; title: string }) => void;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateDocumentDialog({
  isOpen,
  isSubmitting,
  error,
  typeDirectory,
  localized,
  locales,
  onClose,
  onSubmit,
}: CreateDocumentDialogProps) {
  const prefix = useMemo(
    () => (typeDirectory.endsWith("/") ? typeDirectory : `${typeDirectory}/`),
    [typeDirectory],
  );
  const [title, setTitle] = useState("");
  const [pathEdited, setPathEdited] = useState(false);
  const [path, setPath] = useState(prefix);
  const [locale, setLocale] = useState<string | undefined>(locales?.[0]);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setPath(prefix);
      setPathEdited(false);
      setLocale(locales?.[0]);
    }
  }, [isOpen, prefix, locales]);

  // Auto-derive path from title unless user manually edited it
  useEffect(() => {
    if (!pathEdited && title) {
      setPath(`${prefix}${slugify(title)}`);
    } else if (!pathEdited && !title) {
      setPath(prefix);
    }
  }, [title, prefix, pathEdited]);

  const slug = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  const hasValidSlug = slug.trim().length > 0 && !slug.endsWith("/");
  const needsLocale = localized && locales && locales.length > 0;
  const canSubmit =
    title.trim().length > 0 &&
    hasValidSlug &&
    !isSubmitting &&
    (!needsLocale || !!locale);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      path: path.trim(),
      locale: localized ? locale : undefined,
      title: title.trim(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My new document"
                disabled={isSubmitting}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-path">
                Path
                <span className="ml-1 text-xs text-foreground-muted font-normal">
                  (auto-generated)
                </span>
              </Label>
              <Input
                id="doc-path"
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setPathEdited(true);
                }}
                placeholder={`${prefix}my-document`}
                disabled={isSubmitting}
              />
              {!hasValidSlug && path.length > 0 && (
                <p className="text-xs text-foreground-muted">
                  Path needs a document name after the directory prefix.
                </p>
              )}
            </div>
            {localized && locales && locales.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="doc-locale">Locale</Label>
                <Select
                  value={locale}
                  onValueChange={setLocale}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="doc-locale">
                    <SelectValue placeholder="Select locale" />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-accent hover:bg-accent-hover text-white"
              disabled={!canSubmit}
            >
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
