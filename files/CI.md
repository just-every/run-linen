# Exact candidate CI

Candidate: 3ed22f7464b132584cc0f895531da83b918ef4c3
Verify: https://github.com/just-every/run-linen/actions/runs/42515634381
Event: pull_request from draft PR 149.
Final observed status: completed; conclusion: success.
No success from another SHA is used as candidate proof.

One watcher performs REST reads through gh with GH_TOKEN loaded privately from the launcher bundle. Candidate run discovery on 2026-11-08T19:33:21Z returned no runs immediately after PR creation; discovery after the five-minute interval found Verify 42515634381 on this exact SHA. Subsequent reads are at least 300 seconds apart. No workflow dispatch or rerun was requested.

Baseline main: c4e9852d1098215b0371a6c67a9a721be85a88cf. Its Verify 42514121758 and 42512931164 and Run site 42514121732 were successful when read. This baseline health is distinct from candidate proof and guarded landing.

Final REST receipt: {"conclusion": "success", "event": "pull_request", "head_sha": "3ed22f7464b132584cc0f895531da83b918ef4c3", "html_url": "https://github.com/just-every/run-linen/actions/runs/42515634381", "id": 42515634381, "status": "completed"}

GitHub API calls in this run: 5. No dispatch, retry, rerun or log-archive read was needed.
