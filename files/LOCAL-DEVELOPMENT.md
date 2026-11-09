# Local development record

Only tests and the generated source lock change. No assertion was removed or narrowed. No test registration was added. No production source, contract cell, generated contract view, workflow or UI changed.

During development, the fixture SQL initially failed because D1 exec treats newlines as statement boundaries; the multiline statements are now normalized before execution. The extended assertions then passed, but a later existing runtime assertion counted the new operation fixture globally (2 rather than 1). The final fixture deletes only its own completed execution operation after every authority comparison, preserving the later assertion. An intermediate cleanup attempt hit the immutable-grant guard; it was replaced with this one mutable-operation cleanup, keeping grant and decision immutability active. These are local development failures, not CI repairs. No workflow rerun or test weakening was used.

Baseline provider rows are synthetic persisted historical fixtures, not a live provider receipt or new product authority. The scenario itself, its run audit, project, duties and link are created and read through existing public product routes. The baseline grant is expired; no provider call is executed for this proof.
