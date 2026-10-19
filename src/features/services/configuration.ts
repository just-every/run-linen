import type { Principal } from '../../platform/types';
import { ApiError, requiredString } from '../../platform/http';
import { create, date, number } from './store';

export const configurationTypes = ['hardware', 'software', 'saas_app', 'business_service', 'cloud_resource'] as const;
export async function newConfigurationItem(db: D1Database, p: Principal, b: Record<string, any>) {
  const ciType = b.ciType ?? 'business_service';
  if (!configurationTypes.includes(ciType)) throw new ApiError(400, 'configuration_type', 'Choose a supported configuration item type');
  const provenance = b.provenance ?? 'asserted';
  if (!['observed', 'asserted', 'inferred'].includes(provenance)) throw new ApiError(400, 'provenance', 'Observed, asserted or inferred provenance required');
  return create(db, p, 'service', {
    name: requiredString(b.name, 'name'), ciType, provenance,
    description: requiredString(b.description, 'description'), businessImpact: requiredString(b.businessImpact, 'businessImpact'),
    source: requiredString(b.source, 'source'), observedAt: date(b.observedAt, 'observedAt'),
    freshnessMs: number(b.freshnessMs ?? 86400000, 'freshnessMs', 1),
  }, { visibility: b.visibility, participants: b.participants });
}
