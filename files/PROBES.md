# Public-door probes

These are actual requests performed by the passing `dependencyChecks` journey through `tests/services/run.mjs`, with real isolated D1 records. The retained log is `services.log`.

PROBE ASSET-009 4: POST service records, two opposite connects_to edges, and dependency chains on both sides; GET graph and service, change and incident impact -> both connection records retain their exact attributed data, while neither direct connected nodes nor their transitive dependencies or dependents enter the other chain's impact. Existing dependency paths still return their expected nodes.

PROBE ASSET-009 8: Create an unlinked hardware CI; GET its impact and the linked service, change and incident impacts -> unlinked CI remains visible with empty impact sets and unknown coverage. Complete public snapshots of service, incident, change and graph records are identical before the first impact read and after the final impact read. No incident or outage is created and no service state is changed by inference.
