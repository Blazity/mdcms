"use client";

import { Streamdown } from "streamdown";

import { cn } from "../../lib/utils.js";

export type AssistantMarkdownProps = {
  text: string;
  /**
   * When true, Streamdown runs in streaming mode and patches unfinished
   * markdown (open emphasis markers, unterminated code fences) so a
   * mid-stream chunk renders sensibly instead of leaking raw `**` or
   * `\`\`\`` into the output. Default `true` because every assistant
   * turn we render is potentially mid-stream.
   */
  streaming?: boolean;
  className?: string;
};

/**
 * Markdown surface for assistant prose. Wraps `streamdown` (the
 * library AI SDK Elements uses under the hood) with the chat
 * bubble's typography scale and the Studio's `prose` theme, so the
 * default headings, lists, blockquotes, tables, and fenced code
 * blocks all pick up the same hue/border tokens the rest of the UI
 * uses.
 *
 * The `prose-sm` size class drops the body to 14px to match the
 * existing chat-bubble text size (the bubble was already
 * `text-[13.5px]`; `prose-sm` resolves to ~13.5–14px depending on
 * the override). `max-w-none` opts out of the typography plugin's
 * default 65-char ceiling so the markdown fills the bubble width.
 */
export function AssistantMarkdown({
  text,
  streaming = true,
  className,
}: AssistantMarkdownProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-[13.5px] leading-relaxed text-foreground",
        // Tighten the typography defaults so a single-paragraph reply
        // doesn't get the same top/bottom margin a long-form blog
        // post would. Chat bubbles aren't articles.
        "[&_p]:my-1 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-2",
        className,
      )}
    >
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        parseIncompleteMarkdown={streaming}
      >
        {text}
      </Streamdown>
    </div>
  );
}
