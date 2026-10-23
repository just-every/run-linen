export type SoftwareKind = 'zoom' | 'entra-signins' | 'jamf' | 'intune';
export type SoftwarePolicy = 'managed' | 'ignored' | 'prohibited';
export interface SoftwareContract {
  seats: number; currency: 'USD'; renewalAt: string; annualCostUsd: number; trueUpUnitUsd: number; reference: string;
}
export interface SoftwareBinding {
  connectionId: string; kind: SoftwareKind; appId?: string; aliases?: { title: string; publisher: string; productId?: string }[];
  removalGroupId?: string; removalPolicyId?: string; removalPackageId?: string;
}
export interface SoftwareConnection {
  id: string; name: string; provider: string; revision: number; status: string;
  config: { origin?: string; accountId?: string; tenantId?: string };
}
export interface SoftwareOptions {
  people: { id: string; name: string; roles?: string[] }[]; services: { id: string; name: string }[]; connections: SoftwareConnection[];
}
export interface SoftwareInstallation {
  id: string; connectionId: string; deviceId: string; serial: string; userId: string | null;
  title: string; publisher: string; productId: string; version: string; observedAt: string;
}
export interface SoftwareGrant {
  version: number; action: 'reclaim' | 'remove-app'; principalId: string; targets: string[];
  expiresAt: string; reason: string; issuerId: string; revokedAt?: string; observationAt?: string;
}
export interface SoftwareLicense {
  id: string; revision: number; ownerId: string;
  data: {
    name: string; publisher: string; titleOwnerId: string; serviceId: string;
    metric: 'per-user' | 'per-device' | 'concurrent'; policy: SoftwarePolicy; contract: SoftwareContract;
    sourceBindings: SoftwareBinding[]; grant: SoftwareGrant | null; grantVersion: number;
    effectTargets?: { operationId: string; targetId: string }[];
    observation: null | {
      observedAt: string; sources: { connectionId: string; revision: number; kind: SoftwareKind }[];
      users: { id: string; email: string; active: boolean; licensed: boolean }[];
      installations: SoftwareInstallation[]; concurrentPeak: number | null;
      concurrency?: { peak: number; source: string; evidence: string; observedAt: string; provenance: string } | null;
    };
    reminders: { days?: number; workId?: string; queuedAt?: string; notificationId?: string; [key: string]: unknown }[];
    complianceWork: { workId?: string; installationId?: string; [key: string]: unknown }[];
  };
  summary: {
    entitled: number; consumed: number | null; overLicensed: number | null; underLicensed: number | null;
    activeUsers: number | null; reclaimable: number | null; trueUpUsd: number | null; unknowns: string[]; fresh: boolean; basis?: string;
  };
  effects?: {
    id: string; action: string; state: string; grant_version: number; attempted_at: string;
    [key: string]: unknown;
  }[];
}
export const softwareUsd = (value: number | null | undefined) => value == null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
export const softwareRenewalDate = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
export const softwareKinds: { value: SoftwareKind; label: string; provider: string }[] = [
  { value: 'zoom', label: 'Zoom licenses & activity', provider: 'zoom' },
  { value: 'entra-signins', label: 'Microsoft Entra sign-ins', provider: 'microsoft-graph' },
  { value: 'jamf', label: 'Jamf installed applications', provider: 'jamf' },
  { value: 'intune', label: 'Intune installed applications', provider: 'microsoft-graph' },
];
