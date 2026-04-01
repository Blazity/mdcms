// @ts-nocheck
"use client";

import { useState } from "react";
import {
  Settings,
  Key,
  Webhook,
  Image,
  Database,
  Copy,
  Plus,
  MoreHorizontal,
  Eye,
  EyeOff,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { PageHeader } from "../../components/layout/page-header";
import { mockEnvironments, currentProject } from "../../lib/mock-data";
import { cn } from "../../lib/utils";

const settingsTabs = [
  { id: "general", label: "General", icon: Settings },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "media", label: "Media", icon: Image },
  { id: "schema", label: "Schema", icon: Database },
];

const mockApiKeys = [
  {
    id: "1",
    label: "CI/CD Pipeline",
    prefix: "mdcms_key_abc1...",
    scopes: ["content:read", "content:write", "schema:read"],
    context: ["production", "staging"],
    createdAt: "Feb 1, 2024",
    createdBy: "Alice Chen",
    expires: "Never",
    status: "active",
  },
  {
    id: "2",
    label: "Frontend Build",
    prefix: "mdcms_key_xyz9...",
    scopes: ["content:read", "content:read:draft"],
    context: ["preview"],
    createdAt: "Jan 15, 2024",
    createdBy: "Bob Smith",
    expires: "Mar 15, 2024",
    status: "active",
  },
];

const mockWebhooks = [
  {
    id: "1",
    url: "https://api.example.com/webhooks/cms",
    events: ["content.published", "content.updated"],
    active: true,
    lastDelivery: { success: true, time: "2 min ago" },
  },
  {
    id: "2",
    url: "https://hooks.slack.com/services/...",
    events: ["content.published"],
    active: true,
    lastDelivery: { success: true, time: "1 hour ago" },
  },
  {
    id: "3",
    url: "https://builds.vercel.com/deploy-hook/...",
    events: ["content.published", "content.deleted"],
    active: false,
    lastDelivery: { success: false, time: "3 days ago" },
  },
];

const mockSchemaTypes = [
  {
    name: "BlogPost",
    directory: "content/blog",
    localized: true,
    fields: [
      {
        name: "title",
        type: "string",
        required: true,
        constraints: "min(1) max(200)",
      },
      {
        name: "slug",
        type: "string",
        required: true,
        constraints: "regex pattern",
      },
      {
        name: "excerpt",
        type: "string",
        required: false,
        constraints: "max(500)",
      },
      {
        name: "author",
        type: "reference",
        required: true,
        constraints: "→ Author",
      },
      {
        name: "tags",
        type: "string[]",
        required: false,
        constraints: "default: []",
      },
      {
        name: "featured",
        type: "boolean",
        required: false,
        constraints: "staging only",
      },
    ],
  },
  {
    name: "Page",
    directory: "content/pages",
    localized: true,
    fields: [
      { name: "title", type: "string", required: true, constraints: "min(1)" },
      { name: "slug", type: "string", required: true, constraints: "" },
      { name: "content", type: "markdown", required: true, constraints: "" },
    ],
  },
  {
    name: "Author",
    directory: "content/authors",
    localized: false,
    fields: [
      { name: "name", type: "string", required: true, constraints: "" },
      { name: "email", type: "string", required: true, constraints: "email" },
      { name: "bio", type: "string", required: false, constraints: "max(500)" },
    ],
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Settings" }]} />

      <div className="flex">
        {/* Settings Sidebar */}
        <aside className="w-56 shrink-0 border-r border-border bg-background p-4">
          <nav className="space-y-1">
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-accent-subtle text-accent"
                    : "text-foreground-muted hover:bg-background-subtle hover:text-foreground",
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Settings Content */}
        <main className="flex-1 p-6">
          {/* General Settings */}
          {activeTab === "general" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-xl font-semibold">General Settings</h2>
                <p className="text-sm text-foreground-muted">
                  Manage your project configuration
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input id="project-name" defaultValue={currentProject.name} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-slug">Project slug</Label>
                  <Input
                    id="project-slug"
                    defaultValue={currentProject.slug}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Server URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value="https://api.mdcms.io/v1/marketing-site"
                      readOnly
                      className="font-mono flex-1"
                    />
                    <Button variant="outline" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Default environment</Label>
                  <Select defaultValue="production">
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {mockEnvironments.map((env) => (
                        <SelectItem key={env.id} value={env.id}>
                          {env.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button>
                  Save changes
                </Button>
              </div>
            </div>
          )}

          {/* API Keys */}
          {activeTab === "api-keys" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">API Keys</h2>
                  <p className="text-sm text-foreground-muted">
                    Manage API keys for external integrations
                  </p>
                </div>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create API Key
                </Button>
              </div>

              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Key prefix</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-14"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockApiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">
                          {key.label}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {key.prefix}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.slice(0, 2).map((scope) => (
                              <Badge
                                key={scope}
                                variant="secondary"
                                className="text-xs"
                              >
                                {scope}
                              </Badge>
                            ))}
                            {key.scopes.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{key.scopes.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.context.map((ctx) => (
                              <Badge
                                key={ctx}
                                variant="outline"
                                className="text-xs"
                              >
                                {ctx}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-foreground-muted">
                          {key.createdAt}
                        </TableCell>
                        <TableCell className="text-sm text-foreground-muted">
                          {key.expires}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              key.status === "active"
                                ? "bg-success/10 text-success border-success/20"
                                : "bg-destructive/10 text-destructive border-destructive/20",
                            )}
                          >
                            {key.status === "active" ? "Active" : "Revoked"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Webhooks */}
          {activeTab === "webhooks" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Webhooks</h2>
                  <p className="text-sm text-foreground-muted">
                    Configure webhook endpoints for content events
                  </p>
                </div>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Webhook
                </Button>
              </div>

              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Delivery</TableHead>
                      <TableHead className="w-14"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockWebhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell className="font-mono text-sm max-w-64 truncate">
                          {webhook.url}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {webhook.events.map((event) => (
                              <Badge
                                key={event}
                                variant="secondary"
                                className="text-xs"
                              >
                                {event}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch checked={webhook.active} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                webhook.lastDelivery.success
                                  ? "bg-success"
                                  : "bg-destructive",
                              )}
                            />
                            <span className="text-sm text-foreground-muted">
                              {webhook.lastDelivery.time}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>Edit</DropdownMenuItem>
                              <DropdownMenuItem>Test delivery</DropdownMenuItem>
                              <DropdownMenuItem>View history</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive">
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Media Settings */}
          {activeTab === "media" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Media Settings</h2>
                <p className="text-sm text-foreground-muted">
                  Configure upload limits and media handling
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="image-limit">Image upload size limit</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="image-limit"
                      type="number"
                      defaultValue="10"
                      className="w-24"
                    />
                    <span className="text-sm text-foreground-muted">MB</span>
                  </div>
                  <p className="text-xs text-foreground-muted">
                    Leave empty for no limit. Applies only to image uploads.
                  </p>
                </div>

                <Separator />

                <p className="text-sm text-foreground-muted">
                  MDCMS accepts all file types. Size limits apply only to
                  image/* MIME types.
                </p>

                <Button>
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Schema */}
          {activeTab === "schema" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Schema Viewer</h2>
                <p className="text-sm text-foreground-muted">
                  View your content type definitions. Use the CLI to sync schema
                  changes.
                </p>
              </div>

              <div className="space-y-4">
                {mockSchemaTypes.map((type) => (
                  <Collapsible
                    key={type.name}
                    defaultOpen={type.name === "BlogPost"}
                  >
                    <div className="rounded-lg border border-border">
                      <CollapsibleTrigger asChild>
                        <button className="flex w-full items-center justify-between p-4 text-left hover:bg-background-subtle">
                          <div className="flex items-center gap-3">
                            <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]_&]:rotate-90" />
                            <span className="font-semibold">{type.name}</span>
                            {type.localized && (
                              <Badge variant="outline" className="text-xs">
                                Localized
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm text-foreground-muted">
                            {type.directory}
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-border p-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Required</TableHead>
                                <TableHead>Constraints</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {type.fields.map((field) => (
                                <TableRow key={field.name}>
                                  <TableCell className="font-mono text-sm">
                                    {field.name}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {field.type}
                                  </TableCell>
                                  <TableCell>
                                    {field.required ? "Yes" : "No"}
                                  </TableCell>
                                  <TableCell className="text-sm text-foreground-muted">
                                    {field.constraints || "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
