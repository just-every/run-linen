// Explicit native mapping. Never accept table or column names from an archive as SQL.
export const nativeTables = [
    'work_watchers', 'work_collaboration_notices', 'work_side_conversations', 'work_side_deliveries', 'work_side_receipts',
    'mcp_credentials', 'work_canned_responses',
    'work_knowledge_drafts',
    'work_time_entries', 'work_records', 'work_messages', 'work_attachments', 'work_people', 'work_pending_people', 'work_pending_services', 'work_assets', 'work_recurring_plans', 'work_recurring_occurrences', 'work_recurring_tasks', 'work_asset_financials', 'work_custody', 'work_asset_contracts', 'work_asset_repairs', 'work_classifications', 'work_lifecycle', 'work_obligations', 'work_knowledge', 'work_erasure', 'work_calendars', 'work_catalog_values', 'work_access_policies', 'work_lifecycle_templates', 'work_catalog', 'work_fulfilments', 'work_delegations', 'work_commitments', 'work_article_versions', 'work_intake_events', 'work_sender_identities', 'work_knowledge_suggestions',
    'execution_grants', 'execution_grant_revocations', 'execution_plans', 'execution_decisions', 'execution_operations', 'execution_fences', 'execution_attempts', 'execution_receipts', 'execution_verifications', 'execution_outbox', 'execution_delivery_events',
    'svc_records', 'svc_events', 'svc_receipts', 'svc_outbox', 'svc_commands',
    'intelligence_commitments', 'intelligence_versions', 'intelligence_observations', 'intelligence_events', 'intelligence_budgets', 'intelligence_attempts', 'intelligence_research', 'intelligence_protocol_runs', 'intelligence_capabilities', 'intelligence_reuse', 'intelligence_simplifications', 'intelligence_engineering_grants', 'intelligence_engineering_jobs', 'intelligence_fulfilment_runs', 'intelligence_investigations', 'intelligence_pending_fulfilments',
    'connection_validations', 'connection_snapshots', 'connection_items', 'connection_adoptions', 'platform_identity_erasures', 'work_execution_bindings', 'work_catalog_reservations', 'work_fulfilment_execution', 'work_fulfilment_approvals', 'work_fulfilment_amendments', 'work_fulfilment_removals', 'execution_provider_attempts', 'execution_automation_principals', 'execution_subject_mappings', 'svc_change_locks', 'adoption_retention', 'work_retention', 'work_retention_receipts', 'work_retention_skips', 'work_catalog_bundles', 'work_bundle_requests', 'work_requester_groups', 'work_sla_policies', 'work_sla_clocks', 'work_asset_audits', 'work_asset_audit_scans', 'work_asset_audit_followups', 'work_stock_lines', 'work_stock_movements', 'work_stock_purchases', 'work_escalation_levels', 'work_waiting_rules', 'work_followups', 'work_sla_pauses', 'work_projects', 'work_project_milestones', 'work_project_tasks', 'work_project_links', 'work_participants', 'work_shares', 'work_custom_fields', 'work_field_values', 'work_custom_statuses', 'work_resolution_codes', 'work_resolutions', 'work_links', 'work_groups', 'work_group_members', 'work_views', 'work_routing_rules', 'work_support_groups', 'work_agent_routing', 'work_scenarios', 'work_record_templates',
    'audit_events', 'adoption_tombstones', 'adoption_history', 'adoption_imports', 'adoption_sources', 'adoption_source_records', 'adoption_ownership', 'adoption_writebacks', 'adoption_holds', 'adoption_reconciliations', 'adoption_identity_map', 'adoption_artifacts'
] as const;
export const historyOnly = new Set(['work_watchers', 'work_collaboration_notices', 'work_side_conversations', 'work_side_deliveries', 'work_side_receipts', 'mcp_credentials', 'work_access_policies', 'work_lifecycle_templates', 'work_knowledge_suggestions', 'connection_validations', 'connection_snapshots', 'connection_items', 'connection_adoptions', 'platform_identity_erasures', 'work_execution_bindings', 'work_catalog_reservations', 'work_fulfilment_execution', 'work_fulfilment_approvals', 'work_fulfilment_amendments', 'work_fulfilment_removals', 'execution_provider_attempts', 'execution_automation_principals', 'execution_subject_mappings', 'svc_change_locks', 'adoption_retention', 'work_retention', 'work_retention_receipts', 'work_retention_skips', 'work_catalog_bundles', 'work_bundle_requests', 'work_requester_groups', 'work_sla_policies', 'work_sla_clocks', 'work_asset_audits', 'work_asset_audit_scans', 'work_asset_audit_followups', 'work_stock_lines', 'work_stock_movements', 'work_stock_purchases', 'work_escalation_levels', 'work_waiting_rules', 'work_followups', 'work_sla_pauses', 'work_projects', 'work_project_milestones', 'work_project_tasks', 'work_project_links', 'work_participants', 'work_shares', 'work_custom_fields', 'work_field_values', 'work_custom_statuses', 'work_resolution_codes', 'work_resolutions', 'work_links', 'work_groups', 'work_group_members', 'work_views', 'work_routing_rules', 'work_support_groups', 'work_agent_routing', 'work_scenarios', 'work_record_templates', 'execution_grants', 'execution_grant_revocations', 'execution_decisions', 'execution_fences', 'audit_events', 'adoption_tombstones', 'adoption_history', 'adoption_imports', 'adoption_sources', 'adoption_source_records', 'adoption_ownership', 'adoption_writebacks', 'adoption_holds', 'adoption_reconciliations', 'adoption_identity_map', 'intelligence_engineering_grants', 'intelligence_budgets', 'work_delegations', 'work_sender_identities', 'svc_outbox', 'svc_commands', 'svc_receipts', 'execution_outbox', 'execution_delivery_events', 'work_erasure', 'work_intake_events']);
export const MAX_CHUNK = 8 * 1024 * 1024;
export interface Chunk {
    ordinal: number;
    kind: 'records' | 'attachment';
    sha256: string;
    size: number;
    count: number;
    attachmentId?: string;
    name?: string;
    contentType?: string;
    offset?: number;
    totalSize?: number;
    fullSha256?: string;
}
export interface Manifest {
    format: 'linen-native';
    version: 1;
    sourceWorkspace: string;
    exportId: string;
    snapshotAt: string;
    state: 'ready';
    tables: Record<string, number>;
    chunks: Chunk[];
    excluded: string[];
}
export function supported(table: string) { return (nativeTables as readonly string[]).includes(table) || table === 'identities' || table === 'workspace'; }

// Deliberate exclusions are checked against the actual migrated schema in tests.
// Credentials, live authority, locks and derivative recovery indexes are never restored.
export const excludedTables: Record<string,string> = {
 platform_archive_recovery:'local full-installation restore checkpoint; never imported authority',
 platform_auth_versions:'native authentication/claim state; not workspace import authority',
 platform_auth_session_proofs:'native authentication/claim state; not workspace import authority',
 platform_auth_links:'native authentication/claim state; not workspace import authority',
 platform_auth_steps:'native authentication/claim state; not workspace import authority',
 platform_auth_limits:'native authentication/claim state; not workspace import authority',
 platform_auth_guard:'native authentication/claim state; not workspace import authority',
 platform_first_run:'native authentication/claim state; not workspace import authority',
 platform_auth_policy:'native authentication/claim state; not workspace import authority',
 rer_mail_development_outbox:'local mail proof material; never portable',
 rer_portability_state:'full-installation rer transfer state; excluded from legacy workspace export',
 rer_portability_jobs:'full-installation rer transfer state; excluded from legacy workspace export',
 rer_portability_parts:'full-installation rer transfer state; excluded from legacy workspace export',
 rer_portability_segments:'full-installation rer transfer state; excluded from legacy workspace export',
 rer_portability_owned:'full-installation rer transfer state; excluded from legacy workspace export',
 rer_portability_journal:'full-installation rer transfer state; excluded from legacy workspace export',
 rer_portability_epochs:'full-installation rer transfer state; excluded from legacy workspace export',
 rer_portability_guard:'full-installation rer transfer state; excluded from legacy workspace export',
 ik_jobs:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_original_sets:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_originals:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_sources:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_provenance:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_stages:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_batches:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_targets:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_plan_chunks:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_original_chunks:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_history:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_entries:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_assertions:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_creation_plans:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_reversal_reports:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_streams:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_stream_pages:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_erased_sources:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_erased_targets:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_indexed_jobs:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_plan_index:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_stream_origins:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_stream_revisions:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_publication_fences:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_staging:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_staging_pages:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_staging_chunks:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_staging_index:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_staging_originals:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_custody_revisions:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_native_staging:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_native_staging_index:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_native_staging_values:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_custody_states:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_reversal_fences:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_preparation_receipts:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_preparation_steps:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_stream_sources:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_erasure_progress:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_staging_headers:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_retirements:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_erasure_journal:'full-installation rer archive only; legacy native export does not carry importer custody',
 ik_d1_erasure_tally:'full-installation rer archive only; legacy native export does not carry importer custody',
 freshservice_import_items:'full-installation rer archive only; legacy native export does not carry importer custody',
 freshservice_import_privacy:'full-installation rer archive only; legacy native export does not carry importer custody',

 workspaces:'projected as workspace', users:'private identity projection without credentials',
 memberships:'live membership authority', sessions:'session credentials', bootstrap_lock:'installation lock',
 connections:'provider credentials and configuration require reconnection', workspace_settings:'local execution and configuration policy', login_limits:'local login limiter',
 platform_scheduler_leases:'runtime lease', platform_scheduler_runs:'local scheduler diagnostics',
 work_restore_records:'derived materialization index', work_erasure_guards:'transient erasure guard', work_blob_erasure:'local blob deletion queue; tombstones retained', work_fulfilment_link_guards:'transient link guard',
 execution_secrets:'private execution credentials', execution_erasure_permits:'local immutable-history erasure permit', intelligence_restore_records:'derived materialization index',
 adoption_import_erasures:'local durable import erasure obligations; tombstones retained', adoption_exports:'generated export jobs', adoption_snapshot:'generated snapshot', sqlite_sequence:'sqlite sequence', adoption_chunks:'import bytes projected as adoption_artifacts',
 adoption_deletions:'local object deletion queue; tombstones retained', adoption_erasure_jobs:'encrypted local erasure resume credentials; tombstones retained', adoption_import_records:'derived history association index',
};
