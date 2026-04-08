"use client";

import { Image } from "lucide-react";
import { ComingSoon } from "../../components/coming-soon.js";
import { PageHeader } from "../../components/layout/page-header.js";

export default function MediaPage() {
  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Media" }]} />
      <div className="p-6">
        <ComingSoon
          icon={Image}
          title="Media Library"
          description="A dedicated space for managing images, files, and other media assets used across your content."
        />
      </div>
    </div>
  );
}
