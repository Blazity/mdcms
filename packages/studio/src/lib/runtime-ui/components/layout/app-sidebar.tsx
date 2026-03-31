// @ts-nocheck
"use client";

import Link from "../../adapters/next-link";
import { usePathname } from "../../adapters/next-navigation";
import {
  LayoutDashboard,
  FileText,
  GitBranch,
  Upload,
  Users,
  Settings,
  Trash2,
  FolderInput,
  Sparkles,
  Calendar,
  Shield,
  Search,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { MDCMSLogo } from "../mdcms-logo";
import { mockUsers } from "../../lib/mock-data";
import { useState } from "react";

interface AppSidebarProps {
  canReadSchema: boolean;
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
  { icon: Sparkles, label: "Workflows", href: "/admin/workflows" },
  { icon: Search, label: "API", href: "/admin/api" },
  { icon: Trash2, label: "Trash", href: "/admin/trash" },
];

function getMainNavItems(canReadSchema: boolean) {
  return canReadSchema
    ? mainNavItems
    : mainNavItems.filter((item) => item.href !== "/admin/schema");
}

const comingSoonItems = [
  { icon: Calendar, label: "Scheduled" },
  { icon: Shield, label: "Audit Log" },
  { icon: Search, label: "SEO Analysis" },
];

export function AppSidebar({
  canReadSchema,
  collapsed,
  onToggle,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const onlineUsers = mockUsers.filter((u) => u.isOnline).slice(0, 5);

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
            {getMainNavItems(canReadSchema).map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href));

              const NavLink = (
                <Link
                  href={item.href}
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

          {/* Separator */}
          <div className="my-4 h-px bg-border" />

          {/* Coming Soon Section */}
          {collapsed ? (
            <ul className="space-y-1">
              {comingSoonItems.map((item) => (
                <li key={item.href}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="#"
                        className="flex h-10 items-center justify-center rounded-md text-foreground-muted/60 hover:bg-background-subtle hover:text-foreground-muted"
                        onClick={(event) => event.preventDefault()}
                      >
                        <item.icon className="h-5 w-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label} (Coming soon)
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          ) : (
            <Collapsible open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider text-foreground-muted hover:text-foreground">
                  <span>Coming Soon</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      comingSoonOpen && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="space-y-1 pt-1">
                  {comingSoonItems.map((item) => (
                    <li key={item.href}>
                      <Link
                        href="#"
                        className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-foreground-muted/60 hover:bg-background-subtle hover:text-foreground-muted"
                        onClick={(event) => event.preventDefault()}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 text-[10px] font-normal"
                        >
                          Soon
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </nav>

        {/* Bottom Section */}
        <div className="border-t border-border p-2">
          {/* Online Users */}
          {!collapsed && onlineUsers.length > 0 && (
            <div className="mb-2 px-3 py-2">
              <div className="mb-2 text-xs font-medium text-foreground-muted">
                Online now
              </div>
              <div className="flex -space-x-2">
                {onlineUsers.map((user) => (
                  <Tooltip key={user.id}>
                    <TooltipTrigger asChild>
                      <div className="relative">
                        <Avatar className="h-7 w-7 border-2 border-background">
                          <AvatarFallback className="text-xs">
                            {user.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-success ring-2 ring-background" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{user.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

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
