"use client";

import { useState } from "react";
import { Copy, Globe, Sparkles } from "lucide-react";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import { Label } from "../ui/label.js";
import { Switch } from "../ui/switch.js";
import { Badge } from "../ui/badge.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.js";
import { Calendar } from "../ui/calendar.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.js";
import { Avatar, AvatarFallback } from "../ui/avatar.js";
import { ScrollArea } from "../ui/scroll-area.js";
import { Separator } from "../ui/separator.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";
import { format } from "date-fns";
import { cn } from "../../lib/utils.js";
import { mockUsers, type Document } from "../../lib/mock-data.js";

interface EditorSidebarProps {
  document: Document;
  mdxPropsPanel?: React.ReactNode;
}

export function EditorSidebar({ document, mdxPropsPanel }: EditorSidebarProps) {
  const [publishDate, setPublishDate] = useState<Date | undefined>(new Date());
  const [formData, setFormData] = useState({
    title: document.title,
    slug: document.path.split("/").pop() || "",
    excerpt:
      "A brief description of this blog post that will appear in search results and social media previews.",
    featured: false,
    author: document.author.id,
    tags: ["technology", "tutorial"],
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col border-l border-border bg-background">
        <Tabs defaultValue="fields" className="flex h-full flex-col">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto">
            <TabsTrigger
              value="fields"
              className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Fields
            </TabsTrigger>
            <TabsTrigger
              value="info"
              className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Info
            </TabsTrigger>
            <TabsTrigger
              value="seo"
              className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent text-foreground-muted"
              disabled
            >
              SEO
              <Badge variant="outline" className="ml-2 text-[10px]">
                Soon
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Fields Tab */}
          <TabsContent value="fields" className="flex-1 mt-0">
            <ScrollArea className="h-[calc(100vh-180px)]">
              <div className="space-y-6 p-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="flex items-center gap-1">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="Document title"
                  />
                </div>

                {/* Slug */}
                <div className="space-y-2">
                  <Label htmlFor="slug" className="flex items-center gap-1">
                    Slug <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({ ...formData, slug: e.target.value })
                    }
                    placeholder="url-friendly-slug"
                    className="font-mono text-sm"
                  />
                </div>

                {/* Excerpt */}
                <div className="space-y-2">
                  <Label
                    htmlFor="excerpt"
                    className="flex items-center justify-between"
                  >
                    <span>Excerpt</span>
                    <span className="text-xs text-foreground-muted">
                      {formData.excerpt.length}/500
                    </span>
                  </Label>
                  <Textarea
                    id="excerpt"
                    value={formData.excerpt}
                    onChange={(e) =>
                      setFormData({ ...formData, excerpt: e.target.value })
                    }
                    placeholder="A brief description..."
                    rows={3}
                    maxLength={500}
                  />
                </div>

                {/* Publish Date */}
                <div className="space-y-2">
                  <Label>Publish Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-left font-normal"
                      >
                        {publishDate
                          ? format(publishDate, "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={publishDate}
                        onSelect={setPublishDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Author */}
                <div className="space-y-2">
                  <Label htmlFor="author" className="flex items-center gap-1">
                    Author <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.author}
                    onValueChange={(value) =>
                      setFormData({ ...formData, author: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select author" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-xs">
                                {user.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </AvatarFallback>
                            </Avatar>
                            {user.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="default"
                        className="cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            tags: formData.tags.filter((t) => t !== tag),
                          })
                        }
                      >
                        {tag}
                        <span className="ml-1 text-foreground-muted">×</span>
                      </Badge>
                    ))}
                  </div>
                  <Input
                    placeholder="Add tag and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const input = e.currentTarget;
                        const value = input.value.trim();
                        if (value && !formData.tags.includes(value)) {
                          setFormData({
                            ...formData,
                            tags: [...formData.tags, value],
                          });
                          input.value = "";
                        }
                      }
                    }}
                  />
                </div>

                {/* Featured */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="featured">Featured</Label>
                    <p className="text-xs text-foreground-muted">
                      Show on homepage
                    </p>
                  </div>
                  <Switch
                    id="featured"
                    checked={formData.featured}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, featured: checked })
                    }
                  />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info" className="flex-1 mt-0">
            <ScrollArea className="h-[calc(100vh-180px)]">
              <div className="space-y-4 p-4">
                {/* Document ID */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground-muted">
                    Document ID
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-background-subtle px-2 py-1 text-xs font-mono">
                      {document.id}
                    </code>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copyToClipboard(document.id)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy ID</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Translation Group ID */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground-muted">
                    Translation Group ID
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-background-subtle px-2 py-1 text-xs font-mono">
                      tg-{document.id}-main
                    </code>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            copyToClipboard(`tg-${document.id}-main`)
                          }
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy ID</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Path */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground-muted">Path</Label>
                  <code className="block rounded bg-background-subtle px-2 py-1 text-xs font-mono">
                    {document.path}
                  </code>
                </div>

                <Separator />

                {/* Schema Type */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-foreground-muted">
                    Schema Type
                  </Label>
                  <span className="text-sm">{document.type}</span>
                </div>

                {/* Content Format */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-foreground-muted">
                    Content Format
                  </Label>
                  <Badge variant="outline">mdx</Badge>
                </div>

                {/* Locale */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-foreground-muted">
                    Locale
                  </Label>
                  <Badge variant="outline" className="gap-1">
                    <Globe className="h-3 w-3" />
                    {document.locale}
                  </Badge>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-foreground-muted">
                    Status
                  </Label>
                  <Badge
                    variant="outline"
                    className={cn(
                      document.status === "published" &&
                        "bg-success/10 text-success border-success/20",
                      document.status === "draft" &&
                        "bg-warning/10 text-warning border-warning/20",
                      document.status === "changed" &&
                        "bg-warning/10 text-warning border-warning/20",
                    )}
                  >
                    {document.status === "published"
                      ? "Published"
                      : document.status === "draft"
                        ? "Draft"
                        : "Has changes"}
                  </Badge>
                </div>

                <Separator />

                {/* Published Version */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-foreground-muted">
                    Published Version
                  </Label>
                  <span className="text-sm">
                    {document.status === "published" ? "v5" : "Not published"}
                  </span>
                </div>

                {/* Draft Revision */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-foreground-muted">
                    Draft Revision
                  </Label>
                  <span className="text-sm">12</span>
                </div>

                <Separator />

                {/* Created by */}
                <div className="space-y-2">
                  <Label className="text-xs text-foreground-muted">
                    Created by
                  </Label>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {document.author.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm">{document.author.name}</p>
                      <p className="text-xs text-foreground-muted">
                        {format(document.createdAt, "PPP")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Last updated by */}
                <div className="space-y-2">
                  <Label className="text-xs text-foreground-muted">
                    Last updated by
                  </Label>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {document.author.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm">{document.author.name}</p>
                      <p className="text-xs text-foreground-muted">
                        {format(document.updatedAt, "PPP")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* SEO Tab (Coming Soon) */}
          <TabsContent value="seo" className="flex-1 mt-0">
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="mb-4 rounded-full bg-primary/10 p-3">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold">SEO Analysis</h3>
              <p className="text-sm text-foreground-muted max-w-xs">
                AI-powered SEO suggestions and analysis coming soon.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {mdxPropsPanel ? (
          <div className="border-t border-border bg-background px-4 py-3">
            {mdxPropsPanel}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
