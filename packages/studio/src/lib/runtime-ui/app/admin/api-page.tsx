import { Terminal } from "lucide-react";
import { ComingSoon } from "../../components/coming-soon.js";
import { PageHeader } from "../../components/layout/page-header.js";

export default function ApiPlaygroundPage() {
  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "API" }]} />
      <div className="p-6">
        <ComingSoon
          icon={Terminal}
          title="API Playground"
          description="An interactive environment for testing and exploring your content API endpoints."
        />
      </div>
    </div>
  );
}
