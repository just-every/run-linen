import { ApiError, id, requiredString } from '../../platform/http';

export interface ApplicationEntitlement {
  id: string;
  name: string;
  target: string;
  costCents: number;
  billingPeriod: 'month' | 'year' | 'one-time';
}
export interface ApplicationData {
  name: string;
  connector: string;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  approverIds: string[];
  entitlements: ApplicationEntitlement[];
}
/** Registry metadata describes a service; it never represents provider authority. */
export function applicationData(input: Record<string, unknown>, previous?: ApplicationData): ApplicationData {
  const name = requiredString(input.name, 'name', 200);
  const connector = requiredString(input.connector, 'connector', 200);
  const sensitivity = input.sensitivity as ApplicationData['sensitivity'];
  if (!['public', 'internal', 'confidential', 'restricted'].includes(sensitivity))
    throw new ApiError(422, 'application_sensitivity', 'Record the application data sensitivity');
  if (!Array.isArray(input.approverIds) || input.approverIds.length > 100 || input.approverIds.some(v => typeof v !== 'string' || !v))
    throw new ApiError(422, 'application_approvers', 'Approvers must be member identifiers');
  if (!Array.isArray(input.entitlements) || !input.entitlements.length || input.entitlements.length > 100)
    throw new ApiError(422, 'application_entitlements', 'Record between one and 100 entitlements');
  const entitlements = input.entitlements.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new ApiError(422, 'application_entitlement', 'Structured entitlement required');
    const e = value as Record<string, unknown>;
    if (!Number.isSafeInteger(e.costCents) || Number(e.costCents) < 0 || !['month','year','one-time'].includes(String(e.billingPeriod)))
      throw new ApiError(422, 'application_cost', 'Nonnegative integer USD cents and billing period required');
    if (e.id !== undefined && (typeof e.id!=='string' || !e.id || e.id.length>200 || !previous || !previous.entitlements.some(p => p.id === e.id)))
      throw new ApiError(422, 'application_entitlement_identity', 'Only an existing entitlement may retain its identifier');
    return { id: e.id as string || id(), name: requiredString(e.name, 'entitlement name', 200),
      target: requiredString(e.target, 'entitlement target', 500), costCents: Number(e.costCents),
      billingPeriod: e.billingPeriod as ApplicationEntitlement['billingPeriod'] };
  });
  if (new Set(entitlements.map(e => e.id)).size !== entitlements.length || new Set(entitlements.map(e => e.target)).size !== entitlements.length)
    throw new ApiError(422, 'application_entitlement_duplicate', 'Entitlement identities and targets must be unique within an application');
  return { name, connector, sensitivity, approverIds: [...new Set(input.approverIds as string[])], entitlements };
}
