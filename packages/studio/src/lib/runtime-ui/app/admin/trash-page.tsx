// @ts-nocheck
import { Trash2 } from "lucide-react";

import { ComingSoon } from "../../components/coming-soon";
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
} from "../../components/layout/page-header";

export default function TrashPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>Trash</PageHeaderHeading>
          <PageHeaderDescription>
            Review and restore deleted content.
          </PageHeaderDescription>
        </div>
      </PageHeader>
      <ComingSoon
        icon={Trash2}
        title="Trash"
        description="Browse deleted content, inspect removal history, and restore entries when recovery is needed."
        features={[
          "Soft-delete recovery queue",
          "Restore actions with audit context",
          "Permanent delete safeguards",
          "Search and filter deleted entries",
          "Environment-aware recovery workflows",
        ]}
      />
    </div>
  );
}
