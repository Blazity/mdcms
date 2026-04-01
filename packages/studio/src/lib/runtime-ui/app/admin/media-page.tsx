// @ts-nocheck
"use client";

import {
  Image,
  Folder,
  Search,
  Upload,
  FileImage,
  FileVideo,
  FileAudio,
  File,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { PageHeader } from "../../components/layout/page-header";

// Mock media items for the ghosted preview
const mockMediaItems = [
  { id: "1", type: "image", name: "hero-banner.jpg" },
  { id: "2", type: "image", name: "team-photo.png" },
  { id: "3", type: "video", name: "product-demo.mp4" },
  { id: "4", type: "image", name: "logo-dark.svg" },
  { id: "5", type: "image", name: "blog-cover.jpg" },
  { id: "6", type: "audio", name: "podcast-ep1.mp3" },
  { id: "7", type: "image", name: "avatar-1.png" },
  { id: "8", type: "image", name: "avatar-2.png" },
  { id: "9", type: "document", name: "guide.pdf" },
  { id: "10", type: "image", name: "feature-1.jpg" },
  { id: "11", type: "image", name: "feature-2.jpg" },
  { id: "12", type: "image", name: "feature-3.jpg" },
];

const mockFolders = [
  { id: "1", name: "Images", count: 156 },
  { id: "2", name: "Videos", count: 23 },
  { id: "3", name: "Documents", count: 45 },
  { id: "4", name: "Audio", count: 12 },
];

const getFileIcon = (type: string) => {
  switch (type) {
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    default:
      return File;
  }
};

export default function MediaPage() {
  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Media" }]} />

      <div className="flex flex-col items-center justify-center px-6 py-16">
        {/* Coming Soon Content */}
        <div className="text-center max-w-lg mx-auto mb-12">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-accent/10 p-4">
              <Image className="h-16 w-16 text-foreground-muted" />
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mb-4">
            <h1 className="text-2xl font-semibold">Media Library</h1>
            <Badge variant="outline" className="border-accent text-accent">
              Coming Soon
            </Badge>
          </div>

          <p className="text-sm text-foreground-muted leading-relaxed">
            Browse, search, tag, and organize all your media files in one place.
            Reuse assets across documents with a powerful media management
            system.
          </p>
        </div>

        {/* Ghosted Preview Mockup */}
        <div className="w-full max-w-5xl relative">
          {/* Blur overlay */}
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 rounded-lg" />

          {/* Mockup content */}
          <div className="rounded-lg border border-border overflow-hidden opacity-40">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-border bg-background-subtle p-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                  <div className="h-9 w-64 rounded-md border border-border bg-background pl-9" />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-accent px-3 py-2 text-primary-foreground text-sm">
                <Upload className="h-4 w-4" />
                Upload
              </div>
            </div>

            {/* Main content */}
            <div className="flex">
              {/* Folder sidebar */}
              <div className="w-48 border-r border-border bg-background p-3 space-y-1">
                {mockFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <Folder className="h-4 w-4 text-foreground-muted" />
                    <span className="flex-1">{folder.name}</span>
                    <span className="text-xs text-foreground-muted">
                      {folder.count}
                    </span>
                  </div>
                ))}
              </div>

              {/* Media grid */}
              <div className="flex-1 p-4">
                <div className="grid grid-cols-4 gap-4">
                  {mockMediaItems.map((item) => {
                    const IconComponent = getFileIcon(item.type);
                    return (
                      <div
                        key={item.id}
                        className="aspect-square rounded-lg border border-border bg-background-subtle flex flex-col items-center justify-center p-4"
                      >
                        <IconComponent className="h-8 w-8 text-foreground-muted mb-2" />
                        <span className="text-xs text-foreground-muted truncate w-full text-center">
                          {item.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* GitHub link */}
        <p className="mt-8 text-sm text-foreground-muted">
          Want to help build this?{" "}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline inline-flex items-center gap-1"
          >
            Contribute on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
