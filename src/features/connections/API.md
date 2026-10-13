# Guided connections API

Mount `registerConnectionRoutes(app:Hono<AppEnv>)` under authenticated `/api/v1`.
All writes require a current owner membership and integer revision; platform supplies CSRF.

- GET `/connection-status`: natural connection names, status, revision-bound validation and next action; no credentials or private configuration.
- POST `/connections/:id/test` `{revision}`: read-only provider validation and revision-bound activation. No grants or workflow-success claim.
- POST `/connections/:id/discover` `{revision,snapshotId?,snapshotRevision?}`: one bounded page, durable resume, new snapshot if omitted.
- GET `/connection-discovery`: consolidated source snapshots with freshness, gaps and review candidates (staff only).
- POST `/connection-discovery/:id/apply` `{revision,items:[{itemId,name?}]}`: explicit local review, no provider writes or authority grants.
- POST `/connections/:id/disconnect` `{revision}`: destroy local credential, disable future credential acquisition; in-flight effects are not undone.
- POST `/connection-default-model` `{connectionId,connectionRevision,settingsRevision}`: explicitly select validated OpenAI connection.

Exports: `connectionStatus`, `testConnection`, `discoverConnection`, `discoveryReview`, `applyDiscovery`, `disconnectConnection`, `setDefaultModel`, `registerConnectionRoutes`, `ConnectionContext`, DTO types.

Microsoft Graph secret is encrypted JSON `{clientId,clientSecret}`, config `tenantId` (tenant UUID). Discovery reads users, groups, subscribedSkus, devices, applications. Freshservice secret is raw API key; config domain is exact `tenant.freshservice.com`; discovery reads workspaces and requesters. OpenAI validation calls intelligence.validateModel once (GET model, no generation charge). Monitoring remains inbound-unobserved until services authenticates an event.

Controlled providers `controlled-deployment`, `workflow-probe`, `notification-webhook` use an owner-configured HTTPS `url` and config `allowedHosts` exact host allowlist. Protocol GET `<url>/health?nonce=...`; bearer encrypted JSON `{token}`. Response must be `{protocol:'linen-connection-health',version:1,provider,nonce,origin,endpoint,readOnly:true,observedAt}` binding exact configured endpoint URL and origin and fresh nonce/time. This is a Linen protocol requiring actual endpoint implementation, never arbitrary HTTP 200 acceptance. Redirects prohibited. No endpoint activation without that response.

Real tenant probes pending: no credentials supplied. Provider scope success never establishes write permission, approval owner, executor ownership or employee workflow recovery.

## Official provider references

Graph uses application client credentials and the fixed global-cloud endpoint only:
[OAuth client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow),
[users](https://learn.microsoft.com/en-us/graph/api/user-list?view=graph-rest-1.0),
[groups](https://learn.microsoft.com/en-us/graph/api/group-list?view=graph-rest-1.0),
[licences](https://learn.microsoft.com/en-us/graph/api/subscribedsku-list?view=graph-rest-1.0),
[devices](https://learn.microsoft.com/en-us/graph/api/device-list?view=graph-rest-1.0),
[applications](https://learn.microsoft.com/en-us/graph/api/application-list?view=graph-rest-1.0),
[pagination](https://learn.microsoft.com/en-us/graph/paging).
Read scopes include User.Read.All, GroupMember.Read.All, LicenseAssignment.Read.All,
Device.Read.All and Application.Read.All, subject to the endpoint's current permission table.
403 is an explicit scope gap; Linen does not request broader consent automatically.
Freshservice uses [official v2 API](https://api.freshservice.com/) Basic key:X authorization,
GET /workspaces and GET /requesters with 100-item pages. No tenant write is sent.

Review accepts optional `catalog:{ownerId,requiresManager}` only for groups/applications/licences;
this is explicit local catalogue ownership and manager-review policy, never an execution grant.
Default review creates contextual service nodes and people. Identity conflicts require
`acknowledgeIdentityConflict:true`; they remain distinct source identities, never merged by email.
Applied mappings are preserved on refresh (including owner-corrected domain records).
An interrupted domain-port application remains `adoption_reconciliation_required`; it must be
reconciled with domain records before retry, rather than creating duplicates.
