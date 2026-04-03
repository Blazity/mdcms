// @ts-nocheck
"use client";

import Link from "../../adapters/next-link";
import {
  FileText,
  CheckCircle,
  Edit3,
  Users,
  Plus,
  Globe,
  ChevronRight,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { PageHeader } from "../../components/layout/page-header";
import {
  currentUser,
  dashboardStats,
  mockContentTypes,
  mockActivities,
  mockUsers,
  formatRelativeTime,
} from "../../lib/mock-data";
import { cn } from "../../lib/utils";

const statCards = [
  {
    label: "Documents",
    value: dashboardStats.totalDocuments,
    icon: FileText,
    trend: `+${dashboardStats.weeklyGrowth} this week`,
    trendColor: "text-success",
  },
  {
    label: "Published",
    value: dashboardStats.publishedDocuments,
    icon: CheckCircle,
    trend: `${Math.round((dashboardStats.publishedDocuments / dashboardStats.totalDocuments) * 100)}% of total`,
    trendColor: "text-foreground-muted",
  },
  {
    label: "Unpublished changes",
    value: dashboardStats.draftDocuments,
    icon: Edit3,
    trend: `${dashboardStats.todayUpdates} updated today`,
    trendColor: "text-warning",
  },
  {
    label: "Editors online",
    value: dashboardStats.activeEditors,
    icon: Users,
    isUsers: true,
  },
];

const quickActions = [
  {
    label: "New Document",
    icon: Plus,
    href: "/admin/content",
    variant: "default" as const,
  },
];

export default function DashboardPage() {
  const onlineUsers = mockUsers.filter((u) => u.isOnline);

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Dashboard" }]} />

      <div className="p-6 space-y-6">
        {/* Page Title */}
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-foreground-muted">
            Welcome back, {currentUser.name}
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.label} className="border-border py-0 gap-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-foreground-muted">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold">{stat.value}</p>
                    {stat.isUsers ? (
                      <div className="flex -space-x-2 pt-1">
                        {onlineUsers.slice(0, 4).map((user) => (
                          <Avatar
                            key={user.id}
                            className="h-6 w-6 border-2 border-background"
                          >
                            <AvatarFallback className="text-xs">
                              {user.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    ) : (
                      <p className={cn("text-xs", stat.trendColor)}>
                        {stat.trend}
                      </p>
                    )}
                  </div>
                  <div className="rounded-md bg-accent-subtle p-2">
                    <stat.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => (
            <Button key={action.label} variant={action.variant} asChild>
              <Link href={action.href}>
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </Link>
            </Button>
          ))}
        </div>

        {/* Content Types & Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Content Types */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg font-semibold">
                Content Types
              </CardTitle>
              <Link
                href="/admin/content"
                className="text-sm text-foreground-muted hover:text-primary flex items-center gap-1"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockContentTypes.slice(0, 5).map((type) => {
                const publishedRatio =
                  (type.publishedCount / type.documentCount) * 100;
                return (
                  <Link
                    key={type.id}
                    href={`/admin/content/${type.id}`}
                    className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-background-subtle"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{type.name}</p>
                        {type.localized && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Globe className="h-3 w-3" />
                            {type.locales?.length} locales
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground-muted truncate">
                        {type.documentCount} documents
                      </p>
                    </div>
                    <div className="w-24">
                      <div className="flex h-2 overflow-hidden rounded-full bg-border">
                        <div
                          className="bg-success transition-all"
                          style={{ width: `${publishedRatio}%` }}
                        />
                        <div
                          className="bg-warning"
                          style={{ width: `${100 - publishedRatio}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-foreground-muted text-right">
                        {type.publishedCount}/{type.documentCount}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg font-semibold">
                Recent Activity
              </CardTitle>
              <Link
                href="#"
                className="text-sm text-foreground-muted hover:text-primary flex items-center gap-1"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockActivities.slice(0, 8).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-xs">
                        {activity.user.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="text-foreground-muted">
                        <span className="font-medium text-foreground">
                          {activity.user.name}
                        </span>{" "}
                        {activity.action}{" "}
                        {activity.documentTitle && (
                          <>
                            <span className="font-medium text-foreground">
                              {activity.documentTitle}
                            </span>{" "}
                            in {activity.documentType}
                          </>
                        )}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-foreground-muted">
                      {formatRelativeTime(activity.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
