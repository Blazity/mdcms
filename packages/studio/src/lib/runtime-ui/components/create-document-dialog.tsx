"use client";

import { useState, useEffect } from "react";
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
  onSubmit: (input: { path: string; locale?: string }) => void;
};

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
  const prefix = typeDirectory.endsWith("/")
    ? typeDirectory
    : `${typeDirectory}/`;
  const [path, setPath] = useState(prefix);
  const [locale, setLocale] = useState<string | undefined>(locales?.[0]);

  useEffect(() => {
    if (isOpen) {
      setPath(prefix);
      setLocale(locales?.[0]);
    }
  }, [isOpen, prefix, locales]);

  const canSubmit =
    path.trim().length > 0 &&
    !isSubmitting &&
    (!localized || (locales && locales.length > 0 && !!locale));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      path: path.trim(),
      locale: localized ? locale : undefined,
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
              <Label htmlFor="doc-path">Path</Label>
              <Input
                id="doc-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={`${prefix}my-document`}
                disabled={isSubmitting}
              />
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
