"use client";

import * as React from "react";
import { useTheme } from "../../adapters/next-themes.js";
import Link from "../../adapters/next-link.js";
import { Sun, Moon, ChevronRight, LogOut } from "lucide-react";
import { Button } from "../ui/button.js";
import { Avatar, AvatarFallback } from "../ui/avatar.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip.js";
import { cn } from "../../lib/utils.js";
import { useStudioSession } from "../../app/admin/session-context.js";
import { useStudioMountInfo } from "../../app/admin/mount-info-context.js";
import { createStudioSessionApi } from "../../../session-api.js";

export type BreadcrumbItem = { label: string; href?: string };

// Page Title Section Components
interface PageTitleSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

export function PageHeader({
  children,
  className,
  breadcrumbs,
  ...props
}: PageTitleSectionProps) {
  if (breadcrumbs) {
    return <AppHeader breadcrumbs={breadcrumbs} />;
  }

  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PageHeaderHeading({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn("text-2xl font-semibold tracking-tight", className)}
      {...props}
    >
      {children}
    </h1>
  );
}

export function PageHeaderDescription({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}

export function PageHeaderActions({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      {children}
    </div>
  );
}

// App Header (breadcrumb navigation bar)
interface AppHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
}

export function BreadcrumbTrail({
  breadcrumbs = [],
  className,
}: {
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {breadcrumbs.map((crumb, index) => (
        <div
          key={`${crumb.label}-${index}`}
          className="flex min-w-0 items-center gap-1.5"
        >
          {index > 0 && (
            <ChevronRight className="h-4 w-4 shrink-0 text-foreground-muted" />
          )}
          {crumb.href && index < breadcrumbs.length - 1 ? (
            <Link
              href={crumb.href}
              className="truncate text-sm text-foreground-muted transition-colors hover:text-foreground"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium">{crumb.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}

function deriveInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function AppHeader({ breadcrumbs = [] }: AppHeaderProps) {
  const { theme, setTheme } = useTheme();
  const sessionState = useStudioSession();
  const mountInfo = useStudioMountInfo();

  const handleSignOut = async () => {
    if (sessionState.status !== "authenticated") return;

    try {
      const api = createStudioSessionApi(
        { serverUrl: mountInfo.apiBaseUrl },
        { auth: { mode: "cookie" } },
      );
      await api.signOut(sessionState.csrfToken);
    } finally {
      window.location.reload();
    }
  };

  const handleEnvironmentChange = (environmentName: string) => {
    mountInfo.setEnvironment(environmentName);
  };

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-6">
        {/* Left side - Breadcrumbs */}
        <BreadcrumbTrail breadcrumbs={breadcrumbs} />

        {/* Right side - Controls */}
        <div className="flex items-center gap-3">
          {/* Environment selector */}
          {mountInfo.environments.length > 1 ? (
            <Select
              value={mountInfo.environment ?? undefined}
              onValueChange={handleEnvironmentChange}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mountInfo.environments.map((env) => (
                  <SelectItem key={env.id} value={env.name}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : mountInfo.environment ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border text-sm text-foreground-muted">
              {mountInfo.environment}
            </div>
          ) : null}

          {/* Project badge (read-only) */}
          {mountInfo.project && (
            <div className="flex items-center h-9 px-3 rounded-md border border-border text-sm text-foreground-muted">
              {mountInfo.project}
            </div>
          )}

          {/* Dark mode toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="text-foreground-muted"
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>

          {/* User menu */}
          {sessionState.status === "authenticated" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-sm">
                      {deriveInitials(sessionState.session.email)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">
                      {sessionState.session.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-sm">?</AvatarFallback>
            </Avatar>
          )}
        </div>
      </header>
    </TooltipProvider>
  );
}
