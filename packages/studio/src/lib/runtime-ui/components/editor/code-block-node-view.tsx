"use client";

import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";
import { cn } from "../../lib/utils.js";
import {
  COMMON_CODE_BLOCK_LANGUAGES,
  PLAIN_TEXT_LANGUAGE_VALUE,
  getCodeBlockLanguageLabel,
  isKnownCodeBlockLanguage,
  resolveCodeBlockLanguageChange,
} from "./code-block-languages.js";

interface CodeBlockLanguageSelectProps {
  language: string | null | undefined;
  disabled: boolean;
  onChange: (patch: { language: string | null }) => void;
}

export function CodeBlockLanguageSelect({
  language,
  disabled,
  onChange,
}: CodeBlockLanguageSelectProps) {
  const currentValue =
    language && language.length > 0 ? language : PLAIN_TEXT_LANGUAGE_VALUE;
  const isUnknown =
    typeof language === "string" &&
    language.length > 0 &&
    !isKnownCodeBlockLanguage(language);
  const label = getCodeBlockLanguageLabel(language ?? null);

  return (
    <Select
      value={currentValue}
      onValueChange={(next) => onChange(resolveCodeBlockLanguageChange(next))}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        data-mdcms-code-block-language-select=""
        data-unknown-language={isUnknown ? "true" : undefined}
        className={cn(
          "h-6 w-auto min-w-[8rem] gap-1 border-border/60 bg-background/80 px-2 text-xs font-medium text-foreground-muted shadow-sm",
          isUnknown && "text-warning",
        )}
        aria-label={
          isUnknown
            ? `Code block language: ${label} (not registered)`
            : "Code block language"
        }
      >
        <SelectValue placeholder={label} aria-label={label}>
          {label}
          {isUnknown ? (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-warning">
              not registered
            </span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={PLAIN_TEXT_LANGUAGE_VALUE}>Plain text</SelectItem>
        {COMMON_CODE_BLOCK_LANGUAGES.map((entry) => (
          <SelectItem key={entry.id} value={entry.id}>
            {entry.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CodeBlockNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const rawLanguage = node.attrs.language;
  const language =
    typeof rawLanguage === "string" && rawLanguage.length > 0
      ? rawLanguage
      : null;
  const disabled = !editor.isEditable;

  return (
    <NodeViewWrapper
      as="div"
      className="relative my-4"
      data-mdcms-code-block-kind={language ? "tagged" : "plain"}
    >
      <div
        className="absolute right-2 top-2 z-10"
        contentEditable={false}
        suppressContentEditableWarning
      >
        <CodeBlockLanguageSelect
          language={language}
          disabled={disabled}
          onChange={(patch) => updateAttributes(patch)}
        />
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-background-subtle py-3 pl-4 pr-28 font-mono text-[0.85rem] leading-relaxed">
        <NodeViewContent as="code" className="hljs" />
      </pre>
    </NodeViewWrapper>
  );
}
