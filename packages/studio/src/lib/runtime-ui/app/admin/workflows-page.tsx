// @ts-nocheck
import { GitBranch } from "lucide-react";
import { ComingSoon } from "../../components/coming-soon";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
} from "../../components/layout/page-header";

export default function WorkflowsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>Workflows</PageHeaderHeading>
          <PageHeaderDescription>
            Automate content review and publishing processes
          </PageHeaderDescription>
        </div>
      </PageHeader>
      <ComingSoon
        icon={GitBranch}
        title="Workflows"
        description="Create automated content workflows with approval chains, scheduled publishing, and custom triggers to streamline your editorial process."
        features={[
          "Multi-step approval workflows",
          "Role-based review assignments",
          "Scheduled content publishing",
          "Webhook triggers and notifications",
          "Audit trail and compliance tracking",
        ]}
      />
    </div>
  );
}
