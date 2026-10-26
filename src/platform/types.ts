export type Role = 'owner' | 'operator' | 'employee' | 'approver' | 'hr' | 'auditor' | 'integration' | 'sandbox-admin'
export interface Principal { userId: string; workspaceId: string; roles: Role[]; departmentIds?: string[]; departmentRoles?: import('../features/work/department-role-authority').DepartmentRoleGrant[] }
export interface Env {
  RER_DEMO?: string
  RER_OWNER_CLAIM_ISSUER?: string
  RER_OWNER_CLAIM_INSTALLATION_ID?: string
  RER_OWNER_CLAIM_PUBLIC_KEYS?: string
  DB: D1Database
  ATTACHMENTS: R2Bucket
  SESSION_SECRET: string
  ENCRYPTION_KEY: string
  APP_ORIGIN?: string
  ACCESS_ISSUER?: string
  ACCESS_AUDIENCE?: string
  AUTH_ORIGIN?: string
  AUTH_LOCAL?: string
  OWNER_EMAIL?: string
  SETUP_TOKEN?: string
  MAIL_PROVIDER?: string
  MAIL_FROM?: string
  MAIL_RELAY_URL?: string
  MAIL_API_KEY?: string
  MAIL_ACCOUNT_ID?: string
  RER_DEV_ORIGIN?: string
  RER_DEV_KEY?: string
  RER_DEV_IDENTITY?: string
  RER_INSTALLATION_ID?: string
  RER_MANAGEMENT_ORIGIN?: string
  RER_DEPLOY_SOURCE?: string
  RER_DEPLOY_FINGERPRINT?: string
  RER_VERSION?: { id: string }
  ASSETS?: Fetcher
  BOOTSTRAP_TOKEN?: string
}
export type AppEnv = { Bindings: Env; Variables: { principal: Principal } }
