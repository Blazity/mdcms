// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "../../components/layout/app-sidebar";
import { cn } from "../../lib/utils";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Persist sidebar state
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) {
      setSidebarCollapsed(stored === "true");
    }
  }, []);

  const handleToggle = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
  };

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onToggle={handleToggle} />
      <main
        className={cn(
          "min-h-screen transition-all duration-300",
          sidebarCollapsed ? "ml-16" : "ml-60",
        )}
      >
        {children}
      </main>
    </div>
  );
}
