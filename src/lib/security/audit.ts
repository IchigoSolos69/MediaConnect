/**
 * Security Audit Logger for MediaConnect.
 * Formats and records security-sensitive events in structured JSON format.
 * Never logs passwords, plaintext tokens, or cryptographic keys.
 */

export type SecurityEventType =
  | "AUTH_SUCCESS"
  | "AUTH_FAILURE"
  | "AUTH_RATE_LIMITED"
  | "CROSS_TENANT_ATTEMPT"
  | "PRIVILEGE_ESCALATION_ATTEMPT"
  | "TOKEN_TAMPER_DETECTED"
  | "DISPATCH_TRIGGERED"
  | "DISPATCH_UNAUTHORIZED"
  | "UNAPPROVED_PUBLISH_BLOCKED"
  | "SESSION_REVOKED"
  | "OAUTH_CSRF_REJECTED"
  | "CHANNEL_CONNECTED";

export interface SecurityEventData {
  event: SecurityEventType;
  userId?: string;
  email?: string;
  workspaceId?: string;
  targetWorkspaceId?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  type?: string;
  details?: Record<string, unknown>;
}

export class SecurityAudit {
  public static log(data: SecurityEventData): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: "SECURITY_AUDIT",
      ...data,
    };

    // Output structured JSON log
    if (
      data.event.includes("FAILURE") ||
      data.event.includes("ATTEMPT") ||
      data.event.includes("BLOCKED") ||
      data.event.includes("TAMPER") ||
      data.event.includes("REJECTED")
    ) {
      console.warn(`[SECURITY ALERT] [${data.event}]`, JSON.stringify(logEntry));
    } else {
      console.info(`[SECURITY AUDIT] [${data.event}]`, JSON.stringify(logEntry));
    }
  }
}

export function auditSecurityEvent(data: SecurityEventData): void {
  SecurityAudit.log(data);
}
