"use client";

import { Image } from "lucide-react";
import { ComingSoon } from "../../components/coming-soon.js";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
} from "../../components/layout/page-header.js";

export default function MediaPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>Media</PageHeaderHeading>
          <PageHeaderDescription>
            Media management for your content
          </PageHeaderDescription>
        </div>
      </PageHeader>
      <ComingSoon
        icon={Image}
        title="Media Library"
        description="A dedicated space for managing images, files, and other media assets used across your content."
      />
    </div>
  );
}
