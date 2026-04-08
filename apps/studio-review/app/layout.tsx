import type { ReactNode } from "react";

export const metadata = {
  title: "MDCMS Studio Review",
  description: "Private review app for deterministic Studio preview scenarios.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
