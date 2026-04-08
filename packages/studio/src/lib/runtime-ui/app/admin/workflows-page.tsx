import { GitBranch } from "lucide-react";
import { ComingSoon } from "../../components/coming-soon.js";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
} from "../../components/layout/page-header.js";

export default function WorkflowsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>Workflows</PageHeaderHeading>
          <PageHeaderDescription>
            Content review and publishing workflows
          </PageHeaderDescription>
        </div>
      </PageHeader>
      <ComingSoon
        icon={GitBranch}
        title="Workflows"
        description="Define review and approval steps for your content before it gets published."
      />
    </div>
  );
}
