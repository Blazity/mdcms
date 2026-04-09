"use client";

import { useState } from "react";
import {
  Settings,
  Key,
  Webhook,
  Image,
  Database,
  ArrowRight,
  Copy,
  Plus,
} from "lucide-react";
import Link from "../../adapters/next-link.js";
import {
  resolveStudioHref,
  useBasePath,
} from "../../adapters/next-navigation.js";
import { useApiKeyList } from "../../hooks/use-api-key-list.js";
import { ApiKeyCreateDialog } from "../../components/api-key-create-dialog.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Badge } from "../../components/ui/badge.js";
import { Label } from "../../components/ui/label.js";
import { Separator } from "../../components/ui/separator.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.js";
import { useCanReadSchema } from "./capabilities-context.js";
import { PageHeader } from "../../components/layout/page-header.js";
import { mockEnvironments, currentProject } from "../../lib/mock-data.js";
import { cn } from "../../lib/utils.js";

const settingsTabs = [
  { id: "general", label: "General", icon: Settings },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "media", label: "Media", icon: Image },
  { id: "schema", label: "Schema", icon: Database },
];

export default function SettingsPage({
  initialTab = "general",
}: {
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const canReadSchema = useCanReadSchema();
  const basePath = useBasePath();
  const schemaBrowserHref = resolveStudioHref(basePath, "/schema");
  const {
    status: apiKeysStatus,
    keys: apiKeys,
    errorMessage: apiKeysErrorMessage,
    createKey,
    isCreating,
    createError,
    revokeKey,
    isRevoking,
  } = useApiKeyList();

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

                <Button className="bg-accent hover:bg-accent-hover text-white">
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
                <Button
                  className="bg-accent hover:bg-accent-hover text-white"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create API Key
                </Button>
              </div>

              {apiKeysStatus === "loading" && (
                <p className="text-sm text-foreground-muted">Loading...</p>
              )}

              {apiKeysStatus === "error" && (
                <p className="text-sm text-destructive">
                  {apiKeysErrorMessage ?? "Failed to load API keys."}
                </p>
              )}

              {apiKeysStatus === "empty" && (
                <p className="text-sm text-foreground-muted">
                  No API keys yet
                </p>
              )}

              {apiKeysStatus === "ready" && (
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
                      {apiKeys.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell className="font-medium">
                            {key.label}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {key.keyPrefix}
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
                              {key.contextAllowlist.map((ctx) => (
                                <Badge
                                  key={`${ctx.project}/${ctx.environment}`}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {ctx.environment}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground-muted">
                            <div>
                              {new Date(key.createdAt).toLocaleDateString()}
                            </div>
                            <div className="text-xs">
                              {key.createdByUserId}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground-muted">
                            {key.expiresAt
                              ? new Date(key.expiresAt).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                key.revokedAt === null
                                  ? "bg-success/10 text-success border-success/20"
                                  : "bg-destructive/10 text-destructive border-destructive/20",
                              )}
                            >
                              {key.revokedAt === null ? "Active" : "Revoked"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => revokeKey(key.id)}
                              disabled={isRevoking || key.revokedAt !== null}
                            >
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <ApiKeyCreateDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSubmit={createKey}
                isSubmitting={isCreating}
                error={createError}
              />
            </div>
          )}

          {/* Webhooks */}
          {activeTab === "webhooks" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Webhooks</h2>
                <p className="text-sm text-foreground-muted">
                  Configure webhook endpoints for content events
                </p>
              </div>
              <p className="text-sm text-foreground-muted">
                Webhook management coming soon.
              </p>
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

                <Button className="bg-accent hover:bg-accent-hover text-white">
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Schema */}
          {activeTab === "schema" && canReadSchema && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Schema</h2>
                <p className="text-sm text-foreground-muted">
                  Studio exposes the current content model through the live
                  read-only schema browser. Schema changes stay code-first and
                  sync through explicit recovery actions only.
                </p>
              </div>

              <section
                data-mdcms-settings-schema-state="linked"
                className="rounded-lg border border-border bg-background-subtle p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl space-y-2">
                    <Badge variant="outline">Read-only</Badge>
                    <p className="text-sm text-foreground-muted">
                      Open the live schema browser to inspect synced types,
                      fields, validation metadata, and any active schema
                      mismatch recovery banner for this project/environment.
                    </p>
                  </div>

                  <Button
                    asChild
                    className="bg-accent text-white hover:bg-accent-hover"
                  >
                    <Link href={schemaBrowserHref}>
                      Open schema browser
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
