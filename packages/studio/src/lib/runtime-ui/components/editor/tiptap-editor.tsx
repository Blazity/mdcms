// @ts-nocheck
"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  Bold,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";

interface TipTapEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
}

const defaultContent = `
<h1>Hello World</h1>
<p>This is a sample blog post created in MDCMS Studio. You can edit this content using the rich text editor.</p>
<h2>Getting Started</h2>
<p>The editor supports various formatting options including <strong>bold</strong>, <em>italic</em>, <u>underline</u>, and <code>inline code</code>.</p>
<h3>Lists</h3>
<ul>
  <li>First item</li>
  <li>Second item</li>
  <li>Third item</li>
</ul>
<h3>Code Blocks</h3>
<pre><code>const greeting = "Hello, World!";
console.log(greeting);</code></pre>
<blockquote>
  <p>This is a blockquote. You can use it to highlight important information.</p>
</blockquote>
<p>Continue writing your content here...</p>
`;

type ToolbarButtonProps = {
  icon: ReactNode;
  label: string;
  active?: boolean;
};

function ToolbarButton({ icon, label, active = false }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={`${label} (mock)`}
      className={cn("h-8 w-8 p-0", active && "bg-accent-subtle text-accent")}
    >
      {icon}
    </Button>
  );
}

export function TipTapEditor({
  content = defaultContent,
  onChange,
  placeholder = "Start writing, or press / for commands...",
}: TipTapEditorProps) {
  const [draftContent, setDraftContent] = useState(content);

  useEffect(() => {
    setDraftContent(content);
  }, [content]);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-background-subtle p-1">
        <ToolbarButton icon={<Undo className="h-4 w-4" />} label="Undo" />
        <ToolbarButton icon={<Redo className="h-4 w-4" />} label="Redo" />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarButton icon={<Bold className="h-4 w-4" />} label="Bold" />
        <ToolbarButton icon={<Italic className="h-4 w-4" />} label="Italic" />
        <ToolbarButton
          icon={<UnderlineIcon className="h-4 w-4" />}
          label="Underline"
        />
        <ToolbarButton
          icon={<Strikethrough className="h-4 w-4" />}
          label="Strikethrough"
        />
        <ToolbarButton
          icon={<Code className="h-4 w-4" />}
          label="Inline code"
        />
        <ToolbarButton
          icon={<Highlighter className="h-4 w-4" />}
          label="Highlight"
          active
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarButton
          icon={<Heading1 className="h-4 w-4" />}
          label="Heading 1"
        />
        <ToolbarButton
          icon={<Heading2 className="h-4 w-4" />}
          label="Heading 2"
        />
        <ToolbarButton
          icon={<List className="h-4 w-4" />}
          label="Bulleted list"
        />
        <ToolbarButton
          icon={<ListOrdered className="h-4 w-4" />}
          label="Numbered list"
        />
        <ToolbarButton icon={<Quote className="h-4 w-4" />} label="Quote" />
        <ToolbarButton
          icon={<FileCode className="h-4 w-4" />}
          label="Code block"
        />
        <ToolbarButton
          icon={<ImageIcon className="h-4 w-4" />}
          label="Insert image"
        />
        <ToolbarButton
          icon={<LinkIcon className="h-4 w-4" />}
          label="Insert link"
        />

        <div className="ml-auto">
          <Badge variant="outline" className="bg-background">
            Mock editor
          </Badge>
        </div>
      </div>

      <div className="border-b border-border bg-background px-4 py-2 text-xs text-foreground-muted">
        Rich text actions are stubbed in this runtime port. The surface is here
        so the admin route set matches the mock before backend and editor
        wiring.
      </div>

      <Textarea
        value={draftContent}
        onChange={(event) => {
          const nextContent = event.target.value;
          setDraftContent(nextContent);
          onChange?.(nextContent);
        }}
        placeholder={placeholder}
        className="min-h-[480px] resize-none rounded-none border-0 bg-transparent px-4 py-4 font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
