# sx-linen-c-f27 execution plan

Scope: fix only the LIFE-002 operator-search failure reported for the refused ACCESS-008 candidate. No additional acceptance work, interface changes or contract judgments are authorized by the fix round.

1. Initialize fleet identity, credentials, commit hooks and repository toolchain; read the launcher and repository rules.
2. Inspect refused head e8dd72e6b634e11559de32489a60388912fa53e7 and recorded Verify 42524581296, failed journey job 128865352710.
3. Run the failed command with shard 6 of 6 and its CI environment on that exact source. Capture the LIFE-002 assertion result before editing.
4. If the reported failure reproduces, repair only its root cause, transfer the unfinished ACCESS-008 work onto current main without rewriting published history, and run the covering tests and typecheck. Regenerate contract views for checking, restore them, then regenerate and check the source lock last. Audit all candidate identities and messages, push only cloud/sx-linen-c-f27 through the fleet guard, and use the exact-SHA workflow result for handoff.
5. If the reported assertion does not reproduce, follow the brief's explicit non-reproduction stop rule: make no speculative repair and report BLOCKED with actual output. Publish the actual non-secret report and receipts through the separate evidence ref regardless of the product disposition.

No plan rows or contract Status, Gap or Evidence cells will be edited. Existing held duties remain unchanged. Evidence publication does not constitute product READY or landing.
