// @ts-nocheck
"use client";

import { useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Mail,
  Edit,
  Shield,
  Trash2,
  LogOut,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Input } from "../../components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import { PageHeader } from "../../components/layout/page-header";
import { mockUsers, formatRelativeTime } from "../../lib/mock-data";
import { cn } from "../../lib/utils";

const roleConfig = {
  owner: {
    label: "Owner",
    className: "bg-accent-subtle text-accent border-accent/20",
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

export default function UsersPage() {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteData, setInviteData] = useState({
    email: "",
    role: "editor",
    globalAccess: true,
  });

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Users" }]} />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-heading tracking-tight">Users</h1>
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

                {/* Global access */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <Label>Global access</Label>
                    <p className="text-xs text-foreground-muted">
                      Apply role to all projects and folders
                    </p>
                  </div>
                  <Switch
                    checked={inviteData.globalAccess}
                    onCheckedChange={(checked) =>
                      setInviteData({ ...inviteData, globalAccess: checked })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setInviteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setInviteDialogOpen(false)}
                >
                  Send Invitation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="w-28">Role</TableHead>
                <TableHead className="w-32">Scope</TableHead>
                <TableHead className="w-32">Last Active</TableHead>
                <TableHead className="w-28">Joined</TableHead>
                <TableHead className="w-14"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {user.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        {user.isOnline && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" />
                        )}
                      </div>
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
                      className={cn("text-xs", roleConfig[user.role].className)}
                    >
                      {roleConfig[user.role].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-foreground-muted">
                    Global
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {user.isOnline && (
                        <span className="h-2 w-2 rounded-full bg-success" />
                      )}
                      <span className="text-sm text-foreground-muted">
                        {user.isOnline
                          ? "Online now"
                          : user.lastActive
                            ? formatRelativeTime(user.lastActive)
                            : "Never"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-foreground-muted">
                    Jan 15, 2024
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit role
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Shield className="mr-2 h-4 w-4" />
                          Edit permissions
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <LogOut className="mr-2 h-4 w-4" />
                          Revoke sessions
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={user.role === "owner"}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove user
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
    </div>
  );
}
