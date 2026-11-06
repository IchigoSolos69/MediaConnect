export type WorkspaceRole = "OWNER" | "APPROVER" | "EDITOR";

export type PermissionAction =
  | "workspace:manage"        // Rename, delete, manage members
  | "channels:connect"        // Connect / disconnect social accounts
  | "posts:create"            // Create draft / scheduled posts
  | "posts:edit_own"          // Edit own drafts
  | "posts:edit_all"          // Edit any post in workspace
  | "posts:submit_approval"   // Submit draft for review
  | "posts:approve"           // Approve post for scheduling
  | "posts:publish_now"       // Immediately publish to live social
  | "posts:delete"            // Delete posts
  | "analytics:view"          // View dashboard and reports
  | "reports:export";         // Export white-label client PDF

export const ROLE_PERMISSIONS: Record<WorkspaceRole, PermissionAction[]> = {
  OWNER: [
    "workspace:manage",
    "channels:connect",
    "posts:create",
    "posts:edit_own",
    "posts:edit_all",
    "posts:submit_approval",
    "posts:approve",
    "posts:publish_now",
    "posts:delete",
    "analytics:view",
    "reports:export",
  ],
  APPROVER: [
    "posts:create",
    "posts:edit_all",
    "posts:submit_approval",
    "posts:approve",
    "posts:publish_now",
    "posts:delete",
    "analytics:view",
    "reports:export",
  ],
  EDITOR: [
    "posts:create",
    "posts:edit_own",
    "posts:submit_approval",
    "analytics:view",
  ],
};

/**
 * Checks if a given workspace role has permission to execute an action.
 */
export function hasPermission(role: string, action: PermissionAction): boolean {
  const normalizedRole = role.toUpperCase() as WorkspaceRole;
  const permissions = ROLE_PERMISSIONS[normalizedRole];
  if (!permissions) return false;
  return permissions.includes(action);
}
