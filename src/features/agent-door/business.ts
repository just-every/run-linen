import { createBusinessSettings } from '../../modules/business-settings';
import { SettingsError } from '../../modules/business-settings/types';
import { trust as parseTrust } from '../../modules/business-settings/validation';
import type { Trust as SettingsTrust } from '../../modules/business-settings/types';
import type { Trust as DoorTrust } from '../../modules/agent-door/types';
import type { Env } from '../../platform/types';
import { installationOwner } from './people';

type BusinessEnv = Env & { RER_BUSINESS_TRUST?: string };
function settingsTrust(env: BusinessEnv): SettingsTrust | null {
  return env.RER_BUSINESS_TRUST ? parseTrust(env.RER_BUSINESS_TRUST) : null;
}

export function businessTrust(env: BusinessEnv): DoorTrust | null {
  const trust = settingsTrust(env);
  if (!trust) return null;
  const appOrigin = env.RER_DEV_ORIGIN || env.AUTH_ORIGIN || env.APP_ORIGIN;
  if (!appOrigin || new URL(appOrigin).origin !== appOrigin ||
      trust.audience !== 'self-host' && trust.audience !== appOrigin)
    throw new SettingsError('invalid_trust', 503);
  return { issuer: trust.issuer, installationId: trust.subject, appOrigin, publicKeys: trust.keys };
}

/** Owner binding/settings receiver. Team provisioning awaits a native invitation adapter. */
export function businessSettings(env: BusinessEnv) {
  return createBusinessSettings({
    db: env.DB, trust: settingsTrust(env),
    business: { settings: 1, values: ['display_name'], team: { roles: { admin: 'operator', member: 'employee' } } },
    team: {
      async ownerEmail() {
        const owner = await installationOwner(env);
        if (!owner) throw new SettingsError('native_owner_unavailable', 503);
        return owner.email;
      },
      // Never acknowledge a roster without provisioning it or adopt an account by address.
      async prepare() { throw new SettingsError('business_team_not_supported', 503); },
    },
  });
}
