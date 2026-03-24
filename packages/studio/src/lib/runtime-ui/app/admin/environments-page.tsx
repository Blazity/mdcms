// @ts-nocheck
"use client";

import { useState } from "react";
import {
  Globe,
  Check,
  ChevronRight,
  Plus,
  MoreHorizontal,
  Trash2,
  Settings2,
} from "lucide-react";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
  PageHeaderActions,
} from "../../components/layout/page-header";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { mockEnvironments } from "../../lib/mock-data";

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState(mockEnvironments);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newEnv, setNewEnv] = useState({ name: "", slug: "", description: "" });

  const handleCreateEnvironment = () => {
    if (!newEnv.name || !newEnv.slug) return;

    const env = {
      id: `env-${Date.now()}`,
      name: newEnv.name,
      slug: newEnv.slug,
      description: newEnv.description,
      isProduction: false,
      color: "#6b7280",
      documentCount: 0,
      lastPublished: null,
    };

    setEnvironments([...environments, env]);
    setNewEnv({ name: "", slug: "", description: "" });
    setIsCreateDialogOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>Environments</PageHeaderHeading>
          <PageHeaderDescription>
            Manage content publishing environments and promotion workflows
          </PageHeaderDescription>
        </div>
        <PageHeaderActions>
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Environment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Environment</DialogTitle>
                <DialogDescription>
                  Add a new environment for content staging and publishing.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., QA, Preview"
                    value={newEnv.name}
                    onChange={(e) =>
                      setNewEnv({ ...newEnv, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    placeholder="e.g., qa, preview"
                    value={newEnv.slug}
                    onChange={(e) =>
                      setNewEnv({ ...newEnv, slug: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe this environment's purpose..."
                    value={newEnv.description}
                    onChange={(e) =>
                      setNewEnv({ ...newEnv, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateEnvironment}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </PageHeaderActions>
      </PageHeader>

      {/* Environment Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publishing Pipeline</CardTitle>
          <CardDescription>
            Content flows from Development through Staging to Production
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {environments.map((env, index) => (
              <div key={env.id} className="flex items-center">
                <div
                  className="flex items-center gap-2 rounded-lg border px-4 py-3"
                  style={{ borderColor: env.color }}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: env.color }}
                  />
                  <span className="font-medium">{env.name}</span>
                  {env.isProduction && (
                    <Badge variant="secondary" className="ml-1">
                      <Check className="mr-1 h-3 w-3" />
                      Live
                    </Badge>
                  )}
                </div>
                {index < environments.length - 1 && (
                  <ChevronRight className="mx-2 h-4 w-4 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Environment Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {environments.map((env) => (
          <Card key={env.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${env.color}20` }}
                  >
                    <Globe className="h-5 w-5" style={{ color: env.color }} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{env.name}</CardTitle>
                    <CardDescription className="text-xs">
                      /{env.slug}
                    </CardDescription>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Settings2 className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={env.isProduction}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {env.description}
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Documents</p>
                  <p className="font-medium">
                    {env.documentCount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Published</p>
                  <p className="font-medium">
                    {env.lastPublished
                      ? new Date(env.lastPublished).toLocaleDateString()
                      : "Never"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  View Content
                </Button>
                {!env.isProduction && (
                  <Button size="sm" className="flex-1">
                    Promote
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
