// @ts-nocheck
// Mock data for MDCMS Studio

export type ContentType = {
  id: string;
  name: string;
  description: string;
  icon: string;
  documentCount: number;
  publishedCount: number;
  draftCount: number;
  localized: boolean;
  locales?: string[];
  directory: string;
};

export type Document = {
  id: string;
  title: string;
  path: string;
  type: string;
  locale: string;
  status: "published" | "draft" | "changed";
  updatedAt: Date;
  createdAt: Date;
  author: User;
  translationProgress?: { completed: number; total: number };
  isBeingEdited?: boolean;
  editedBy?: User;
};

export type User = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: "owner" | "admin" | "editor" | "viewer";
  isOnline?: boolean;
  lastActive?: Date;
};

export type Environment = {
  id: string;
  name: string;
  description?: string;
  color: "green" | "yellow" | "blue" | "gray";
  documentCount: number;
  schemaType: "base" | "overlay";
  createdAt: Date;
  createdBy: User;
  isProduction?: boolean;
};

export type Activity = {
  id: string;
  user: User;
  action: "published" | "updated" | "created" | "deleted";
  documentTitle?: string;
  documentType?: string;
  timestamp: Date;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
};

// Mock Users
export const mockUsers: User[] = [
  {
    id: "1",
    name: "Alice Chen",
    email: "alice@company.com",
    role: "owner",
    isOnline: true,
  },
  {
    id: "2",
    name: "Bob Smith",
    email: "bob@company.com",
    role: "admin",
    isOnline: true,
  },
  {
    id: "3",
    name: "Carol Davis",
    email: "carol@company.com",
    role: "editor",
    isOnline: false,
    lastActive: new Date(Date.now() - 3600000),
  },
  {
    id: "4",
    name: "David Wilson",
    email: "david@company.com",
    role: "editor",
    isOnline: true,
  },
  {
    id: "5",
    name: "Eva Martinez",
    email: "eva@company.com",
    role: "viewer",
    isOnline: false,
    lastActive: new Date(Date.now() - 86400000),
  },
];

export const currentUser = mockUsers[0];

// Mock Content Types
export const mockContentTypes: ContentType[] = [
  {
    id: "blogpost",
    name: "BlogPost",
    description: "Blog articles with author references",
    icon: "FileText",
    documentCount: 124,
    publishedCount: 98,
    draftCount: 26,
    localized: true,
    locales: ["en-US", "fr", "de", "ja"],
    directory: "content/blog",
  },
  {
    id: "page",
    name: "Page",
    description: "Static pages for the website",
    icon: "File",
    documentCount: 45,
    publishedCount: 42,
    draftCount: 3,
    localized: true,
    locales: ["en-US", "fr", "de"],
    directory: "content/pages",
  },
  {
    id: "author",
    name: "Author",
    description: "Author profiles for blog posts",
    icon: "User",
    documentCount: 12,
    publishedCount: 12,
    draftCount: 0,
    localized: false,
    directory: "content/authors",
  },
  {
    id: "category",
    name: "Category",
    description: "Content categories and tags",
    icon: "Tag",
    documentCount: 28,
    publishedCount: 25,
    draftCount: 3,
    localized: true,
    locales: ["en-US", "fr"],
    directory: "content/categories",
  },
  {
    id: "product",
    name: "Product",
    description: "Product listings with pricing",
    icon: "Package",
    documentCount: 38,
    publishedCount: 32,
    draftCount: 6,
    localized: true,
    locales: ["en-US", "de"],
    directory: "content/products",
  },
];

// Mock Documents
export const mockDocuments: Document[] = [
  {
    id: "1",
    title: "Hello World",
    path: "blog/hello-world",
    type: "BlogPost",
    locale: "en-US",
    status: "published",
    updatedAt: new Date(Date.now() - 120000),
    createdAt: new Date(Date.now() - 86400000 * 7),
    author: mockUsers[0],
    translationProgress: { completed: 4, total: 4 },
  },
  {
    id: "2",
    title: "Getting Started Guide",
    path: "blog/getting-started",
    type: "BlogPost",
    locale: "en-US",
    status: "changed",
    updatedAt: new Date(Date.now() - 900000),
    createdAt: new Date(Date.now() - 86400000 * 14),
    author: mockUsers[1],
    translationProgress: { completed: 2, total: 4 },
    isBeingEdited: true,
    editedBy: mockUsers[1],
  },
  {
    id: "3",
    title: "Advanced Techniques",
    path: "blog/advanced-techniques",
    type: "BlogPost",
    locale: "en-US",
    status: "draft",
    updatedAt: new Date(Date.now() - 3600000),
    createdAt: new Date(Date.now() - 86400000 * 2),
    author: mockUsers[2],
    translationProgress: { completed: 1, total: 4 },
  },
  {
    id: "4",
    title: "About Us",
    path: "pages/about",
    type: "Page",
    locale: "en-US",
    status: "published",
    updatedAt: new Date(Date.now() - 86400000),
    createdAt: new Date(Date.now() - 86400000 * 30),
    author: mockUsers[0],
    translationProgress: { completed: 3, total: 3 },
  },
  {
    id: "5",
    title: "Contact",
    path: "pages/contact",
    type: "Page",
    locale: "en-US",
    status: "published",
    updatedAt: new Date(Date.now() - 86400000 * 5),
    createdAt: new Date(Date.now() - 86400000 * 60),
    author: mockUsers[1],
    translationProgress: { completed: 2, total: 3 },
  },
  {
    id: "6",
    title: "New Feature Announcement",
    path: "blog/new-feature",
    type: "BlogPost",
    locale: "en-US",
    status: "draft",
    updatedAt: new Date(Date.now() - 1800000),
    createdAt: new Date(Date.now() - 7200000),
    author: mockUsers[3],
  },
  {
    id: "7",
    title: "Product Launch 2024",
    path: "blog/product-launch-2024",
    type: "BlogPost",
    locale: "en-US",
    status: "changed",
    updatedAt: new Date(Date.now() - 7200000),
    createdAt: new Date(Date.now() - 86400000 * 3),
    author: mockUsers[0],
    translationProgress: { completed: 3, total: 4 },
  },
  {
    id: "8",
    title: "Privacy Policy",
    path: "pages/privacy",
    type: "Page",
    locale: "en-US",
    status: "published",
    updatedAt: new Date(Date.now() - 86400000 * 10),
    createdAt: new Date(Date.now() - 86400000 * 90),
    author: mockUsers[1],
  },
];

// Mock Environments
export const mockEnvironments: Environment[] = [
  {
    id: "production",
    name: "production",
    description: "Live production environment",
    color: "green",
    documentCount: 247,
    schemaType: "base",
    createdAt: new Date(Date.now() - 86400000 * 365),
    createdBy: mockUsers[0],
    isProduction: true,
  },
  {
    id: "staging",
    name: "staging",
    description: "Pre-production testing",
    color: "yellow",
    documentCount: 252,
    schemaType: "overlay",
    createdAt: new Date(Date.now() - 86400000 * 180),
    createdBy: mockUsers[0],
  },
  {
    id: "preview",
    name: "preview",
    description: "Feature preview environment",
    color: "blue",
    documentCount: 189,
    schemaType: "overlay",
    createdAt: new Date(Date.now() - 86400000 * 30),
    createdBy: mockUsers[1],
  },
];

// Mock Activity
export const mockActivities: Activity[] = [
  {
    id: "1",
    user: mockUsers[0],
    action: "published",
    documentTitle: "Hello World",
    documentType: "BlogPost",
    timestamp: new Date(Date.now() - 120000),
  },
  {
    id: "2",
    user: mockUsers[1],
    action: "updated",
    documentTitle: "Getting Started Guide",
    documentType: "Page",
    timestamp: new Date(Date.now() - 900000),
  },
  {
    id: "3",
    user: mockUsers[2],
    action: "created",
    documentTitle: "New Author Profile",
    documentType: "Author",
    timestamp: new Date(Date.now() - 3600000),
  },

  {
    id: "5",
    user: mockUsers[3],
    action: "published",
    documentTitle: "Product Launch 2024",
    documentType: "BlogPost",
    timestamp: new Date(Date.now() - 14400000),
  },
  {
    id: "6",
    user: mockUsers[1],
    action: "deleted",
    documentTitle: "Old Draft Post",
    documentType: "BlogPost",
    timestamp: new Date(Date.now() - 18000000),
  },
  {
    id: "7",
    user: mockUsers[2],
    action: "updated",
    documentTitle: "About Us",
    documentType: "Page",
    timestamp: new Date(Date.now() - 21600000),
  },
  {
    id: "8",
    user: mockUsers[0],
    action: "published",
    documentTitle: "Privacy Policy",
    documentType: "Page",
    timestamp: new Date(Date.now() - 86400000),
  },
];

// Mock Projects
export const mockProjects: Project[] = [
  { id: "1", name: "Marketing Site", slug: "marketing-site" },
  { id: "2", name: "Documentation", slug: "docs" },
  { id: "3", name: "Blog Platform", slug: "blog" },
];

export const currentProject = mockProjects[0];

// Dashboard stats
export const dashboardStats = {
  totalDocuments: 247,
  publishedDocuments: 189,
  draftDocuments: 58,
  activeEditors: 4,
  weeklyGrowth: 12,
  todayUpdates: 23,
};

// Deleted documents for trash
export const mockDeletedDocuments: (Document & {
  deletedAt: Date;
  deletedBy: User;
})[] = [
  {
    id: "del-1",
    title: "Old Draft Post",
    path: "blog/old-draft",
    type: "BlogPost",
    locale: "en-US",
    status: "draft",
    updatedAt: new Date(Date.now() - 86400000 * 5),
    createdAt: new Date(Date.now() - 86400000 * 30),
    author: mockUsers[1],
    deletedAt: new Date(Date.now() - 18000000),
    deletedBy: mockUsers[1],
  },
  {
    id: "del-2",
    title: "Deprecated Guide",
    path: "pages/deprecated-guide",
    type: "Page",
    locale: "en-US",
    status: "published",
    updatedAt: new Date(Date.now() - 86400000 * 15),
    createdAt: new Date(Date.now() - 86400000 * 120),
    author: mockUsers[0],
    deletedAt: new Date(Date.now() - 86400000 * 2),
    deletedBy: mockUsers[0],
  },
];

// Utility functions
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function getEnvironmentColor(color: Environment["color"]): string {
  const colors = {
    green: "bg-success",
    yellow: "bg-warning",
    blue: "bg-blue-500",
    gray: "bg-foreground-muted",
  };
  return colors[color];
}

export function getStatusBadgeVariant(
  status: Document["status"],
): "default" | "secondary" | "destructive" | "outline" {
  const variants: Record<
    Document["status"],
    "default" | "secondary" | "destructive" | "outline"
  > = {
    published: "default",
    draft: "secondary",
    changed: "outline",
  };
  return variants[status];
}
