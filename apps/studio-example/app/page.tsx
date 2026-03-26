import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Sample Host App</h1>
      <p>Open /admin to load the MDCMS Studio embed shell.</p>
      <p>
        Demo routes: <Link href="/admin">/admin</Link>
      </p>
      <p>
        <Link href="/demo/content">Raw Content API</Link>
        {" | "}
        <Link href="/demo/sdk-content">SDK Client</Link>
      </p>
    </main>
  );
}
