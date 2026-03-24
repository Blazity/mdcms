// @ts-nocheck
"use client";

import { useState } from "react";
import { useParams, useRouter } from "../../../../../adapters/next-navigation";
import {
  Check,
  AlertCircle,
  Send,
  MoreVertical,
  ExternalLink,
  Copy,
  FolderInput,
  History,
  Trash2,
  PanelRightClose,
  PanelRight,
} from "lucide-react";
import { Button } from "../../../../../components/ui/button";
import { Badge } from "../../../../../components/ui/badge";
import { Avatar, AvatarFallback } from "../../../../../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../../components/ui/dialog";
import { Textarea } from "../../../../../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "../../../../../components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../../../components/ui/tooltip";
import { TipTapEditor } from "../../../../../components/editor/tiptap-editor";
import { EditorSidebar } from "../../../../../components/editor/editor-sidebar";
import { PageHeader } from "../../../../../components/layout/page-header";
import {
  mockDocuments,
  mockContentTypes,
  mockUsers,
} from "../../../../../lib/mock-data";
import { cn } from "../../../../../lib/utils";

const statusConfig = {
  published: {
    label: "Published",
    className: "bg-success/10 text-success border-success/20",
  },
  draft: {
    label: "Draft",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  changed: {
    label: "Changed",
    className: "bg-warning/10 text-warning border-warning/20",
  },
};

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const typeId = params.type as string;
  const documentId = params.documentId as string;

  const contentType = mockContentTypes.find((t) => t.id === typeId);
  const document = mockDocuments.find((d) => d.id === documentId);

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [changeDescription, setChangeDescription] = useState("");
  const [selectedLocale, setSelectedLocale] = useState(
    document?.locale || "en-US",
  );

  // Simulate presence - other users viewing/editing
  const presenceUsers = mockUsers.filter((u) => u.isOnline).slice(0, 3);

  if (!contentType || !document) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground-muted mb-4">Document not found</p>
          <Button onClick={() => router.back()}>Go back</Button>
        </div>
      </div>
    );
  }

  const handleContentChange = () => {
    setSaveStatus("saving");
    // Simulate auto-save
    setTimeout(() => {
      setSaveStatus("saved");
    }, 1000);
  };

  const handlePublish = () => {
    // Simulate publish
    setPublishDialogOpen(false);
    setChangeDescription("");
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        {/* Editor Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-4">
          {/* Left side - Breadcrumb + Save status */}
          <div className="flex items-center gap-4">
            <PageHeader
              breadcrumbs={[
                { label: "Content", href: "/admin/content" },
                { label: contentType.name, href: `/admin/content/${typeId}` },
                { label: document.title },
              ]}
            />

            {/* Auto-save indicator */}
            <div className="flex items-center gap-1.5 text-sm">
              {saveStatus === "saved" && (
                <>
                  <Check className="h-4 w-4 text-success" />
                  <span className="text-foreground-muted">Saved</span>
                </>
              )}
              {saveStatus === "saving" && (
                <span className="text-foreground-muted animate-pulse">
                  Saving...
                </span>
              )}
              {saveStatus === "unsaved" && (
                <>
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <span className="text-warning">Unsaved changes</span>
                </>
              )}
            </div>
          </div>

          {/* Center - Locale switcher */}
          {contentType.localized && contentType.locales && (
            <Tabs value={selectedLocale} onValueChange={setSelectedLocale}>
              <TabsList className="bg-transparent">
                {contentType.locales.map((locale) => (
                  <TabsTrigger
                    key={locale}
                    value={locale}
                    className={cn(
                      "data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none",
                      locale !== document.locale && "border-dashed opacity-60",
                    )}
                  >
                    {locale}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Right side - Actions */}
          <div className="flex items-center gap-3">
            {/* Presence avatars */}
            <div className="flex -space-x-2">
              {presenceUsers.map((user, index) => (
                <Tooltip key={user.id}>
                  <TooltipTrigger asChild>
                    <Avatar
                      className="h-7 w-7 border-2 border-background"
                      style={{
                        borderColor: ["#FD6127", "#22C55E", "#3B82F6"][index],
                      }}
                    >
                      <AvatarFallback className="text-xs">
                        {user.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>{user.name} - viewing</TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Unpublish button (only if published) */}
            {document.status === "published" && (
              <Button variant="ghost" size="sm">
                Unpublish
              </Button>
            )}

            {/* Status badge */}
            <Badge
              variant="outline"
              className={cn("text-xs", statusConfig[document.status].className)}
            >
              {statusConfig[document.status].label}
            </Badge>

            {/* Publish button */}
            <Button
              className="bg-accent hover:bg-accent-hover text-white"
              onClick={() => setPublishDialogOpen(true)}
            >
              <Send className="mr-2 h-4 w-4" />
              Publish
            </Button>

            {/* More actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View published version
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate document
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <FolderInput className="mr-2 h-4 w-4" />
                  Move / Rename
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <History className="mr-2 h-4 w-4" />
                  Version history
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sidebar toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  {sidebarOpen ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRight className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Editor area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl">
              <TipTapEditor onChange={handleContentChange} />
            </div>
          </div>

          {/* Sidebar */}
          {sidebarOpen && (
            <div className="w-80 shrink-0">
              <EditorSidebar document={document} />
            </div>
          )}
        </div>

        {/* Publish Dialog */}
        <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish document</DialogTitle>
              <DialogDescription>
                This will create a new published version visible through the
                content API.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Change summary (optional)
                </label>
                <Textarea
                  placeholder="Describe what changed..."
                  value={changeDescription}
                  onChange={(e) => setChangeDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <p className="text-sm text-foreground-muted">
                Current version: 4 → New version: 5
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setPublishDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-accent hover:bg-accent-hover text-white"
                onClick={handlePublish}
              >
                Publish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
