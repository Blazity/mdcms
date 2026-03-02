import type { ReactNode } from "react";

export const metadata = {
  title: "MDCMS Studio Embed Smoke",
  description: "Sample host app for CMS-47 Studio embed smoke verification.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
