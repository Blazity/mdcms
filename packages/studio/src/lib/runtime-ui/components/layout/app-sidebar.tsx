"use client";

import Link from "../../adapters/next-link.js";
import {
  resolveStudioHref,
  useBasePath,
  usePathname,
} from "../../adapters/next-navigation.js";
import { useCanReadSchema } from "../../app/admin/capabilities-context.js";
import {
  LayoutDashboard,
  FileText,
  GitBranch,
  Upload,
  Users,
  Settings,
  Trash2,
  FolderInput,
  Terminal,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip.js";
import { MDCMSLogo } from "../mdcms-logo.js";

interface AppSidebarProps {
  canReadSchema?: boolean;
  canManageUsers?: boolean;
  canManageSettings?: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

const mainNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
  { icon: FileText, label: "Content", href: "/admin/content" },
  { icon: GitBranch, label: "Environments", href: "/admin/environments" },
  { icon: Upload, label: "Media", href: "/admin/media" },
  { icon: FolderInput, label: "Schema", href: "/admin/schema" },
  { icon: Users, label: "Users", href: "/admin/users" },
  { icon: Settings, label: "Settings", href: "/admin/settings" },
  { icon: GitBranch, label: "Workflows", href: "/admin/workflows" },
  { icon: Terminal, label: "API", href: "/admin/api" },
  { icon: Trash2, label: "Trash", href: "/admin/trash" },
];

function getMainNavItems(filters: {
  canReadSchema: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
}) {
  return mainNavItems.filter((item) => {
    if (item.href === "/admin/schema") return filters.canReadSchema;
    if (item.href === "/admin/users") return filters.canManageUsers;
    if (item.href === "/admin/settings") return filters.canManageSettings;
    return true;
  });
}

export function AppSidebar({
  canReadSchema,
  canManageUsers,
  canManageSettings,
  collapsed,
  onToggle,
}: AppSidebarProps) {
  const pathname = usePathname();
  const basePath = useBasePath();
  const contextCanReadSchema = useCanReadSchema();
  const effectiveCanReadSchema = canReadSchema ?? contextCanReadSchema;
  const effectiveCanManageUsers = canManageUsers ?? false;
  const effectiveCanManageSettings = canManageSettings ?? false;
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-background transition-all duration-300",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-border px-4",
            collapsed && "justify-center px-2",
          )}
        >
          <Link href="/admin">
            <MDCMSLogo collapsed={collapsed} />
          </Link>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {getMainNavItems({
              canReadSchema: effectiveCanReadSchema,
              canManageUsers: effectiveCanManageUsers,
              canManageSettings: effectiveCanManageSettings,
            }).map((item) => {
              const resolvedHref = resolveStudioHref(basePath, item.href);
              const isActive =
                pathname === resolvedHref ||
                (resolvedHref !== basePath &&
                  pathname.startsWith(`${resolvedHref}/`));

              const NavLink = (
                <Link
                  href={resolvedHref}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent-subtle text-accent border-l-[3px] border-accent -ml-0.5 pl-[9px]"
                      : "text-foreground-muted hover:bg-background-subtle hover:text-foreground",
                    collapsed && "justify-center px-0 gap-0",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );

              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    NavLink
                  )}
                </li>
              );
            })}
          </ul>

        </nav>

        {/* Bottom Section */}
        <div className="border-t border-border p-2">
          {/* Collapse Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className={cn(
                  "w-full justify-center text-foreground-muted",
                  !collapsed && "justify-start gap-3 px-3",
                )}
              >
                {collapsed ? (
                  <ChevronsRight className="h-5 w-5" />
                ) : (
                  <>
                    <ChevronsLeft className="h-5 w-5" />
                    <span>Collapse</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
