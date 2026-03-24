// @ts-nocheck
import { Database } from "lucide-react";
import { ComingSoon } from "../../components/coming-soon";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
} from "../../components/layout/page-header";

export default function SchemaBuilderPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>Schema Builder</PageHeaderHeading>
          <PageHeaderDescription>
            Define and manage your content types and data models
          </PageHeaderDescription>
        </div>
      </PageHeader>
      <ComingSoon
        icon={Database}
        title="Schema Builder"
        description="Design your content architecture with our visual schema builder. Create custom content types, define relationships, and manage field configurations."
        features={[
          "Visual drag-and-drop schema designer",
          "20+ field types including rich text, media, and references",
          "Content type inheritance and composition",
          "Validation rules and default values",
          "Schema versioning and migrations",
        ]}
      />
    </div>
  );
}
