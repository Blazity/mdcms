// @ts-nocheck
import { Terminal } from "lucide-react";
import { ComingSoon } from "../../components/coming-soon";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
} from "../../components/layout/page-header";

export default function ApiPlaygroundPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>API Playground</PageHeaderHeading>
          <PageHeaderDescription>
            Explore and test your content API endpoints
          </PageHeaderDescription>
        </div>
      </PageHeader>
      <ComingSoon
        icon={Terminal}
        title="API Playground"
        description="Test and explore your content API with an interactive playground. Generate queries, preview responses, and create code snippets for your applications."
        features={[
          "Interactive GraphQL and REST explorer",
          "Auto-generated query builder",
          "Response previews with syntax highlighting",
          "Code generation for popular frameworks",
          "API key management and testing",
        ]}
      />
    </div>
  );
}
