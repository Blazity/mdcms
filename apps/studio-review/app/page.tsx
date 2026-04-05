import Link from "next/link";

const reviewScenarios = [
  {
    id: "editor",
    title: "Editor Document Review",
    description:
      "Standard editor permissions with the document route loaded for visual review.",
    href: "/review/editor/admin/content/post/11111111-1111-4111-8111-111111111111",
  },
  {
    id: "owner",
    title: "Owner Navigation Review",
    description:
      "Full management capabilities with schema and settings surfaces visible.",
    href: "/review/owner/admin",
  },
  {
    id: "viewer",
    title: "Viewer Access Review",
    description:
      "Read-only shell state for validating restricted navigation and controls.",
    href: "/review/viewer/admin",
  },
] as const;

export default function HomePage() {
  return (
    <main>
      <h1>Studio Review</h1>
      <p>Private deterministic preview routes for Studio PR review.</p>
      <ul>
        {reviewScenarios.map((scenario) => (
          <li key={scenario.id}>
            <Link href={scenario.href}>{scenario.title}</Link>
            <p>{scenario.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
