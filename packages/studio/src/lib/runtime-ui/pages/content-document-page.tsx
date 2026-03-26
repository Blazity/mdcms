// @ts-nocheck
"use client";

import { useState } from "react";

import type { StudioMountContext } from "@mdcms/shared";

import { useParams, useRouter } from "../adapters/next-navigation";
import { EditorSidebar } from "../components/editor/editor-sidebar";
import {
  MdxPropsPanel,
  type MdxPropsPanelSelection,
} from "../components/editor/mdx-props-panel";
import { TipTapEditor } from "../components/editor/tiptap-editor";
import { PageHeader } from "../components/layout/page-header";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  currentUser,
  mockContentTypes,
  mockDocuments,
  mockUsers,
} from "../lib/mock-data";
import { cn } from "../lib/utils";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  FolderInput,
  History,
  MoreVertical,
  PanelRight,
  PanelRightClose,
  Send,
  Trash2,
} from "lucide-react";

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

export default function ContentDocumentPage({
  context,
}: {
  context?: StudioMountContext;
}) {
  const params = useParams();
  const router = useRouter();
  const typeId = params.type as string;
  const documentId = params.documentId as string;

  const contentType = mockContentTypes.find((type) => type.id === typeId);
  const document = mockDocuments.find((entry) => entry.id === documentId);

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [changeDescription, setChangeDescription] = useState("");
  const [selectedLocale, setSelectedLocale] = useState(
    document?.locale || "en-US",
  );
  const [draftBody, setDraftBody] = useState(document?.body ?? "");
  const [activeMdxComponent, setActiveMdxComponent] =
    useState<MdxPropsPanelSelection | null>(null);
  const isDocumentReadOnly = currentUser.role === "viewer";
  const isDocumentForbidden = currentUser.role === "viewer";

  const presenceUsers = mockUsers.filter((user) => user.isOnline).slice(0, 3);

  if (!contentType || !document) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-foreground-muted">Document not found</p>
          <Button onClick={() => router.back()}>Go back</Button>
        </div>
      </div>
    );
  }

  const handleContentChange = (nextBody: string) => {
    setDraftBody(nextBody);
    setSaveStatus("saving");

    setTimeout(() => {
      setSaveStatus("saved");
    }, 1000);
  };

  const handlePublish = () => {
    setPublishDialogOpen(false);
    setChangeDescription("");
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex items-center gap-4">
            <PageHeader
              breadcrumbs={[
                { label: "Content", href: "/admin/content" },
                { label: contentType.name, href: `/admin/content/${typeId}` },
                { label: document.title },
              ]}
            />

            <div className="flex items-center gap-1.5 text-sm">
              {saveStatus === "saved" ? (
                <>
                  <Check className="h-4 w-4 text-success" />
                  <span className="text-foreground-muted">Saved</span>
                </>
              ) : null}
              {saveStatus === "saving" ? (
                <span className="animate-pulse text-foreground-muted">
                  Saving...
                </span>
              ) : null}
              {saveStatus === "unsaved" ? (
                <>
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <span className="text-warning">Unsaved changes</span>
                </>
              ) : null}
            </div>
          </div>

          {contentType.localized && contentType.locales ? (
            <Tabs value={selectedLocale} onValueChange={setSelectedLocale}>
              <TabsList className="bg-transparent">
                {contentType.locales.map((locale) => (
                  <TabsTrigger
                    key={locale}
                    value={locale}
                    className={cn(
                      "rounded-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:bg-transparent",
                      locale !== document.locale && "border-dashed opacity-60",
                    )}
                  >
                    {locale}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}

          <div className="flex items-center gap-3">
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
                          .map((name) => name[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>{user.name} - viewing</TooltipContent>
                </Tooltip>
              ))}
            </div>

            {document.status === "published" ? (
              <Button variant="ghost" size="sm">
                Unpublish
              </Button>
            ) : null}

            <Badge
              variant="outline"
              className={cn("text-xs", statusConfig[document.status].className)}
            >
              {statusConfig[document.status].label}
            </Badge>

            <Button
              className="bg-accent text-white hover:bg-accent-hover"
              onClick={() => setPublishDialogOpen(true)}
            >
              <Send className="mr-2 h-4 w-4" />
              Publish
            </Button>

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

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl">
              <TipTapEditor
                content={draftBody}
                context={context}
                onChange={handleContentChange}
                onActiveMdxComponentChange={setActiveMdxComponent}
                readOnly={isDocumentReadOnly}
                forbidden={isDocumentForbidden}
              />
            </div>
          </div>

          {sidebarOpen ? (
            <div className="w-80 shrink-0">
              <EditorSidebar
                document={document}
                mdxPropsPanel={
                  context?.mdx ? (
                    <MdxPropsPanel
                      context={context}
                      selection={activeMdxComponent}
                    />
                  ) : undefined
                }
              />
            </div>
          ) : null}
        </div>

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
                  onChange={(event) => setChangeDescription(event.target.value)}
                  rows={3}
                />
              </div>
              <p className="text-sm text-foreground-muted">
                Current version: 4 - New version: 5
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
                className="bg-accent text-white hover:bg-accent-hover"
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
