"use client";

import { useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Mail,
  Edit,
  ShieldOff,
  Trash2,
  LogOut,
  Loader2,
  AlertCircle,
  Users,
  X,
  Clock,
} from "lucide-react";
import { Button } from "../../components/ui/button.js";
import { Badge } from "../../components/ui/badge.js";
import { Avatar, AvatarFallback } from "../../components/ui/avatar.js";
import { Input } from "../../components/ui/input.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.js";
import { Label } from "../../components/ui/label.js";
import { PageHeader } from "../../components/layout/page-header.js";
import { useToast } from "../../components/toast.js";
import { useUserList } from "../../hooks/use-user-list.js";
import type { UserWithGrants } from "../../../users-api.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip.js";
import { cn } from "../../lib/utils.js";
import { useCanManageUsers } from "./capabilities-context.js";
import { useStudioMountInfo } from "./mount-info-context.js";

const roleConfig = {
  owner: {
    label: "Owner",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  admin: {
    label: "Admin",
    className: "bg-foreground/10 text-foreground border-foreground/20",
  },
  editor: {
    label: "Editor",
    className: "bg-border text-foreground-muted border-border",
  },
  viewer: {
    label: "Viewer",
    className: "bg-transparent text-foreground-muted border-border",
  },
};

function getHighestRole(
  grants: UserWithGrants["grants"],
): "owner" | "admin" | "editor" | "viewer" {
  const roleRank = { owner: 3, admin: 2, editor: 1, viewer: 0 };
  let highest: "owner" | "admin" | "editor" | "viewer" = "viewer";
  for (const grant of grants) {
    const role = grant.role as keyof typeof roleRank;
    if (roleRank[role] !== undefined && roleRank[role] > roleRank[highest]) {
      highest = role;
    }
  }
  return highest;
}

function getScopeLabel(grants: UserWithGrants["grants"]): string {
  const pathPrefixes = grants.map((g) => g.pathPrefix).filter(Boolean);
  if (pathPrefixes.length > 0) {
    return pathPrefixes.length === 1
      ? pathPrefixes[0]!
      : `${pathPrefixes[0]} +${pathPrefixes.length - 1}`;
  }
  return "Full project";
}

function formatJoinedDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function UsersPage() {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteData, setInviteData] = useState({
    email: "",
    role: "editor",
    pathPrefix: "",
  });
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [editRoleDialogOpen, setEditRoleDialogOpen] = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<{
    userId: string;
    userName: string;
    currentRole: string;
    currentGrants: UserWithGrants["grants"];
  } | null>(null);
  const [editRoleValue, setEditRoleValue] = useState("editor");
  const [editRolePathPrefix, setEditRolePathPrefix] = useState("");

  const toast = useToast();
  const {
    status,
    users,
    pendingInvites,
    errorMessage,
    refresh,
    inviteUser,
    isInviting,
    removeUser,
    isRemoving,
    revokeSessions,
    isRevokingSessions,
    updateGrants,
    isUpdatingGrants,
    revokeInvite,
    isRevokingInvite,
  } = useUserList();

  const canManageUsers = useCanManageUsers();
  const { project: activeProject, environment: activeEnvironment } =
    useStudioMountInfo();

  if (!canManageUsers) {
    return (
      <div className="min-h-screen">
        <PageHeader breadcrumbs={[{ label: "Users" }]} />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldOff className="mb-4 h-8 w-8 text-foreground-muted" />
          <h3 className="mb-2 text-lg font-semibold">Access denied</h3>
          <p className="text-sm text-foreground-muted">
            You don&apos;t have permission to manage users.
          </p>
        </div>
      </div>
    );
  }

  async function handleInvite() {
    setInviteError(null);
    try {
      const useFolderPrefix = inviteData.pathPrefix && activeEnvironment;
      await inviteUser({
        email: inviteData.email,
        grants: [
          {
            role: inviteData.role,
            scopeKind:
              inviteData.role === "admin"
                ? "global"
                : useFolderPrefix
                  ? "folder_prefix"
                  : "project",
            project:
              inviteData.role === "admin"
                ? undefined
                : activeProject || undefined,
            environment:
              inviteData.role === "admin"
                ? undefined
                : useFolderPrefix
                  ? activeEnvironment
                  : undefined,
            pathPrefix:
              inviteData.role === "admin"
                ? undefined
                : useFolderPrefix
                  ? inviteData.pathPrefix
                  : undefined,
          },
        ],
      });
      setInviteDialogOpen(false);
      setInviteData({ email: "", role: "editor", pathPrefix: "" });
      toast.success("Invitation sent successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send invitation.";
      setInviteError(message);
    }
  }

  async function handleRevokeSessions(userId: string, userName: string) {
    try {
      await revokeSessions(userId);
      toast.success(`Sessions revoked for ${userName}.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to revoke sessions.";
      toast.error(message);
    }
  }

  async function handleRemoveUser(userId: string, userName: string) {
    const confirmed = window.confirm(
      `Are you sure you want to remove ${userName}? This action cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await removeUser(userId);
      toast.success(`${userName} has been removed.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove user.";
      toast.error(message);
    }
  }

  async function handleRevokeInvite(inviteId: string, email: string) {
    try {
      await revokeInvite(inviteId);
      toast.success(`Invitation for ${email} has been revoked.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to revoke invitation.";
      toast.error(message);
    }
  }

  async function handleEditRole() {
    if (!editRoleTarget) return;
    try {
      const editUseFolderPrefix = editRolePathPrefix && activeEnvironment;
      const editedGrant = {
        role: editRoleValue,
        scopeKind:
          editRoleValue === "admin"
            ? "global"
            : editUseFolderPrefix
              ? "folder_prefix"
              : "project",
        project:
          editRoleValue === "admin"
            ? undefined
            : (editRoleTarget.currentGrants[0]?.project ??
              activeProject ??
              undefined),
        environment:
          editRoleValue === "admin"
            ? undefined
            : editUseFolderPrefix
              ? activeEnvironment
              : undefined,
        pathPrefix:
          editRoleValue === "admin"
            ? undefined
            : editUseFolderPrefix
              ? editRolePathPrefix
              : undefined,
      };
      // If user has multiple grants, preserve the others and only replace the first
      const updatedGrants =
        editRoleTarget.currentGrants.length > 1
          ? [
              editedGrant,
              ...editRoleTarget.currentGrants.slice(1).map((g) => ({
                role: g.role,
                scopeKind: g.scopeKind,
                project: g.project ?? undefined,
                environment: g.environment ?? undefined,
                pathPrefix: g.pathPrefix ?? undefined,
              })),
            ]
          : [editedGrant];
      await updateGrants(editRoleTarget.userId, updatedGrants);
      toast.success(`Role updated for ${editRoleTarget.userName}.`);
      setEditRoleDialogOpen(false);
      setEditRoleTarget(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update role.";
      toast.error(message);
    }
  }

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Users" }]} />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Users</h1>
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a new user</DialogTitle>
                <DialogDescription>
                  Send an invitation to join this CMS instance
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@company.com"
                      value={inviteData.email}
                      onChange={(e) =>
                        setInviteData({ ...inviteData, email: e.target.value })
                      }
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={inviteData.role}
                    onValueChange={(value) =>
                      setInviteData({ ...inviteData, role: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Folder prefix (editor/viewer only) */}
                {(inviteData.role === "editor" ||
                  inviteData.role === "viewer") && (
                  <div className="space-y-2">
                    <Label htmlFor="path-prefix">
                      Folder prefix (optional)
                    </Label>
                    <Input
                      id="path-prefix"
                      placeholder="e.g. content/blog"
                      value={inviteData.pathPrefix}
                      onChange={(e) =>
                        setInviteData({
                          ...inviteData,
                          pathPrefix: e.target.value,
                        })
                      }
                      className="font-mono"
                    />
                    <p className="text-xs text-foreground-muted">
                      Restricts access to content under this path only. Leave
                      empty for full project access.
                    </p>
                  </div>
                )}

                {/* Invite error */}
                {inviteError && (
                  <p className="text-sm text-destructive">{inviteError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setInviteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={isInviting || !inviteData.email}
                  onClick={handleInvite}
                >
                  {isInviting ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Loading state */}
        {status === "loading" && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="mb-4 h-8 w-8 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold">Failed to load users</h3>
            <p className="mb-4 text-sm text-foreground-muted">{errorMessage}</p>
            <Button variant="ghost" onClick={refresh}>
              Try again
            </Button>
          </div>
        )}

        {/* Empty state */}
        {status === "empty" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-background-subtle p-4">
              <Users className="h-8 w-8 text-foreground-muted" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">No users found</h3>
            <p className="text-sm text-foreground-muted">
              Invite someone to get started.
            </p>
          </div>
        )}

        {/* Pending Invitations */}
        {pendingInvites.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-foreground-muted">
              Pending Invitations ({pendingInvites.length})
            </h2>
            <div className="rounded-lg border border-border divide-y divide-border">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background-subtle">
                      <Clock className="h-4 w-4 text-foreground-muted" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-foreground-muted">
                        Expires {formatJoinedDate(invite.expiresAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {invite.grants[0]?.role ?? "editor"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-foreground-muted hover:text-destructive"
                      disabled={isRevokingInvite}
                      onClick={() =>
                        handleRevokeInvite(invite.id, invite.email)
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users Table */}
        {status === "ready" && (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="w-28">Role</TableHead>
                  <TableHead className="w-32">Scope</TableHead>
                  <TableHead className="w-28">Joined</TableHead>
                  <TableHead className="w-14"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const role = getHighestRole(user.grants);
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {user.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-sm text-foreground-muted">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-xs", roleConfig[role].className)}
                        >
                          {roleConfig[role].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-foreground-muted">
                        {getScopeLabel(user.grants)}
                      </TableCell>
                      <TableCell className="text-sm text-foreground-muted">
                        {formatJoinedDate(user.createdAt)}
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
                            <TooltipProvider>
                              <DropdownMenuItem
                                disabled={role === "owner"}
                                onClick={() => {
                                  setEditRoleTarget({
                                    userId: user.id,
                                    userName: user.name,
                                    currentRole: role,
                                    currentGrants: user.grants,
                                  });
                                  setEditRoleValue(role);
                                  setEditRolePathPrefix(
                                    user.grants[0]?.pathPrefix ?? "",
                                  );
                                  setEditRoleDialogOpen(true);
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isRevokingSessions}
                                onClick={() =>
                                  handleRevokeSessions(user.id, user.name)
                                }
                              >
                                <LogOut className="mr-2 h-4 w-4" />
                                Revoke sessions
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {role === "owner" ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="w-full">
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        disabled
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Remove user
                                      </DropdownMenuItem>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    <p>
                                      Owners cannot be removed. Transfer
                                      ownership first.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  disabled={isRemoving}
                                  onClick={() =>
                                    handleRemoveUser(user.id, user.name)
                                  }
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove user
                                </DropdownMenuItem>
                              )}
                            </TooltipProvider>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Edit Role Dialog */}
        <Dialog open={editRoleDialogOpen} onOpenChange={setEditRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit role</DialogTitle>
              <DialogDescription>
                Change the role for {editRoleTarget?.userName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRoleValue} onValueChange={setEditRoleValue}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(editRoleValue === "editor" || editRoleValue === "viewer") && (
                <div className="space-y-2">
                  <Label htmlFor="edit-role-path-prefix">
                    Folder prefix (optional)
                  </Label>
                  <Input
                    id="edit-role-path-prefix"
                    placeholder="e.g. content/blog"
                    value={editRolePathPrefix}
                    onChange={(e) => setEditRolePathPrefix(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-foreground-muted">
                    Restricts access to content under this path only. Leave
                    empty for full project access.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setEditRoleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={isUpdatingGrants}
                onClick={handleEditRole}
              >
                {isUpdatingGrants ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
