import { Terminal } from "lucide-react";
import { ComingSoon } from "../../components/coming-soon.js";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
} from "../../components/layout/page-header.js";

export default function ApiPlaygroundPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>API Playground</PageHeaderHeading>
          <PageHeaderDescription>
            Explore your content API
          </PageHeaderDescription>
        </div>
      </PageHeader>
      <ComingSoon
        icon={Terminal}
        title="API Playground"
        description="An interactive environment for testing and exploring your content API endpoints."
      />
    </div>
  );
}
