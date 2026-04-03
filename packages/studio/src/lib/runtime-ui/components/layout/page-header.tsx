// @ts-nocheck
"use client";

import * as React from "react";
import { useTheme } from "../../adapters/next-themes";
import Link from "../../adapters/next-link";
import {
  Sun,
  Moon,
  Bell,
  ChevronRight,
  LogOut,
  User,
  Settings,
  Search,
} from "lucide-react";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import {
  currentUser,
  mockEnvironments,
  mockProjects,
  currentProject,
} from "../../lib/mock-data";
import { useState } from "react";

export type BreadcrumbItem = { label: string; href?: string };

// Page Title Section Components
interface PageTitleSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
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
      className={cn(
        "text-2xl font-bold font-heading tracking-tight",
        className,
      )}
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

export function AppHeader({ breadcrumbs = [] }: AppHeaderProps) {
  const { theme, setTheme } = useTheme();
  const [currentEnv, setCurrentEnv] = useState(mockEnvironments[0]);
  const [hasNotifications] = useState(true);

  const getEnvDotColor = (color: string) => {
    const colors: Record<string, string> = {
      green: "bg-success",
      yellow: "bg-warning",
      blue: "bg-blue-500",
      gray: "bg-foreground-muted",
    };
    return colors[color] || colors.gray;
  };

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-6">
        {/* Left side - Breadcrumbs */}
        <BreadcrumbTrail breadcrumbs={breadcrumbs} />

        {/* Right side - Controls */}
        <div className="flex items-center gap-3">
          {/* Search trigger */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-foreground-muted"
              >
                <Search className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search (Cmd+K)</TooltipContent>
          </Tooltip>

          {/* Environment selector */}
          <Select
            value={currentEnv.id}
            onValueChange={(value) => {
              const env = mockEnvironments.find((e) => e.id === value);
              if (env) setCurrentEnv(env);
            }}
          >
            <SelectTrigger className="w-36 h-9">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    getEnvDotColor(currentEnv.color),
                  )}
                />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {mockEnvironments.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        getEnvDotColor(env.color),
                      )}
                    />
                    <span>{env.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Project switcher */}
          <Select defaultValue={currentProject.id}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mockProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-foreground-muted"
              >
                <Bell className="h-5 w-5" />
                {hasNotifications && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-sm">
                    {currentUser.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{currentUser.name}</p>
                  <p className="text-xs text-foreground-muted">
                    {currentUser.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Preferences
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </TooltipProvider>
  );
}
