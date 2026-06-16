export const ROLES = ["owner", "admin", "finance", "viewer", "support"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "finance:read": ["owner", "admin", "finance", "viewer"],
  "finance:write": ["owner", "admin", "finance"],
  "tenant:admin": ["owner", "admin"],
  "support:read": ["owner", "admin", "support"],
  "agents:invoke": ["owner", "admin", "finance", "support"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: string, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[];
  return allowed.includes(role);
}

export function requireMfaForRole(role: string): boolean {
  return role === "owner" || role === "admin";
}
