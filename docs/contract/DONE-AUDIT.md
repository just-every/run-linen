Carried-done audit of `docs/contract` against old reference `1a401858c1e58f8392cffdccf7dd3ff0e7e6e4a7`: one row per acceptance point (one per named outcome) of every part of a clause that was done there.

| Clause | Point | Outcome | Asserting test | Result |
| --- | ---: | --- | --- | --- |
| `CHANNEL-009` | 1 | the requester shares by a colleague's work email with a current member | `tests/work/relationship-cases.mjs:122` | asserted |
| `CHANNEL-009` | 1 | an unknown email is refused | `tests/work/relationship-cases.mjs:120` | asserted |
| `CHANNEL-009` | 1 | the colleague reads the public thread | `tests/work/relationship-cases.mjs:125` | asserted |
| `CHANNEL-009` | 1 | the colleague replies | `tests/work/relationship-cases.mjs:130` | asserted |
| `CHANNEL-009` | 1 | the colleague does not see the private note | `tests/work/relationship-cases.mjs:126` | asserted |
| `CHANNEL-009` | 2 | public thread only: never private notes | `tests/work/relationship-cases.mjs:126` | asserted |
| `CHANNEL-009` | 2 | never attachments | none | none |
| `CHANNEL-009` | 2 | replies are conversation, not new intake | none | none |
| `CHANNEL-009` | 2 | restricted requests are never shared | `tests/work/relationship-cases.mjs:142` | asserted |
| `CHANNEL-009` | 2 | HR requests are never shared | none | none |
| `CHANNEL-009` | 3 | a share is revoked | `tests/work/relationship-cases.mjs:132` | asserted |
| `CHANNEL-009` | 3 | a non-party cannot revoke | `tests/work/relationship-cases.mjs:131` | asserted |
| `CHANNEL-009` | 3 | every share and revoke is an audit event | `tests/work/relationship-cases.mjs:138` | asserted |
| `CHANNEL-009` | 3 | the request lists current and earlier shares | `tests/work/relationship-cases.mjs:136` | asserted |
| `CHANNEL-009` | 4 | an on-behalf request shows to the submitter and the person it is for | `tests/work/relationship-cases.mjs:146` | asserted |
| `CHANNEL-009` | 5 | a manager sees two reports' requests but not the HR ticket | `tests/work/relationship-cases.mjs:150` | asserted |
| `CHANNEL-009` | 5 | indirect reports are included | `tests/work/relationship-cases.mjs:151` | asserted |
| `CHANNEL-009` | 5 | the team view is read-only | `tests/work/relationship-cases.mjs:154` | asserted |
| `CHANNEL-009` | 5 | a manager cannot reply | `tests/work/relationship-cases.mjs:158` | asserted |
| `CHANNEL-009` | 5 | private notes are never shown | `tests/work/relationship-cases.mjs:155` | asserted |
| `CHANNEL-009` | 5 | HR and restricted requests are never shown | `tests/work/relationship-cases.mjs:156` | asserted |
| `CHANNEL-009` | 6 | after the HR change the old manager loses visibility | `tests/work/relationship-cases.mjs:161` | asserted |
| `CHANNEL-009` | 6 | the new manager gains it | `tests/work/relationship-cases.mjs:162` | asserted |
| `CHANNEL-009` | 7 | the portal tells requesters that managers can read the public thread | `tests/ui/sharing-journey.mjs:25` | asserted |
| `CATALOG-001` | 1 | a conditional field and a $250 cost are recorded | `tests/work/application-cases.mjs:85` | asserted |
| `CATALOG-001` | 1 | the item is visible only to employees in two departments | `tests/work/application-cases.mjs:166` | asserted |
| `CATALOG-001` | 1 | an eligible employee submits it | `tests/work/application-cases.mjs:172` | asserted |
| `CATALOG-001` | 1 | an ineligible employee is refused | `tests/work/application-cases.mjs:168` | asserted |
| `CATALOG-001` | 2 | an item edit leaves an in-flight request unchanged | `tests/work/application-cases.mjs:101` | asserted |
| `CATALOG-001` | 3 | the owner edits forms | `tests/work/application-cases.mjs:98` | asserted |
| `CATALOG-001` | 3 | employees cannot edit forms | `tests/work/application-cases.mjs:96` | asserted |
| `CATALOG-001` | 3 | short and long text, number, yes/no, single choice and date fields are accepted and answered | `tests/work/application-cases.mjs:95` | asserted |
| `CATALOG-001` | 4 | hidden, unknown and missing conditional answers are refused | `tests/work/application-cases.mjs:91` | asserted |
| `CATALOG-001` | 4 | a visible conditional question is required | `tests/work/application-cases.mjs:107` | asserted |
| `CATALOG-001` | 4 | a required yes/no question accepts either answer | `tests/work/application-cases.mjs:94` | asserted |
| `CATALOG-001` | 5 | cost and delivery are recorded in cents and hours | `tests/work/application-cases.mjs:86` | asserted |
| `CATALOG-001` | 5 | a negative or fractional cost, or a nonpositive or fractional delivery, is refused | none | none |
| `CATALOG-001` | 5 | an empty cost or delivery reads as unknown | none | none |
| `CATALOG-001` | 6 | saving creates a new revision and the old revision cannot start a request | `tests/work/application-cases.mjs:104` | asserted |
| `CATALOG-001` | 6 | the request keeps its original form, answers, cost and delivery | `tests/work/application-cases.mjs:101` | asserted |
| `CATALOG-001` | 6 | a stale owner edit is refused | `tests/work/application-cases.mjs:99` | asserted |
| `CATALOG-001` | 7 | answers inherit the ticket readership | `tests/work/application-cases.mjs:109` | asserted |
| `CATALOG-001` | 7 | erasure removes form content | `tests/work/application-cases.mjs:118` | asserted |
| `CATALOG-001` | 7 | a bundle validates every child before opening work | `tests/work/catalog-quote-cases.mjs:47` | asserted |
| `CATALOG-001` | 8 | an unknown item kind is refused | `tests/work/catalog-quote-cases.mjs:29` | asserted |
| `CATALOG-001` | 8 | a general-service item is a task for its owner | `tests/work/catalog-quote-cases.mjs:166` | asserted |
| `CATALOG-001` | 8 | only the item owner completes the task | `tests/work/catalog-quote-cases.mjs:168` | asserted |
| `CATALOG-001` | 8 | an account item is a manual task | `tests/work/catalog-quote-cases.mjs:173` | asserted |
| `CATALOG-001` | 8 | never a provider action | `tests/work/catalog-quote-cases.mjs:167` | asserted |
| `CATALOG-007` | 1 | only the owner maintains value lists | `tests/work/application-cases.mjs:140` | asserted |
| `CATALOG-007` | 1 | the native editor adds a value and edits an audience | `tests/ui/catalog-quote-journey.mjs:63` | asserted |
| `CATALOG-007` | 1 | an audience edit versions the item | `tests/work/application-cases.mjs:158` | asserted |
| `CATALOG-007` | 1 | a value is renamed | none | none |
| `CATALOG-007` | 1 | retiring preserves existing references | `tests/work/application-cases.mjs:233` | asserted |
| `CATALOG-007` | 1 | a value is never deleted | none | none |
| `CATALOG-007` | 2 | HR reviews a person's attributes through the people API | `tests/work/application-cases.mjs:150` | asserted |
| `CATALOG-007` | 2 | integrations cannot supply attributes | `tests/work/application-cases.mjs:149` | asserted |
| `CATALOG-007` | 2 | pending-person attributes are reviewed through the pending-person review | `tests/work/application-cases.mjs:186` | asserted |
| `CATALOG-007` | 3 | OR within a dimension | `tests/work/application-cases.mjs:166` | asserted |
| `CATALOG-007` | 3 | AND across dimensions | `tests/work/application-cases.mjs:168` | asserted |
| `CATALOG-007` | 3 | empty means unrestricted | `tests/work/application-cases.mjs:177` | asserted |
| `CATALOG-007` | 3 | unbound, unknown, future, inactive and merged facts fail a restricted dimension | `tests/work/application-cases.mjs:249` | asserted |
| `CATALOG-007` | 4 | employee discovery shows eligible items only | `tests/work/application-cases.mjs:167` | asserted |
| `CATALOG-007` | 4 | assistant context holds eligible items only | `tests/intelligence/repair-runtime.mjs:126` | asserted |
| `CATALOG-007` | 5 | the owner has no beneficiary bypass | `tests/work/application-cases.mjs:170` | asserted |
| `CATALOG-007` | 5 | staff on behalf do not apply requester audience | `tests/work/application-cases.mjs:171` | asserted |
| `CATALOG-007` | 5 | employee-capacity filing checks the requester | `tests/work/application-cases.mjs:168` | asserted |
| `CATALOG-007` | 6 | a person or binding change at the commit refuses | `tests/work/application-cases.mjs:213` | asserted |
| `CATALOG-007` | 6 | a refused submission leaves no fulfilment or stock reservation | `tests/work/application-cases.mjs:238` | asserted |
| `CATALOG-007` | 6 | item and membership drift at the commit roll back | `tests/work/application-cases.mjs:224` | asserted |
| `CATALOG-007` | 7 | the request freezes audience and evaluated person revisions | `tests/work/application-cases.mjs:174` | asserted |
| `CATALOG-007` | 7 | later changes do not rewrite or re-gate the in-flight request | `tests/work/application-cases.mjs:231` | asserted |
| `CATALOG-007` | 7 | an amendment is a fresh submission with no prior approval | `tests/work/catalog-quote-cases.mjs:148` | asserted |
| `CATALOG-007` | 8 | staff see the failing dimension but no values | `tests/work/application-cases.mjs:183` | asserted |
| `CATALOG-007` | 8 | audience refusals and value edits are audited without values | `tests/work/catalog-quote-cases.mjs:207` | asserted |
| `CATALOG-007` | 8 | attribute reviews are audited by dimension only | `tests/work/application-cases.mjs:240` | asserted |
| `CATALOG-007` | 8 | erasure clears attributes | `tests/work/application-cases.mjs:253` | asserted |
| `CATALOG-007` | 8 | native restore keeps facts without a live binding | none | none |
| `CATALOG-008` | 1 | a quote-required item refuses submission without its quote | `tests/work/catalog-quote-cases.mjs:53` | asserted |
| `CATALOG-008` | 1 | approvers read the quote and other employees do not | `tests/work/catalog-quote-cases.mjs:153` | asserted |
| `CATALOG-008` | 2 | a non-PDF and an over-20 MiB file are refused | `tests/work/catalog-quote-cases.mjs:58` | asserted |
| `CATALOG-008` | 2 | a later upload replaces an unsubmitted quote | `tests/work/catalog-quote-cases.mjs:67` | asserted |
| `CATALOG-008` | 3 | submission freezes the quote id, hash and size | `tests/work/catalog-quote-cases.mjs:83` | asserted |
| `CATALOG-008` | 3 | a drifted quote refuses the submission | `tests/work/catalog-quote-cases.mjs:76` | asserted |
| `CATALOG-008` | 3 | a submitted quote cannot be replaced; replacing is an amendment | `tests/work/catalog-quote-cases.mjs:89` | asserted |
| `CATALOG-008` | 4 | the owner, current approver and fulfilment owner read the quote | `tests/work/catalog-quote-cases.mjs:103` | asserted |
| `CATALOG-008` | 4 | an approver who decided keeps read | `tests/work/catalog-quote-cases.mjs:141` | asserted |
| `CATALOG-008` | 4 | the beneficiary reads the quote | `tests/work/catalog-quote-cases.mjs:159` | asserted |
| `CATALOG-008` | 4 | unsubmitted quotes are readable by the requester, beneficiary and owner | none | none |
| `CATALOG-008` | 4 | a replaced undecided approver loses access | `tests/work/catalog-quote-cases.mjs:151` | asserted |
| `CATALOG-008` | 5 | other operators, shares and team managers get not found | `tests/work/catalog-quote-cases.mjs:111` | asserted |
| `CATALOG-008` | 5 | auditors, integrations and MCP get not found | `tests/work/catalog-quote-cases.mjs:107` | asserted |
| `CATALOG-008` | 5 | non-readers see only that a quote is attached | `tests/work/catalog-quote-cases.mjs:117` | asserted |
| `CATALOG-008` | 5 | the quote is served as a download, not inline | `tests/work/catalog-quote-cases.mjs:98` | asserted |
| `CATALOG-008` | 6 | search, history, notifications and AI context never carry quote contents | `tests/work/catalog-quote-cases.mjs:132` | asserted |
| `CATALOG-008` | 6 | the conversation attachment list does not carry the quote | `tests/work/catalog-quote-cases.mjs:120` | asserted |
| `CATALOG-008` | 6 | owner export includes the quote | `tests/adoption/application-cases.mjs:51` | asserted |
| `CATALOG-008` | 6 | erasure deletes the quote | `tests/work/catalog-quote-cases.mjs:215` | asserted |
| `CATALOG-008` | 6 | retention deletes the quote | `tests/adoption/retention-cases.mjs:38` | asserted |
| `CATALOG-008` | 7 | reads by others are audited by relation and id | `tests/work/catalog-quote-cases.mjs:104` | asserted |
| `CATALOG-008` | 7 | uploads, replacement and attachment are audited | `tests/work/catalog-quote-cases.mjs:91` | asserted |
| `CATALOG-008` | 7 | no file name enters any audit | `tests/work/catalog-quote-cases.mjs:92` | asserted |
| `CATALOG-008` | 8 | the snapshot never records an amount | `tests/work/catalog-quote-cases.mjs:83` | asserted |
| `CATALOG-008` | 8 | quotes grant no provider authority | `tests/work/catalog-quote-cases.mjs:167` | asserted |
| `CATALOG-008` | 8 | the approval view carries the frozen quote | `tests/work/catalog-quote-cases.mjs:136` | asserted |
| `CATALOG-009` | 1 | a bundle refuses all with one line per failing child | `tests/work/application-cases.mjs:201` | asserted |
| `CATALOG-009` | 1 | a child that needs answers or a quote is refused | `tests/work/catalog-quote-cases.mjs:45` | asserted |
| `CATALOG-009` | 2 | the ticket and every child are one write | `tests/work/application-cases.mjs:206` | asserted |
| `CATALOG-009` | 2 | revision drift at the bundle commit refuses with nothing written | `tests/work/application-cases.mjs:214` | asserted |
| `CATALOG-009` | 3 | a pending person's reviewed attributes are checked at the hold | `tests/work/application-cases.mjs:186` | asserted |
| `CATALOG-009` | 3 | the bound person is checked again at release | `tests/work/pending-person-runtime.mjs:177` | asserted |
| `CATALOG-009` | 4 | a refused release keeps the service held with its reason | `tests/work/pending-person-runtime.mjs:178` | asserted |
| `CATALOG-009` | 4 | a held service whose item becomes restricted stays held at release | `tests/work/pending-person-runtime.mjs:177` | asserted |
| `CATALOG-009` | 5 | the assistant never submits without a required quote | `tests/intelligence/repair-runtime.mjs:114` | asserted |
| `CATALOG-009` | 5 | the assistant refuses a missing required answer | `tests/intelligence/repair-runtime.mjs:121` | asserted |
| `CATALOG-009` | 5 | a changed item refuses the assistant's submission | none | none |
| `CATALOG-009` | 6 | MCP ticket tools expose no quote or catalog submission payloads | `tests/platform/mcp-tools-cases.mjs:120` | asserted |
| `CATALOG-009` | 7 | credentials, quotes and forms grant no provider or approval authority | `tests/work/catalog-quote-cases.mjs:167` | asserted |
| `CATALOG-003` | 1 | a software request creates an approval, an automated license step and manual tasks | `tests/work/catalog-task-cases.mjs:32` | asserted |
| `CATALOG-003` | 1 | a failed automated step is owned and the request stays open | `tests/work/catalog-task-cases.mjs:91` | asserted |
| `CATALOG-003` | 2 | a plan names real teams, earlier steps and whole hours | `tests/work/catalog-task-cases.mjs:16` | asserted |
| `CATALOG-003` | 2 | due dates are elapsed hours from the request | `tests/work/catalog-task-cases.mjs:35` | asserted |
| `CATALOG-003` | 2 | tasks that follow nothing in common run in parallel | `tests/work/catalog-task-cases.mjs:49` | asserted |
| `CATALOG-003` | 3 | later plan edits change only later requests | `tests/work/catalog-task-cases.mjs:120` | asserted |
| `CATALOG-003` | 4 | the item owner is accountable for every obligation | `tests/work/catalog-task-cases.mjs:33` | asserted |
| `CATALOG-003` | 4 | only the named team or the workspace owner marks a task done | `tests/work/catalog-task-cases.mjs:45` | asserted |
| `CATALOG-003` | 5 | no team works a request before its manager approval | `tests/work/catalog-task-cases.mjs:37` | asserted |
| `CATALOG-003` | 5 | no team works a request before capacity is in place | none | none |
| `CATALOG-003` | 5 | a task cannot be done while what it follows is open | `tests/work/catalog-task-cases.mjs:47` | asserted |
| `CATALOG-003` | 6 | a done task is a recorded completion, not verified | `tests/work/catalog-task-cases.mjs:79` | asserted |
| `CATALOG-003` | 7 | only the obligation owner or workspace owner waives | `tests/work/catalog-task-cases.mjs:96` | asserted |
| `CATALOG-003` | 7 | a waiver needs a reason | `tests/work/catalog-task-cases.mjs:97` | asserted |
| `CATALOG-003` | 7 | the waiver is audited | `tests/work/catalog-task-cases.mjs:105` | asserted |
| `CATALOG-003` | 7 | an automated step with an applied or uncertain effect must be reconciled instead of waived | none | none |
| `CATALOG-003` | 8 | a waived step is shown as waived | `tests/work/catalog-task-cases.mjs:108` | asserted |
| `CATALOG-003` | 8 | a waived step releases what follows it | `tests/work/catalog-task-cases.mjs:109` | asserted |
| `CATALOG-003` | 8 | the request closes only when every responsibility is verified, done or waived | `tests/work/catalog-task-cases.mjs:112` | asserted |
| `CATALOG-003` | 8 | cancelling the request cancels the open tasks | `tests/work/catalog-task-cases.mjs:123` | asserted |
| `CATALOG-004` | 1 | one approval | `tests/work/bundle-cases.mjs:45` | asserted |
| `CATALOG-004` | 1 | five child fulfilments | `tests/work/bundle-cases.mjs:17` | asserted |
| `CATALOG-004` | 1 | the bundle completes only when all children verify | `tests/work/bundle-cases.mjs:66` | asserted |
| `CATALOG-004` | 2 | only the owner builds a bundle from existing items | `tests/work/bundle-cases.mjs:12` | asserted |
| `CATALOG-004` | 2 | items are pinned at their revision | `tests/work/bundle-cases.mjs:68` | asserted |
| `CATALOG-004` | 3 | one ticket with one child fulfilment per item | `tests/work/bundle-cases.mjs:18` | asserted |
| `CATALOG-004` | 3 | all children are for the same person, purpose and expiry | none | none |
| `CATALOG-004` | 3 | a changed bundle or item refuses the request | `tests/work/bundle-cases.mjs:68` | asserted |
| `CATALOG-004` | 4 | a partial decision is refused and records nothing | `tests/work/bundle-cases.mjs:27` | asserted |
| `CATALOG-004` | 4 | one decision records every manager-gated child | `tests/work/bundle-cases.mjs:46` | asserted |
| `CATALOG-004` | 4 | children are never approved one at a time | `tests/work/bundle-cases.mjs:25` | asserted |
| `CATALOG-004` | 5 | grants and verification run per child | `tests/work/bundle-cases.mjs:55` | asserted |
| `CATALOG-004` | 5 | stock and licence capacity stay per child | none | none |
| `CATALOG-004` | 5 | a bundle never creates a grant | none | none |
| `CATALOG-004` | 6 | verified children are shown per child | `tests/work/bundle-cases.mjs:60` | asserted |
| `CATALOG-004` | 6 | an unverified child keeps the bundle in progress | `tests/work/bundle-cases.mjs:62` | asserted |
| `CATALOG-006` | 1 | the service is held | `tests/work/pending-person-runtime.mjs:105` | asserted |
| `CATALOG-006` | 1 | a service held for the pending hire shows its reason | none | none |
| `CATALOG-006` | 2 | binding the account releases the service into fulfilment | `tests/work/pending-person-runtime.mjs:144` | asserted |
| `CATALOG-006` | 3 | an unbound pending person is edited | `tests/work/pending-person-runtime.mjs:126` | asserted |
| `CATALOG-006` | 4 | withdrawing cancels the request | `tests/work/pending-person-runtime.mjs:202` | asserted |
| `CATALOG-006` | 5 | a person without review cannot be named | `tests/work/pending-person-runtime.mjs:73` | asserted |
| `DESK-001` | 1 | two groups are created | `tests/work/desk-group-cases.mjs:25` | asserted |
| `DESK-001` | 1 | the "Unassigned P1" view is saved and lists its tickets | `tests/work/desk-group-cases.mjs:86` | asserted |
| `DESK-001` | 1 | five tickets are bulk-assigned | `tests/work/desk-group-cases.mjs:97` | asserted |
| `DESK-001` | 2 | a group lead's view excludes another group's restricted ticket | `tests/work/desk-group-cases.mjs:59` | asserted |
| `DESK-001` | 3 | the owner creates groups, adds agents and names leads | `tests/work/desk-group-cases.mjs:25` | asserted |
| `DESK-001` | 4 | placing a ticket in a group that excludes its owner is refused | `tests/work/desk-group-cases.mjs:41` | asserted |
| `DESK-001` | 4 | assigning a non-member is refused | `tests/work/desk-group-cases.mjs:46` | asserted |
| `DESK-001` | 4 | removing a member who owns an open ticket is refused | `tests/work/desk-group-cases.mjs:48` | asserted |
| `DESK-001` | 4 | an MCP queue grant is not group membership and an integration principal is never a member, lead or assignee | none | none |
| `DESK-001` | 5 | a lead's view lists the group's readable non-restricted tickets | `tests/work/desk-group-cases.mjs:59` | asserted |
| `DESK-001` | 5 | agents never list restricted tickets | `tests/work/desk-group-cases.mjs:65` | asserted |
| `DESK-001` | 5 | the owner still reads the restricted ticket | `tests/work/desk-group-cases.mjs:64` | asserted |
| `DESK-001` | 6 | agents read the group in the queue | `tests/work/desk-group-cases.mjs:68` | asserted |
| `DESK-001` | 6 | requesters do not | `tests/work/desk-group-cases.mjs:69` | asserted |
| `DESK-001` | 7 | a shared view is offered to other agents and a private one is not | `tests/work/desk-group-cases.mjs:87` | asserted |
| `DESK-001` | 7 | a view narrows its reader's own queue and never widens it | `tests/work/desk-group-cases.mjs:91` | asserted |
| `DESK-001` | 7 | invalid filters and sorts are refused | `tests/work/desk-group-cases.mjs:81` | asserted |
| `DESK-001` | 7 | only the creator or workspace owner removes a view | `tests/work/desk-group-cases.mjs:93` | asserted |
| `DESK-001` | 8 | one bulk command changes or refuses each ticket and reports both counts | `tests/work/desk-group-cases.mjs:97` | asserted |
| `DESK-018` | 1 | keyboard-only triage uses no pointer input | `tests/ui/desk-group-browser.mjs:134` | asserted |
| `DESK-018` | 2 | j opens the next ticket | `tests/ui/desk-group-browser.mjs:105` | asserted |
| `DESK-018` | 2 | k opens the previous ticket | none | none |
| `DESK-018` | 3 | a assigns the open ticket to oneself | `tests/ui/desk-group-browser.mjs:110` | asserted |
| `DESK-018` | 4 | r writes a shared reply | `tests/ui/desk-group-browser.mjs:113` | asserted |
| `DESK-018` | 4 | n writes a private note | none | none |
| `DESK-018` | 5 | s pauses the open ticket | `tests/ui/desk-group-browser.mjs:126` | asserted |
| `DESK-018` | 5 | c closes the open ticket | none | none |
| `DESK-018` | 6 | Ctrl/⌘+Enter sends the field's form | `tests/ui/desk-group-browser.mjs:117` | asserted |
| `DESK-018` | 6 | Escape leaves a field | none | none |
| `DESK-018` | 7 | ? shows the shortcut reference | `tests/ui/desk-group-browser.mjs:108` | asserted |
| `DESK-018` | 8 | x runs a scenario on the open ticket | `tests/ui/desk-scenario-browser.mjs:70` | asserted |
| `DESK-002` | 1 | type incident and high impact | `tests/work/classification-cases.mjs:32` | asserted |
| `DESK-002` | 2 | the proposed P1 with its reason | `tests/work/classification-cases.mjs:34` | asserted |
| `DESK-002` | 3 | the override to P2 | `tests/work/classification-cases.mjs:45` | asserted |
| `DESK-002` | 3 | the override is audited | `tests/work/classification-cases.mjs:47` | asserted |
| `DESK-003` | 1 | round-robin assigns the available agent | `tests/work/desk-routing-cases.mjs:46` | asserted |
| `DESK-003` | 1 | load-based assigns the available agent | `tests/work/desk-routing-cases.mjs:50` | asserted |
| `DESK-003` | 2 | a VIP request routes to executive support | `tests/work/desk-routing-cases.mjs:52` | asserted |
| `DESK-003` | 3 | a Payroll service ticket routes to Payroll's support group | `tests/work/desk-routing-cases.mjs:72` | asserted |
| `DESK-003` | 3 | a laptop CI ticket routes to that CI's support group | `tests/work/desk-routing-cases.mjs:73` | asserted |
| `DESK-003` | 4 | shifts, skills, round-robin and load methods and caps are applied | `tests/work/desk-routing-cases.mjs:79` | asserted |
| `DESK-003` | 4 | a group whose assignment method is none places the ticket without an agent | none | none |
| `DESK-003` | 5 | VIP status is a requester group the owner names | `tests/work/desk-routing-cases.mjs:52` | asserted |
| `DESK-003` | 6 | routing on creation | `tests/work/desk-routing-cases.mjs:46` | asserted |
| `DESK-003` | 6 | routing on classification with no group | `tests/work/desk-routing-cases.mjs:87` | asserted |
| `DESK-003` | 6 | routing when an agent asks, at the revision read | `tests/work/desk-routing-cases.mjs:97` | asserted |
| `DESK-003` | 7 | the item's support group comes before every rule | `tests/work/desk-routing-cases.mjs:72` | asserted |
| `DESK-003` | 7 | the matching rule decides | `tests/work/desk-routing-cases.mjs:88` | asserted |
| `DESK-003` | 7 | with no match nothing changes | `tests/work/desk-routing-cases.mjs:84` | asserted |
| `DESK-003` | 7 | a rule with several set conditions decides only when every one matches | none | none |
| `DESK-003` | 8 | candidates are on shift, skilled and under the cap | `tests/work/desk-routing-cases.mjs:46` | asserted |
| `DESK-003` | 8 | an inactive agent is not a candidate | none | none |
| `DESK-019` | 1 | round-robin takes the next candidate | `tests/work/desk-routing-cases.mjs:46` | asserted |
| `DESK-019` | 2 | load takes the least-loaded candidate | `tests/work/desk-routing-cases.mjs:50` | asserted |
| `DESK-019` | 3 | with no candidate the ticket stays in the group unassigned | none | none |
| `DESK-019` | 4 | restricted tickets are placed but never auto-assigned | `tests/work/desk-routing-cases.mjs:59` | asserted |
| `DESK-019` | 5 | every routing and assignment is kept with actor, time, before and after | `tests/work/desk-routing-cases.mjs:101` | asserted |
| `DESK-019` | 5 | routing history is for agents only | `tests/work/desk-routing-cases.mjs:103` | asserted |
| `DESK-019` | 6 | requesters do not read groups or routing | `tests/work/desk-routing-cases.mjs:104` | asserted |
| `DESK-004` | 1 | a P2 opened 4:30 pm Friday before a federal holiday Monday is due Tuesday | `tests/work/sla-policy-cases.mjs:38` | asserted |
| `DESK-004` | 2 | pausing for the requester extends the due time | `tests/work/sla-policy-cases.mjs:68` | asserted |
| `DESK-004` | 2 | the breach shows on the ticket | `tests/work/sla-policy-cases.mjs:41` | asserted |
| `DESK-004` | 2 | the breach shows in the report | `tests/work/sla-policy-cases.mjs:87` | asserted |
| `DESK-004` | 3 | policies are ordered and a ticket binds the first match | `tests/work/sla-policy-cases.mjs:46` | asserted |
| `DESK-004` | 3 | a policy's category criterion binds only tickets of that category | none | none |
| `DESK-004` | 3 | classification applied later binds from the ticket's opening | `tests/work/sla-policy-cases.mjs:37` | asserted |
| `DESK-004` | 3 | a priority change rebinds the policy from the ticket's opening | none | none |
| `DESK-004` | 4 | a business calendar counts its working minutes in its time zone | `tests/work/sla-policy-cases.mjs:37` | asserted |
| `DESK-004` | 4 | without a calendar every minute counts | `tests/work/sla-policy-cases.mjs:48` | asserted |
| `DESK-004` | 5 | a calendar names its location | `tests/work/sla-policy-cases.mjs:36` | asserted |
| `DESK-004` | 5 | the location's federal holiday catalog skips a Monday holiday | `tests/work/sla-policy-cases.mjs:37` | asserted |
| `DESK-004` | 5 | a Saturday holiday is observed the Friday before | none | none |
| `DESK-004` | 5 | a Sunday holiday is observed the Monday after | none | none |
| `DESK-004` | 5 | Inauguration Day is excluded | none | none |
| `DESK-004` | 5 | a calendar's own listed dates are observed beside the catalog | none | none |
| `DESK-004` | 6 | first response is met by the first public agent reply | `tests/work/sla-policy-cases.mjs:75` | asserted |
| `DESK-004` | 6 | resolution runs from the opening | `tests/work/sla-policy-cases.mjs:38` | asserted |
| `DESK-004` | 6 | resolution is met by closing | none | none |
| `DESK-004` | 7 | a next-response target starts and is met by the next public agent reply | `tests/work/sla-policy-cases.mjs:80` | asserted |
| `DESK-020` | 1 | only the parties the policy pauses on stop the clock; an internal hold does not | `tests/work/sla-policy-cases.mjs:69` | asserted |
| `DESK-020` | 2 | a pause after the due time never clears the breach | `tests/work/sla-policy-cases.mjs:56` | asserted |
| `DESK-020` | 3 | the breach time is the due time | `tests/work/sla-policy-cases.mjs:41` | asserted |
| `DESK-020` | 3 | a target met after its due time is breached | `tests/work/sla-policy-cases.mjs:75` | asserted |
| `DESK-020` | 4 | the owner reads each ticket's targets | `tests/work/sla-policy-cases.mjs:35` | asserted |
| `DESK-020` | 4 | the owner reads the period report | `tests/work/sla-policy-cases.mjs:87` | asserted |
| `DESK-020` | 4 | the requester is refused both reads | `tests/work/sla-policy-cases.mjs:88` | asserted |
| `DESK-020` | 4 | a service agent reads each ticket's targets and the period report | none | none |
| `DESK-020` | 4 | an auditor reads each ticket's targets and the period report | none | none |
| `DESK-005` | 1 | level-1 then level-2 escalation | `tests/work/sla-policy-cases.mjs:137` | asserted |
| `DESK-005` | 2 | the owner sets escalation levels on the targets | `tests/work/sla-policy-cases.mjs:110` | asserted |
| `DESK-005` | 3 | a level fires at its offset for the assignee or a named member | `tests/work/sla-policy-cases.mjs:131` | asserted |
| `DESK-005` | 4 | a firing adds a private note naming the level, person and due time | `tests/work/sla-policy-cases.mjs:140` | asserted |
| `DESK-005` | 4 | the requester never sees it | `tests/work/sla-policy-cases.mjs:142` | asserted |
| `DESK-005` | 5 | each level fires once | `tests/work/sla-policy-cases.mjs:144` | asserted |
| `DESK-005` | 5 | scheduled levels stop when the target is met | `tests/work/sla-policy-cases.mjs:148` | asserted |
| `DESK-005` | 6 | each is persisted with its next due time | `tests/work/sla-policy-cases.mjs:132` | asserted |
| `DESK-005` | 6 | the next due time is recomputed as SLA pauses move a target | none | none |
| `DESK-005` | 6 | each records why it stopped | `tests/work/sla-policy-cases.mjs:187` | asserted |
| `DESK-021` | 1 | the reminder, then the disclosed resolution | `tests/work/sla-policy-cases.mjs:172` | asserted |
| `DESK-021` | 1 | a reply before the due time stops both | `tests/work/sla-policy-cases.mjs:187` | asserted |
| `DESK-021` | 2 | reminder and resolution count business days from the pause | `tests/work/sla-policy-cases.mjs:197` | asserted |
| `DESK-021` | 3 | the reminder is a public message the requester sees | `tests/work/sla-policy-cases.mjs:166` | asserted |
| `DESK-021` | 4 | the ticket closes with a public disclosure | `tests/work/sla-policy-cases.mjs:171` | asserted |
| `DESK-021` | 4 | the requester can reopen it | none | none |
| `DESK-021` | 5 | a requester message after the pause stops both | `tests/work/sla-policy-cases.mjs:187` | asserted |
| `DESK-021` | 5 | leaving the paused-awaiting-requester state stops both | none | none |
| `DESK-021` | 6 | business days skip weekends and holidays on the SLA calendar | `tests/work/sla-policy-cases.mjs:197` | asserted |
| `DESK-006` | 1 | merging notifies both requesters on the surviving ticket | `tests/work/relationship-cases.mjs:31` | asserted |
| `DESK-006` | 2 | a split ticket gets its own SLA | `tests/work/relationship-cases.mjs:45` | asserted |
| `DESK-006` | 2 | the split ticket keeps its own history | `tests/work/relationship-cases.mjs:80` | asserted |
| `DESK-006` | 2 | the split ticket links back to the original message | `tests/work/relationship-cases.mjs:43` | asserted |
| `DESK-006` | 3 | a linked laptop and problem each list the ticket | `tests/work/relationship-cases.mjs:62` | asserted |
| `DESK-006` | 4 | the duplicate closes with a pointer | `tests/work/relationship-cases.mjs:27` | asserted |
| `DESK-006` | 4 | the duplicate's requester becomes a participant | `tests/work/relationship-cases.mjs:24` | asserted |
| `DESK-006` | 4 | the duplicate's beneficiary becomes a participant | none | none |
| `DESK-006` | 4 | participants read only public messages | `tests/work/relationship-cases.mjs:30` | asserted |
| `DESK-006` | 4 | participants never see attachments | none | none |
| `DESK-006` | 4 | participants cannot act on the surviving ticket | `tests/work/relationship-cases.mjs:33` | asserted |
| `DESK-006` | 4 | the surviving ticket carries a public merge notice | `tests/work/relationship-cases.mjs:29` | asserted |
| `DESK-006` | 4 | the duplicate carries a public merge notice | none | none |
| `DESK-006` | 5 | HR tickets are never merged | `tests/work/relationship-cases.mjs:21` | asserted |
| `DESK-006` | 6 | a split copies the chosen public message citing its source record | `tests/work/relationship-cases.mjs:43` | asserted |
| `DESK-006` | 6 | the split ticket keeps the requester | `tests/work/relationship-cases.mjs:42` | asserted |
| `DESK-006` | 6 | the split ticket keeps the beneficiary | none | none |
| `DESK-006` | 6 | the split carries the classification and binds its own SLA | `tests/work/relationship-cases.mjs:45` | asserted |
| `DESK-006` | 7 | a parent is set and a cycle refused | `tests/work/relationship-cases.mjs:48` | asserted |
| `DESK-006` | 7 | an engineering issue must be an https URL | `tests/work/relationship-cases.mjs:58` | asserted |
| `DESK-006` | 7 | asset, problem and engineering-issue links are kept | `tests/work/relationship-cases.mjs:60` | asserted |
| `DESK-006` | 7 | a ticket links to a change | none | none |
| `DESK-006` | 8 | a linked asset, problem or change lists only the linked tickets its reader can read | none | none |
| `DESK-006` | 8 | a reader without staff access is refused the whole listing | `tests/work/relationship-cases.mjs:63` | asserted |
| `DESK-008` | 1 | a canned response inserts the requester's name | `tests/work/response-cases.mjs:15` | asserted |
| `DESK-008` | 2 | a 20-message summary with citations | `tests/work/response-cases.mjs:33` | asserted |
| `DESK-008` | 3 | only owners and operators manage and insert canned responses | `tests/work/response-cases.mjs:11` | asserted |
| `DESK-008` | 3 | the three placeholders fill | `tests/work/response-cases.mjs:15` | asserted |
| `DESK-008` | 3 | unknown and malformed placeholders are refused | `tests/work/response-cases.mjs:13` | asserted |
| `DESK-008` | 4 | shared-reply generation never receives private notes | `tests/work/response-cases.mjs:38` | asserted |
| `DESK-008` | 4 | only selected reviewed employee-audience knowledge is used | `tests/work/response-cases.mjs:29` | asserted |
| `DESK-008` | 5 | a working summary uses the agent's permitted messages and knowledge | `tests/work/response-cases.mjs:40` | asserted |
| `DESK-008` | 5 | the summary is returned only to the agent | `tests/work/response-cases.mjs:30` | asserted |
| `DESK-008` | 5 | generated text is not stored as a message | `tests/work/response-cases.mjs:39` | asserted |
| `DESK-008` | 6 | unknown citations refuse the result | `tests/work/response-cases.mjs:46` | asserted |
| `DESK-008` | 6 | changed context or authority refuses a late result | `tests/work/response-cases.mjs:53` | asserted |
| `DESK-008` | 7 | a draft stays unsent until the service agent sends it | `tests/ui/response-journey.mjs:31` | asserted |
| `DESK-008` | 7 | the composer's selected visibility is preserved | none | none |
| `DESK-008` | 8 | generated knowledge is used when both recipients can read every source record | `tests/work/knowledge-draft-cases.mjs:57` | asserted |
| `DESK-008` | 8 | unreadable requester, beneficiary or pending-beneficiary context is refused | `tests/work/knowledge-draft-cases.mjs:65` | asserted |
| `DESK-008` | 8 | a late rights change never posts the reply | `tests/work/knowledge-draft-cases.mjs:74` | asserted |
| `DESK-010` | 1 | an Office dropdown and an Awaiting parts status are added and used, and the SLA pauses | `tests/work/desk-field-cases.mjs:70` | asserted |
| `DESK-010` | 2 | a field shows on the ticket types its definition names | `tests/work/desk-field-cases.mjs:47` | asserted |
| `DESK-010` | 3 | a custom status is a named vendor wait | `tests/work/desk-field-cases.mjs:70` | asserted |
| `DESK-010` | 3 | whether it stops the clock is the bound policy's pause rule | `tests/work/desk-field-cases.mjs:76` | asserted |
| `DESK-010` | 4 | ticket readers read field values and status | `tests/work/desk-field-cases.mjs:71` | asserted |
| `DESK-010` | 4 | a requester cannot write a field | `tests/work/desk-field-cases.mjs:44` | asserted |
| `DESK-010` | 4 | people a ticket is shared with see its public thread only | none | none |
| `DESK-023` | 1 | the console refuses a close without a resolution code | `tests/ui/desk-field-journey.mjs:29` | asserted |
| `DESK-023` | 1 | the API refuses a close without a resolution code | `tests/work/desk-field-cases.mjs:80` | asserted |
| `DESK-023` | 1 | a bulk update refuses a close without a resolution code | `tests/work/desk-field-cases.mjs:85` | asserted |
| `DESK-023` | 2 | code and close notes are on the record | `tests/work/desk-field-cases.mjs:93` | asserted |
| `DESK-023` | 2 | REPORT-001 counts resolutions by code | `tests/work/desk-field-cases.mjs:132` | asserted |
| `DESK-023` | 3 | a field required on closed or on a named status is enforced | `tests/work/desk-field-cases.mjs:107` | asserted |
| `DESK-023` | 4 | close notes are kept on the ticket | `tests/work/desk-field-cases.mjs:88` | asserted |
| `DESK-023` | 4 | close notes are posted as the public closing line | none | none |
| `DESK-023` | 5 | the default codes plus Duplicate and No response | `tests/work/desk-field-cases.mjs:22` | asserted |
| `DESK-023` | 5 | a merge closes the duplicate with Duplicate and its closing line | `tests/work/desk-field-cases.mjs:115` | asserted |
| `DESK-023` | 5 | the awaiting-requester rule closes with No response and its disclosure | none | none |
| `DESK-023` | 6 | merge is refused while a required field is empty | `tests/work/desk-field-cases.mjs:118` | asserted |
| `DESK-023` | 6 | the automatic close waits while a required field is empty | none | none |
| `DESK-023` | 7 | REPORT-001 counts closed tickets by their latest code | `tests/work/desk-field-cases.mjs:132` | asserted |
| `DESK-011` | 1 | an IT agent cannot read an HR-workspace ticket | `tests/work/department-space-cases.mjs:32` | asserted |
| `DESK-011` | 2 | the employee portal shows both catalogs | `tests/work/department-ops-cases.mjs:38` | asserted |
| `DESK-011` | 3 | the owner grants current staff membership | `tests/ui/department-browser.mjs:48` | asserted |
| `DESK-011` | 3 | employee department attributes grant no staff authority | none | none |
| `DESK-011` | 4 | membership intersects existing roles and private-note rules | `tests/work/department-space-cases.mjs:36` | asserted |
| `DESK-011` | 4 | the owner's global authority remains | `tests/work/department-space-cases.mjs:46` | asserted |
| `DESK-011` | 5 | legacy records keep their permissions | `tests/work/department-space-cases.mjs:97` | asserted |
| `DESK-011` | 6 | groups, SLA policies, routing and knowledge carry department ownership | `tests/work/department-ops-cases.mjs:81` | asserted |
| `DESK-011` | 6 | the portal combines eligible catalogs and employee knowledge | `tests/work/department-ops-cases.mjs:60` | asserted |
| `DESK-011` | 7 | department staff membership grants no quote access | `tests/ui/department-browser.mjs:251` | asserted |
| `DESK-011` | 7 | a request uses its item's department | `tests/work/department-ops-cases.mjs:43` | asserted |
| `DESK-011` | 8 | a mixed-department bundle refuses atomically with its reasons | `tests/work/department-ops-cases.mjs:47` | asserted |
| `DESK-011` | 8 | a same-department bundle keeps its atomic behavior | `tests/ui/department-browser.mjs:258` | asserted |
| `DESK-024` | 1 | a handed-off request keeps its history | `tests/work/department-space-cases.mjs:80` | asserted |
| `DESK-024` | 1 | only the owner hands a ticket off | `tests/work/department-space-cases.mjs:73` | asserted |
| `DESK-024` | 1 | the handoff needs a reason and is recorded | `tests/work/department-space-cases.mjs:86` | asserted |
| `DESK-024` | 1 | a handoff at a stale revision is refused | none | none |
| `DESK-024` | 2 | identity and sensitivity remain | `tests/work/department-space-cases.mjs:77` | asserted |
| `DESK-024` | 2 | messages remain | `tests/work/department-space-cases.mjs:80` | asserted |
| `DESK-024` | 2 | attachments remain | `tests/work/department-space-cases.mjs:85` | asserted |
| `DESK-024` | 2 | the frozen SLA clock remains | `tests/work/department-space-cases.mjs:84` | asserted |
| `DESK-024` | 2 | the ticket's submitted forms remain | none | none |
| `DESK-024` | 2 | incompatible assignments are cleared | `tests/ui/department-browser.mjs:169` | asserted |
| `DESK-024` | 3 | the HR workspace stays a live access requirement after moving out | `tests/work/department-space-cases.mjs:103` | asserted |
| `DESK-024` | 3 | later moves, including to legacy, cannot remove it | `tests/work/department-space-cases.mjs:123` | asserted |
| `DESK-024` | 4 | without the retained HR membership a nonowner cannot use staff doors | `tests/work/department-space-cases.mjs:107` | asserted |
| `DESK-024` | 4 | with every membership the staff door opens | `tests/work/department-space-cases.mjs:113` | asserted |
| `DESK-024` | 4 | requesters keep their public view | `tests/work/department-space-cases.mjs:110` | asserted |
| `DESK-024` | 5 | HR-service membership grants no HR employee-record authority | `tests/ui/department-browser.mjs:151` | asserted |
| `DESK-024` | 6 | managers cannot recover a retained-HR ticket | `tests/work/department-space-cases.mjs:108` | asserted |
| `DESK-024` | 6 | normal manager public viewing continues | `tests/work/department-space-cases.mjs:89` | asserted |
| `DESK-024` | 7 | withdrawal applies to reads, assignments, routing, scenarios and tasks | `tests/work/department-ops-cases.mjs:137` | asserted |
| `DESK-024` | 7 | withdrawal applies to reports before aggregation | `tests/work/department-report-cases.mjs:34` | asserted |
| `DESK-024` | 7 | derived service and execution views exclude retained-HR sources | `tests/services/department-source-cases.mjs:42` | asserted |
| `DESK-024` | 7 | HR sources cannot be copied into a project plan | `tests/work/department-ops-cases.mjs:134` | asserted |
| `DESK-024` | 8 | archives keep department metadata and restore memberships inert | `tests/platform/base-auth-transfer.mjs:229` | asserted |
| `DESK-012` | 1 | 15 manual minutes appear in the effort report | `tests/work/time-cases.mjs:43` | asserted |
| `DESK-012` | 2 | a measured interval appears in the effort report | `tests/work/time-cases.mjs:43` | asserted |
| `DESK-013` | 1 | a monthly first-business-day plan skips the holiday to the next business day | `tests/work/recurrence-cases.mjs:14` | asserted |
| `DESK-013` | 2 | the plan snapshots its time zone, business days, holidays and local hour | `tests/work/recurrence-cases.mjs:15` | asserted |
| `DESK-013` | 3 | month-end dates clamp without drifting the anchor | `tests/work/recurrence-cases.mjs:48` | asserted |
| `DESK-013` | 4 | non-business dates roll forward | `tests/work/recurrence-cases.mjs:51` | asserted |
| `DESK-013` | 5 | first-business-day schedules use the first of the month | `tests/work/recurrence-cases.mjs:27` | asserted |
| `DESK-013` | 6 | a daylight-saving fold uses the earliest instant and a skipped hour advances | none | none |
| `DESK-013` | 7 | a paused plan creates nothing | `tests/work/recurrence-cases.mjs:20` | asserted |
| `DESK-013` | 7 | resuming catches up one occurrence per tick | `tests/work/recurrence-cases.mjs:25` | asserted |
| `DESK-013` | 8 | task plans create owned duties, each separately completed | `tests/work/recurrence-cases.mjs:34` | asserted |
| `DESK-015` | 1 | one run changes category, priority, group and status and adds a private note in one audit entry | `tests/work/desk-scenario-cases.mjs:49` | asserted |
| `DESK-015` | 1 | the requester sees no note | `tests/work/desk-scenario-cases.mjs:52` | asserted |
| `DESK-015` | 2 | an agent outside the group is not offered the scenario | `tests/work/desk-scenario-cases.mjs:35` | asserted |
| `DESK-015` | 2 | a direct call to run it is refused and changes nothing | `tests/work/desk-scenario-cases.mjs:41` | asserted |
| `DESK-015` | 3 | a step outside the runner's role applies nothing | `tests/work/desk-scenario-cases.mjs:69` | asserted |
| `DESK-015` | 4 | an agent cannot save into another group or the workspace | `tests/work/desk-scenario-cases.mjs:31` | asserted |
| `DESK-015` | 4 | a workspace scenario is offered to every agent | `tests/work/desk-scenario-cases.mjs:65` | asserted |
| `DESK-015` | 5 | classification, group and owner, field, reply and status steps apply | `tests/work/desk-scenario-cases.mjs:103` | asserted |
| `DESK-015` | 6 | a step outside the runner's roles leaves nothing applied | `tests/work/desk-scenario-cases.mjs:67` | asserted |
| `DESK-015` | 6 | an HR runner's field and status steps apply | none | none |
| `DESK-015` | 7 | a step refused while applying stops the run with one audit entry of the changes made | `tests/work/desk-scenario-cases.mjs:120` | asserted |
| `DESK-015` | 8 | runs start from the ticket with x | `tests/ui/desk-scenario-browser.mjs:70` | asserted |
| `DESK-015` | 8 | runs start from the bulk-update screen | `tests/ui/desk-scenario-browser.mjs:161` | asserted |
| `DESK-015` | 8 | a run started at phone width (390 px) applies the scenario | `tests/ui/desk-scenario-browser.mjs:161` | asserted |
| `DESK-025` | 1 | a "New laptop setup" template pre-fills a new ticket | `tests/work/desk-scenario-cases.mjs:85` | asserted |
| `DESK-025` | 2 | anyone starts a request from a template and edits the draft | `tests/work/desk-scenario-cases.mjs:83` | asserted |
| `DESK-025` | 3 | a scenario starts a named project with its duties | `tests/work/desk-scenario-cases.mjs:137` | asserted |
| `DESK-025` | 3 | a scenario links an existing project record | `tests/work/desk-scenario-cases.mjs:141` | asserted |
| `DESK-025` | 4 | the project normal-ticket boundary is checked before any field changes | `tests/work/desk-scenario-cases.mjs:145` | asserted |
| `DESK-025` | 5 | the project, duties and ticket link are committed together | `tests/work/desk-scenario-cases.mjs:138` | asserted |
| `DESK-025` | 5 | starting a plan grants no provider authority | none | none |
| `DESK-025` | 5 | the run audit links to the plan | none | none |
| `DESK-025` | 6 | task templates pre-fill an editable title, owner and due date | `tests/ui/desk-scenario-browser.mjs:119` | asserted |
| `DESK-025` | 7 | change templates use the exact-version standard change catalog | `tests/services/template-cases.mjs:19` | asserted |
| `DESK-016` | 1 | a serial finds the asset, its tickets and its assigned person | `tests/work/search-cases.mjs:30` | asserted |
| `DESK-016` | 2 | a requester's name finds their tickets | `tests/work/search-cases.mjs:33` | asserted |
| `DESK-016` | 3 | an IT agent's search for an HR-ticket term returns no result and no count | `tests/work/search-cases.mjs:43` | asserted |
| `DESK-016` | 4 | each source's readership and refreshed membership apply before matching and counts | `tests/work/search-cases.mjs:56` | asserted |
| `DESK-016` | 4 | private notes are excluded for a reader without access | `tests/work/search-cases.mjs:46` | asserted |
| `DESK-016` | 4 | no index, model or external flow is created | none | none |
| `DESK-016` | 5 | privileged searches are audited | `tests/work/search-cases.mjs:73` | asserted |
| `DESK-016` | 5 | the audit stores no query content | none | none |
| `DESK-016` | 6 | HR agents use the search | `tests/work/search-cases.mjs:45` | asserted |
| `DESK-016` | 6 | employees are refused the agent search | `tests/work/search-cases.mjs:48` | asserted |
| `DESK-016` | 6 | employees retain their reviewed-knowledge search | none | none |
| `DESK-016` | 7 | people expose names and IDs only, without email | `tests/work/search-cases.mjs:27` | asserted |
| `DESK-016` | 7 | active members are searchable | `tests/work/search-cases.mjs:23` | asserted |
| `DESK-016` | 7 | a reviewed binding deduplicates member and person without inference | `tests/work/search-cases.mjs:25` | asserted |
| `DESK-016` | 8 | tickets match native ID, title and readable conversation text | `tests/work/search-cases.mjs:34` | asserted |
| `DESK-016` | 8 | assets match serial and asset tag | `tests/work/search-cases.mjs:31` | asserted |
| `DESK-026` | 1 | a serial finds linked tickets and the custodian, never an inferred identity | `tests/ui/search-journey.mjs:17` | asserted |
| `DESK-026` | 2 | CI source checks apply | `tests/work/search-cases.mjs:61` | asserted |
| `DESK-026` | 2 | articles must be reviewed and readable | `tests/work/search-cases.mjs:66` | asserted |
| `DESK-026` | 3 | matching normalizes Unicode NFKC, case and separators | none | none |
| `DESK-026` | 4 | typos of one inserted, omitted or transposed character match | `tests/work/search-cases.mjs:42` | asserted |
| `DESK-026` | 4 | phrase matches rank before exact tokens and before typo matches | none | none |
| `DESK-026` | 5 | a query over 200 code units is refused | `tests/work/search-cases.mjs:51` | asserted |
| `DESK-026` | 5 | pages hold at most 50 matches with the type total | `tests/work/search-cases.mjs:70` | asserted |
| `DESK-026` | 6 | no hidden row or source truncation affects the count | `tests/work/search-cases.mjs:69` | asserted |
| `ACCESS-001` | 1 | a user is created and read back | `tests/execution/runtime.mjs:536` | asserted |
| `ACCESS-001` | 2 | a group membership is added and read back | `tests/execution/runtime.mjs:207` | asserted |
| `ACCESS-001` | 3 | an E3 license is added and read back | none | none |
| `ACCESS-001` | 4 | the account is disabled and read back | `tests/execution/runtime.mjs:582` | asserted |
| `ACCESS-001` | 5 | sign-in sessions are revoked and read back | `tests/execution/runtime.mjs:582` | asserted |
| `ACCESS-001` | 6 | a revoked grant is refused at the effect | `tests/execution/runtime.mjs:361` | asserted |
| `ACCESS-002` | 1 | an app is assigned through a group and read back in the developer org | `tests/execution/okta-live.mjs:211` | asserted |
| `ACCESS-002` | 2 | the user is suspended and read back in the developer org | `tests/execution/okta-live.mjs:230` | asserted |
| `ACCESS-002` | 3 | sessions are cleared and read back in the developer org | `tests/execution/okta-live.mjs:226` | asserted |
| `ACCESS-006` | 1 | time-bound access is removed at expiry and the removal read back | `tests/ui/connected-request.mjs:37` | asserted |
| `ACCESS-006` | 2 | access the user already had is kept | none | none |
| `ACCESS-008` | 1 | Salesforce is registered with two permission sets and an owner | `tests/work/application-cases.mjs:25` | asserted |
| `ACCESS-008` | 1 | an admin-set request routes to the owner and shows the seat cost | `tests/work/application-cases.mjs:35` | asserted |
| `ACCESS-008` | 2 | only the current owner manages the registry | `tests/work/application-cases.mjs:11` | asserted |
| `ACCESS-008` | 2 | employees see only entitlement names and seat costs | `tests/work/application-cases.mjs:41` | asserted |
| `ACCESS-008` | 3 | owner and approver IDs must be current members | `tests/work/application-cases.mjs:29` | asserted |
| `ACCESS-008` | 3 | approver metadata confers no approval right | none | none |
| `ACCESS-008` | 3 | registry metadata issues no provider grant | `tests/work/application-cases.mjs:39` | asserted |
| `ACCESS-008` | 4 | a linked item's target cannot be forged | `tests/work/application-cases.mjs:43` | asserted |
| `ACCESS-008` | 5 | duties route to the application owner | `tests/work/application-cases.mjs:38` | asserted |
| `ACCESS-008` | 5 | manager approval remains mandatory | `tests/work/application-cases.mjs:58` | asserted |
| `ACCESS-008` | 6 | requests snapshot owner and cost; later edits affect new requests; retries keep the snapshot | `tests/work/application-cases.mjs:55` | asserted |
| `ACCESS-008` | 7 | seat costs are nonnegative integer cents with a period | `tests/work/application-cases.mjs:27` | asserted |
| `ACCESS-008` | 7 | connector descriptions are metadata | `tests/work/application-cases.mjs:23` | asserted |
| `ACCESS-008` | 8 | native restore remaps references without activating membership | `tests/adoption/application-cases.mjs:44` | asserted |
| `ACCESS-008` | 8 | erasure anonymizes registry and request actors | `tests/work/application-cases.mjs:62` | asserted |
| `LIFE-003` | 1 | a Sales-to-Marketing move removes Salesforce, adds HubSpot and keeps Slack with readback | `tests/ui/connected-lifecycle.mjs:101` | asserted |
| `LIFE-003` | 2 | only the owner writes policies | `tests/work/access-policy-cases.mjs:18` | asserted |
| `LIFE-003` | 2 | HR reads the policies | `tests/work/access-policy-cases.mjs:33` | asserted |
| `LIFE-003` | 3 | policies name reviewed values and group, app or license entitlements | `tests/work/access-policy-cases.mjs:23` | asserted |
| `LIFE-003` | 4 | a person matches per named dimension and an unrestricted policy applies to everyone | `tests/work/access-policy-cases.mjs:50` | asserted |
| `LIFE-003` | 5 | the baseline is the union of active matching policies | `tests/work/access-policy-cases.mjs:45` | asserted |
| `LIFE-003` | 5 | an inactive policy grants nothing | `tests/work/access-policy-cases.mjs:69` | asserted |
| `LIFE-003` | 6 | join, move and leave baselines | `tests/work/access-policy-cases.mjs:73` | asserted |
| `LIFE-003` | 7 | the record names the policies behind it | `tests/work/access-policy-cases.mjs:58` | asserted |
| `LIFE-003` | 7 | the record keeps each policy's revision | none | none |
| `LIFE-003` | 7 | replaying the same admission returns the admitted record | `tests/work/access-policy-cases.mjs:62` | asserted |
| `LIFE-003` | 7 | a later policy edit leaves an admitted record's retained, added and removed access unchanged | none | none |
| `LIFE-003` | 8 | listed access may not contradict the policies | `tests/work/access-policy-cases.mjs:75` | asserted |
| `LIFE-003` | 8 | access the admission lists explicitly is added to the policy result | none | none |
| `LIFE-009` | 1 | policy edits are versioned and audited with before and after | `tests/work/access-policy-cases.mjs:65` | asserted |
| `LIFE-009` | 2 | each group entitlement runs as an access duty under its own grant and verifier | `tests/ui/connected-lifecycle.mjs:104` | asserted |
| `LIFE-009` | 2 | a license entitlement runs as ACCESS-001's license action | none | none |
| `LIFE-009` | 3 | an app entitlement with no native connector runs as the provider's app-assignment group | none | none |
| `LIFE-009` | 4 | retained access creates no duty and no provider call | `tests/ui/connected-lifecycle.mjs:100` | asserted |
| `LIFE-009` | 5 | archives keep policies as inactive history | `tests/platform/base-auth-transfer.mjs:236` | asserted |
| `LIFE-009` | 5 | restored policies grant nothing until the owner re-enters them | `tests/platform/base-auth-transfer.mjs:280` | asserted |
| `LIFE-006` | 1 | an end date within three days reminds the sponsor | `tests/work/lifecycle-regressions.mjs:63` | asserted |
| `LIFE-006` | 1 | access is removed and verified at the end instant | `tests/ui/connected-lifecycle.mjs:58` | asserted |
| `LIFE-006` | 2 | an end date needs a current sponsor | `tests/work/lifecycle-regressions.mjs:56` | asserted |
| `LIFE-006` | 2 | an inactive member or the contractor is refused as sponsor | none | none |
| `LIFE-006` | 3 | one reminder in the sponsor's own requests within 72 hours | `tests/work/lifecycle-regressions.mjs:67` | asserted |
| `LIFE-006` | 3 | no reminder while the end is more than 72 hours away | none | none |
| `LIFE-006` | 4 | only the sponsor re-attests | `tests/work/lifecycle-regressions.mjs:69` | asserted |
| `LIFE-006` | 4 | the new end date must be later | `tests/work/lifecycle-regressions.mjs:70` | asserted |
| `LIFE-006` | 4 | re-attestation moves both expiry duties | `tests/work/lifecycle-regressions.mjs:75` | asserted |
| `LIFE-006` | 4 | re-attestation is audited | `tests/work/lifecycle-regressions.mjs:76` | asserted |
| `LIFE-006` | 4 | re-attestation clears the reminder so a new one precedes the new end | none | none |
| `LIFE-006` | 5 | a departed sponsor's reminder goes to the owner | `tests/work/lifecycle-regressions.mjs:97` | asserted |
| `LIFE-006` | 5 | the owner re-attests or names a new sponsor | `tests/work/lifecycle-regressions.mjs:101` | asserted |
| `LIFE-006` | 5 | a newly named sponsor is reminded afresh | none | none |
| `LIFE-006` | 6 | the disable starts at the end instant and revocation follows the verified disable | `tests/work/lifecycle-regressions.mjs:88` | asserted |
| `LIFE-006` | 6 | a started expiry cannot be re-attested | `tests/work/lifecycle-regressions.mjs:89` | asserted |
| `LIFE-007` | 1 | each effect shows its timestamp | `tests/work/lifecycle-evidence-cases.mjs:52` | asserted |
| `LIFE-007` | 2 | each effect shows its grant | `tests/work/lifecycle-evidence-cases.mjs:52` | asserted |
| `LIFE-007` | 3 | each effect shows its verification | `tests/work/lifecycle-evidence-cases.mjs:87` | asserted |
| `LIFE-007` | 4 | outstanding duties are shown | `tests/work/lifecycle-evidence-cases.mjs:69` | asserted |
| `ASSET-004` | 1 | a laptop runs through assign, repair, return and dispose with its history | `tests/work/asset-custody-cases.mjs:36` | asserted |
| `ASSET-004` | 1 | disposal keeps partner, standard and HTTPS reference after reopening | `tests/work/asset-custody-cases.mjs:38` | asserted |
| `ASSET-004` | 2 | disposal is refused while assigned, including during repair | `tests/work/asset-custody-cases.mjs:19` | asserted |
| `ASSET-004` | 2 | disposal is refused without a reference | `tests/work/asset-custody-cases.mjs:27` | asserted |
| `ASSET-004` | 3 | a reference alone retains no document bytes | none | none |
| `ASSET-004` | 3 | an uploaded document retains its bytes | none | none |
| `ASSET-004` | 3 | neither view claims partner certification or validation | none | none |
| `ASSET-008` | 1 | a $2,400 laptop over 36 months shows its month-12 book value | `tests/work/asset-financial-cases.mjs:11` | asserted |
| `ASSET-008` | 1 | the fiscal-year schedule exports as CSV | `tests/work/asset-financial-cases.mjs:39` | asserted |
| `ASSET-008` | 2 | straight-line rounds to the cent | `tests/work/asset-financial-cases.mjs:19` | asserted |
| `ASSET-008` | 3 | declining balance at twice the rate, fully depreciated at the end | `tests/work/asset-financial-cases.mjs:57` | asserted |
| `ASSET-008` | 4 | postings occur on each anniversary, clamped without drift | `tests/work/asset-financial-cases.mjs:24` | asserted |
| `ASSET-008` | 5 | fiscal years start and end on the selected month | `tests/work/asset-financial-cases.mjs:17` | asserted |
| `ASSET-008` | 6 | the CSV downloads | `tests/work/asset-financial-cases.mjs:36` | asserted |
| `ASSET-008` | 6 | a download does not claim a provider import | none | none |
| `ASSET-009` | 1 | an SSO change shows Payroll impacted | `tests/services/dependency-cases.mjs:15` | asserted |
| `ASSET-009` | 1 | a stale relationship is marked stale | `tests/services/dependency-cases.mjs:18` | asserted |
| `ASSET-009` | 2 | the five CI types, and an unknown type refused | `tests/services/dependency-cases.mjs:9` | asserted |
| `ASSET-009` | 3 | facts are labeled with their provenance | `tests/services/dependency-cases.mjs:8` | asserted |
| `ASSET-009` | 4 | unknown relationships are refused | `tests/services/dependency-cases.mjs:35` | asserted |
| `ASSET-009` | 4 | connects_to records a non-dependency connection | none | none |
| `ASSET-009` | 5 | upstream and downstream impact is transitive within the reader's scope | `tests/services/dependency-cases.mjs:23` | asserted |
| `ASSET-009` | 6 | a future observation is not fresh | `tests/services/dependency-cases.mjs:30` | asserted |
| `ASSET-009` | 7 | stale, conflicting and not-yet-effective relationships yield uncertain impact | `tests/services/dependency-cases.mjs:27` | asserted |
| `ASSET-009` | 8 | an absent relationship is unknown and inferred impact does not establish an outage | none | none |
| `ASSET-010` | 1 | 18 of 20 scanned and two missing devices open follow-ups | `tests/work/asset-custody-cases.mjs:83` | asserted |
| `ASSET-010` | 2 | the expected list is the shelf devices at the location | `tests/work/asset-custody-cases.mjs:66` | asserted |
| `ASSET-010` | 3 | one open audit per location | `tests/work/asset-custody-cases.mjs:68` | asserted |
| `ASSET-010` | 4 | tags are entered case-insensitively in the web app at phone width | `tests/ui/asset-audit-journey.mjs:17` | asserted |
| `ASSET-010` | 5 | a repeat scan counts once | `tests/work/asset-custody-cases.mjs:71` | asserted |
| `ASSET-010` | 5 | elsewhere and unknown codes are reported, not found | `tests/work/asset-custody-cases.mjs:81` | asserted |
| `ASSET-010` | 6 | completion marks found devices and links one follow-up per missing device | `tests/work/asset-custody-cases.mjs:87` | asserted |
| `ASSET-010` | 6 | a completed audit takes no further scans | none | none |
| `PROB-001` | 1 | a problem is created from three incidents | `tests/work/problem-cases.mjs:11` | asserted |
| `PROB-001` | 2 | the known error is recorded | `tests/work/problem-cases.mjs:32` | asserted |
| `PROB-001` | 2 | a workaround article is recorded | `tests/work/problem-cases.mjs:22` | asserted |
| `PROB-001` | 3 | the preventive change is linked | `tests/work/problem-cases.mjs:28` | asserted |
| `PROB-001` | 4 | a later matching ticket is offered the workaround | `tests/work/problem-cases.mjs:41` | asserted |
| `PROB-002` | 1 | eight floor Wi-Fi tickets yield a proposal listing them | `tests/work/problem-detection-cases.mjs:21` | asserted |
| `PROB-002` | 2 | a rejection is kept and not re-proposed | `tests/work/problem-detection-cases.mjs:33` | asserted |
| `PROB-002` | 3 | detection uses recorded service, device-model and app labels | `tests/work/problem-detection-cases.mjs:56` | asserted |
| `PROB-002` | 3 | no common cause is inferred | `tests/work/problem-detection-cases.mjs:47` | asserted |
| `PROB-002` | 4 | each facet is a separate cluster | `tests/work/problem-detection-cases.mjs:55` | asserted |
| `PROB-002` | 4 | untagged sources have their own bucket | none | none |
| `PROB-002` | 5 | labels are compared after NFKC, whitespace and case normalization | none | none |
| `PROB-002` | 6 | fewer than three sources, or sources outside the window, propose nothing | `tests/work/problem-detection-cases.mjs:62` | asserted |
| `PROB-002` | 6 | canceled tickets are excluded | none | none |
| `PROB-002` | 7 | a monitoring-derived incident counts once | `tests/work/problem-detection-cases.mjs:88` | asserted |
| `PROB-002` | 8 | a decision retains its reason | `tests/work/problem-detection-cases.mjs:32` | asserted |
| `PROB-003` | 1 | accepting creates one problem linked to its evidence with the cause unknown | `tests/work/problem-detection-cases.mjs:47` | asserted |
| `PROB-003` | 1 | accepting resolves no source ticket | `tests/work/problem-detection-cases.mjs:50` | asserted |
| `PROB-003` | 2 | a rejected cluster stays decided as later sources arrive | `tests/work/problem-detection-cases.mjs:33` | asserted |
| `PROB-003` | 2 | a rejected cluster stays decided through native restore | `tests/adoption/problem-cases.mjs:46` | asserted |
| `PROB-003` | 2 | an accepted cluster stays decided through native restore | `tests/adoption/problem-cases.mjs:43` | asserted |
| `PROB-003` | 2 | an accepted cluster stays decided as later sources arrive | none | none |
| `PROB-003` | 2 | decisions stay decided as the observation window rolls | none | none |
| `PROB-003` | 2 | decisions survive a Worker restart | none | none |
| `PROB-003` | 3 | an operator reads a normal-source proposal | none | none |
| `PROB-003` | 4 | restricted proposals are visible only to the detecting owner | `tests/work/problem-detection-cases.mjs:113` | asserted |
| `PROB-003` | 5 | one inaccessible source hides the whole cluster | `tests/work/problem-detection-cases.mjs:124` | asserted |
| `PROB-003` | 6 | accepted problems keep the proposal's visibility | `tests/work/problem-detection-cases.mjs:127` | asserted |
| `PROB-003` | 7 | evidence stores references, not copied reports | `tests/work/problem-detection-cases.mjs:24` | asserted |
| `CHANGE-001` | 1 | a catalog standard change skips CAB | `tests/services/template-cases.mjs:23` | asserted |
| `CHANGE-001` | 1 | an emergency change takes the ECAB path | `tests/services/template-cases.mjs:57` | asserted |
| `CHANGE-001` | 2 | only the owner manages templates and approves an exact version with a reason | `tests/services/template-cases.mjs:20` | asserted |
| `CHANGE-001` | 3 | standard creation copies the plans and records CAB bypass with no grant | `tests/services/template-cases.mjs:25` | asserted |
| `CHANGE-001` | 3 | grants are bound separately | `tests/services/template-cases.mjs:30` | asserted |
| `CHANGE-001` | 4 | a normal change needs a recorded decision | `tests/services/template-cases.mjs:55` | asserted |
| `CHANGE-001` | 4 | an emergency change uses an ECAB decision by an approver | `tests/services/template-cases.mjs:60` | asserted |
| `CHANGE-001` | 5 | edits stop new catalog use and in-flight snapshots keep their bypass | `tests/services/template-cases.mjs:38` | asserted |
| `CHANGE-001` | 6 | an explicit withdrawal with a reason fences the in-flight change | `tests/services/template-cases.mjs:52` | asserted |
| `CHANGE-001` | 7 | amending the implementation clears bypass and returns to normal review | `tests/services/template-cases.mjs:54` | asserted |
| `CHANGE-001` | 8 | restore makes templates inactive and clears imported bypass | `tests/adoption/template-cases.mjs:14` | asserted |
| `CHANGE-001` | 8 | personal-data erasure withdraws live template approval | none | none |
| `CHANGE-002` | 1 | an SSO change with a prior failure scores high and takes CAB; on a test CI it scores low | `tests/services/risk-cases.mjs:22` | asserted |
| `CHANGE-002` | 2 | questions score +2 and unanswered counts as yes | `tests/services/risk-cases.mjs:24` | asserted |
| `CHANGE-002` | 3 | a production item scores +3 | `tests/services/risk-cases.mjs:17` | asserted |
| `CHANGE-002` | 4 | a window in business hours scores +1 | `tests/services/risk-cases.mjs:17` | asserted |
| `CHANGE-002` | 5 | a prior failed change on the items scores +3 | `tests/services/risk-cases.mjs:17` | asserted |
| `CHANGE-002` | 6 | score bands | `tests/services/risk-cases.mjs:21` | asserted |
| `CHANGE-002` | 7 | low takes one independent change-manager approval, never the change's owner | `tests/services/risk-cases.mjs:25` | asserted |
| `CHANGE-002` | 8 | emergency changes stay on ECAB and standard changes on the catalog | none | none |
| `CHANGE-002` | 8 | an edit recomputes the score and withdraws approval | `tests/services/risk-cases.mjs:30` | asserted |
| `CHANGE-004` | 1 | a change into a year-end freeze is refused | `tests/services/calendar-cases.mjs:11` | asserted |
| `CHANGE-004` | 1 | overlapping changes on one CI conflict | `tests/services/calendar-cases.mjs:29` | asserted |
| `CHANGE-004` | 2 | only the owner manages windows | `tests/services/calendar-cases.mjs:9` | asserted |
| `CHANGE-004` | 3 | CI-specific windows do not block unrelated CIs | `tests/services/calendar-cases.mjs:24` | asserted |
| `CHANGE-004` | 3 | the calendar uses UTC instants and the selected time zone | `tests/services/calendar-cases.mjs:22` | asserted |
| `CHANGE-004` | 4 | draft overlaps are shown | `tests/services/calendar-cases.mjs:29` | asserted |
| `CHANGE-004` | 5 | an implementation edit into a freeze is refused | `tests/services/calendar-cases.mjs:18` | asserted |
| `CHANGE-004` | 6 | an operator's emergency flag or a submitted actor grants nothing | `tests/services/calendar-cases.mjs:13` | asserted |
| `CHANGE-004` | 6 | an owner-recorded emergency schedules | `tests/services/calendar-cases.mjs:15` | asserted |
| `CHANGE-004` | 7 | this authorizes scheduling only; execution keeps its grants and approvals | none | none |
| `CHANGE-004` | 8 | a freeze added after planning refuses the dispatch | `tests/services/integration.mjs:47` | asserted |
| `CHANGE-009` | 1 | hidden conflicts give one generic warning without revealing the record | `tests/services/calendar-cases.mjs:34` | asserted |
| `CHANGE-009` | 1 | the ICS feed shares current source privacy | `tests/services/calendar-cases.mjs:45` | asserted |
| `CHANGE-009` | 2 | privileged reads and exports are audited | none | none |
| `CHANGE-009` | 3 | restored windows stay inactive until the owner reactivates them | `tests/adoption/calendar-cases.mjs:16` | asserted |
| `CHANGE-009` | 3 | restored changes retain no emergency scheduling authority | none | none |
| `CHANGE-009` | 4 | erasure keeps the business freeze and scrubs the owner | `tests/adoption/calendar-cases.mjs:32` | asserted |
| `CHANGE-009` | 5 | ICS uses stable UIDs, revision sequences, UTC and folded escaped text | `tests/services/calendar-cases.mjs:44` | asserted |
| `CHANGE-009` | 6 | inactive windows do not enter the feed | none | none |
| `CHANGE-009` | 7 | planned entries are tentative and never claim execution | `tests/services/calendar-cases.mjs:41` | asserted |
| `CHANGE-007` | 1 | a three-change release with go recorded deploys canary then rollout | `tests/services/release-cases.mjs:66` | asserted |
| `CHANGE-007` | 2 | release notes reach the affected cohort only | `tests/services/release-cases.mjs:76` | asserted |
| `CHANGE-007` | 3 | a failed change holds the release open until backed out | `tests/services/release-cases.mjs:79` | asserted |
| `CHANGE-007` | 4 | go/no-go approvers must hold approval authority | `tests/services/release-cases.mjs:31` | asserted |
| `CHANGE-007` | 5 | a change belongs to one open release | `tests/services/release-cases.mjs:35` | asserted |
| `CHANGE-007` | 5 | the release carries its changes' CIs and the problems it addresses | `tests/services/release-cases.mjs:37` | asserted |
| `CHANGE-007` | 6 | tickets link to the release | none | none |
| `CHANGE-007` | 7 | build and test are recorded results with a reference, needed before go | `tests/services/release-cases.mjs:44` | asserted |
| `CHANGE-007` | 7 | a test needs a passed build | none | none |
| `CHANGE-007` | 7 | recording a result withdraws earlier decisions | none | none |
| `CHANGE-007` | 8 | only named approvers decide and one no-go holds | `tests/services/release-cases.mjs:49` | asserted |
| `CHANGE-007` | 8 | the latest decision per approver counts | `tests/services/release-cases.mjs:53` | asserted |
| `CHANGE-007` | 8 | a release owner without the owner role cannot decide their own release | none | none |
| `CHANGE-011` | 1 | no member dispatches before go, and amending a member holds every member | `tests/services/release-cases.mjs:97` | asserted |
| `CHANGE-011` | 2 | a withdrawn approver holds deployment | `tests/services/release-cases.mjs:55` | asserted |
| `CHANGE-011` | 2 | backout never waits for go/no-go | `tests/services/release-cases.mjs:82` | asserted |
| `CHANGE-011` | 3 | each member deploys canary then rollout | `tests/services/release-cases.mjs:66` | asserted |
| `CHANGE-011` | 4 | the release spans its changes on the shared calendar | `tests/services/release-cases.mjs:40` | asserted |
| `CHANGE-011` | 5 | notes go to a named affected group only | `tests/services/release-cases.mjs:73` | asserted |
| `CHANGE-011` | 5 | an all-clear needs a completed release | none | none |
| `CHANGE-011` | 6 | the release completes once every member is successful or backed out | `tests/services/release-cases.mjs:85` | asserted |
| `CHANGE-011` | 7 | restore puts the release into review | `tests/platform/base-auth-transfer.mjs:240` | asserted |
| `CHANGE-011` | 7 | erasing a person withdraws their decisions | none | none |
| `PROJECT-001` | 1 | 12 tasks across two milestones | `tests/work/project-cases.mjs:29` | asserted |
| `PROJECT-001` | 1 | 30 asset relocations and two changes link | `tests/work/project-cases.mjs:57` | asserted |
| `PROJECT-001` | 2 | a blocked dependency is flagged on the timeline | `tests/work/project-cases.mjs:31` | asserted |
| `PROJECT-001` | 2 | the workload combines project tasks and tickets | `tests/work/project-cases.mjs:78` | asserted |
| `PROJECT-001` | 3 | employees have no project view | `tests/work/project-cases.mjs:72` | asserted |
| `PROJECT-001` | 3 | a service agent edits a task | `tests/work/project-cases.mjs:97` | asserted |
| `PROJECT-001` | 3 | auditors read | `tests/work/project-cases.mjs:136` | asserted |
| `PROJECT-001` | 4 | a task owner who is not an owner or agent is refused | `tests/work/project-cases.mjs:20` | asserted |
| `PROJECT-001` | 4 | an inactive owner or agent is refused as a task owner | none | none |
| `PROJECT-001` | 4 | tasks take due dates and dependencies | `tests/work/project-cases.mjs:33` | asserted |
| `PROJECT-001` | 5 | the timeline orders by due date | `tests/work/project-cases.mjs:34` | asserted |
| `PROJECT-001` | 5 | a task waits on an open dependency | `tests/work/project-cases.mjs:33` | asserted |
| `PROJECT-001` | 5 | a task is flagged blocked when its dependency is due after it | `tests/work/project-cases.mjs:31` | asserted |
| `PROJECT-001` | 5 | a task is flagged blocked when its dependency is itself blocked | none | none |
| `PROJECT-001` | 5 | a task is flagged blocked when its dependency is overdue | none | none |
| `PROJECT-001` | 5 | a task cannot be done while a dependency is open | `tests/work/project-cases.mjs:35` | asserted |
| `PROJECT-001` | 6 | HR tickets are refused as links | `tests/work/project-cases.mjs:50` | asserted |
| `PROJECT-001` | 6 | tickets, changes and assets with notes link | `tests/work/project-cases.mjs:56` | asserted |
| `PROJECT-001` | 6 | a lifecycle plan links | none | none |
| `PROJECT-001` | 7 | the workload counts open tickets beside open project tasks | `tests/work/project-cases.mjs:78` | asserted |
| `PROJECT-001` | 7 | paused tickets assigned to the agent count in the workload | none | none |
| `KB-001` | 1 | an employee searches a reviewed article and escalates it with the article revision | `tests/work/runtime.mjs:594` | asserted |
| `KB-001` | 2 | an expired article disappears from employee search | none | none |
| `KB-003` | 1 | the VPN question is answered with the readable reviewed article | `tests/work/knowledge-draft-cases.mjs:147` | asserted |
| `KB-003` | 1 | the employee confirms | `tests/work/knowledge-draft-cases.mjs:152` | asserted |
| `KB-003` | 2 | an employee who files anyway is not counted as deflected | `tests/work/knowledge-draft-cases.mjs:162` | asserted |
| `KB-003` | 3 | only articles the asker may read are matched | `tests/work/knowledge-draft-cases.mjs:148` | asserted |
| `KB-003` | 4 | a question with no matching words offers nothing | `tests/work/knowledge-draft-cases.mjs:149` | asserted |
| `KB-003` | 4 | at most three articles, ordered by words matched then recency | none | none |
| `KB-003` | 5 | a suggestion records the asker, revisions and outcome but never the question text | none | none |
| `KB-003` | 6 | only the asker's confirmation counts; filing after a confirmation never does | `tests/work/knowledge-draft-cases.mjs:162` | asserted |
| `KB-003` | 7 | the report shows offered, deflected, filed-after and unanswered counts | `tests/work/knowledge-draft-cases.mjs:162` | asserted |
| `KB-004` | 1 | three similar tickets yield a draft with three sources | `tests/work/knowledge-draft-cases.mjs:39` | asserted |
| `KB-004` | 1 | the draft stays unpublished until a reviewer publishes it | `tests/work/knowledge-draft-cases.mjs:41` | asserted |
| `KB-004` | 2 | discovery makes no model call | `tests/work/knowledge-draft-cases.mjs:15` | asserted |
| `KB-004` | 3 | recorded context and cohort group tickets, with app, service, device model and title precedence and normalized words | `tests/work/knowledge-draft-cases.mjs:101` | asserted |
| `KB-004` | 3 | HR tickets make no candidate | `tests/work/knowledge-draft-cases.mjs:89` | asserted |
| `KB-004` | 3 | fewer than three matching resolved tickets, or unresolved tickets, make no candidate | none | none |
| `KB-004` | 3 | a candidate keeps at most 30 complete public-message sources | none | none |
| `KB-004` | 4 | reviewed known errors supply candidates | `tests/work/knowledge-draft-cases.mjs:109` | asserted |
| `KB-004` | 4 | a restricted known error supplies no candidate | none | none |
| `KB-004` | 5 | private notes never enter generation | `tests/work/knowledge-draft-cases.mjs:40` | asserted |
| `KB-004` | 6 | a reviewer publishes the generated draft | `tests/work/knowledge-draft-cases.mjs:45` | asserted |
| `KB-004` | 7 | every source is cited | `tests/work/knowledge-draft-cases.mjs:39` | asserted |
| `KB-004` | 8 | repeated discovery keeps a rejection | `tests/work/knowledge-draft-cases.mjs:87` | asserted |
| `KB-006` | 1 | a reopened source withdraws the guidance | `tests/work/knowledge-draft-cases.mjs:79` | asserted |
| `KB-006` | 2 | native restore keeps structured links and never resumes an old model call | `tests/work/knowledge-draft-cases.mjs:131` | asserted |
| `KB-006` | 3 | erasure removes derived text and source snapshots and keeps a suppression key | `tests/adoption/knowledge-draft-cases.mjs:74` | asserted |
| `KB-006` | 4 | shared replies check both recipients' readership | `tests/work/knowledge-draft-cases.mjs:65` | asserted |
| `KB-006` | 5 | publishing grants no source readership | `tests/work/knowledge-draft-cases.mjs:50` | asserted |
| `REPORT-004` | 1 | the report shows prior and current touches and minutes, cost per verified outcome and failures | `tests/work/work-saved-cases.mjs:88` | asserted |
| `REPORT-004` | 2 | overlapping or reversed windows are refused | `tests/work/work-saved-cases.mjs:97` | asserted |
| `REPORT-004` | 3 | touches and minutes are recorded human effort by role; an automated window has no touches | `tests/work/work-saved-cases.mjs:79` | asserted |
| `REPORT-004` | 4 | labor USD uses the owner-declared role rates | `tests/work/work-saved-cases.mjs:81` | asserted |
| `REPORT-004` | 4 | only the owner declares rates and employees cannot read the report | `tests/work/work-saved-cases.mjs:65` | asserted |
| `REPORT-004` | 5 | classification calls' model USD is the configured-price estimate, and a call without usage is unknown | `tests/work/work-saved-cases.mjs:90` | asserted |
| `REPORT-004` | 5 | reply, summary and employee-intake calls that named the request are counted | none | none |
| `REPORT-004` | 6 | every provider dispatch is an unknown charge, never $0 | `tests/work/work-saved-cases.mjs:85` | asserted |
| `REPORT-004` | 7 | known cost per verified outcome includes failed work and is labelled incomplete when a role is unpriced | `tests/work/work-saved-cases.mjs:72` | asserted |
| `REPORT-005` | 1 | 40 incidents, 92% change success and 12% emergency share | `tests/services/kpi-cases.mjs:11` | asserted |
| `REPORT-005` | 2 | each tile drills through to its records | `tests/services/kpi-cases.mjs:46` | asserted |
| `REPORT-005` | 3 | the range is labelled in its time zone and an empty cohort borrows nothing | `tests/services/kpi-cases.mjs:60` | asserted |
| `REPORT-005` | 3 | the month picker computes midnight boundaries in that zone | `tests/ui/kpi-journey.mjs:80` | asserted |
| `REPORT-005` | 4 | a missing acknowledgment is excluded and disclosed | `tests/services/kpi-cases.mjs:16` | asserted |
| `REPORT-005` | 4 | timing equals the contributing records | `tests/services/kpi-cases.mjs:53` | asserted |
| `REPORT-005` | 5 | MTTA and MTTR by recorded priority | `tests/services/kpi-cases.mjs:21` | asserted |
| `REPORT-005` | 5 | major incidents need an explicit designation | `tests/services/kpi-cases.mjs:14` | asserted |
| `REPORT-005` | 6 | change success uses every change as the denominator | `tests/services/kpi-cases.mjs:10` | asserted |
| `REPORT-005` | 7 | causal incident rate stays unknown without assessments | `tests/services/kpi-cases.mjs:24` | asserted |
| `REPORT-005` | 8 | problems in the backlog are counted | `tests/services/kpi-cases.mjs:26` | asserted |
| `REPORT-005` | 8 | backlog problems carry their age | `tests/services/kpi-cases.mjs:56` | asserted |
| `REPORT-005` | 8 | reviewed known errors are counted | `tests/services/kpi-cases.mjs:28` | asserted |
| `REPORT-005` | 8 | a problem leaves the backlog once permanent-fix effectiveness is verified | none | none |
| `REPORT-006` | 1 | ages use the disclosed observation snapshot | `tests/services/kpi-cases.mjs:56` | asserted |
| `REPORT-006` | 2 | native asset age starts at the recorded in-service date | `tests/ui/kpi-journey.mjs:110` | asserted |
| `REPORT-006` | 2 | native asset age starts at the first custody record when no in-service date is recorded | none | none |
| `REPORT-006` | 2 | service asset age starts at record creation | none | none |
| `REPORT-006` | 2 | asset states are counted per record | `tests/services/kpi-cases.mjs:29` | asserted |
| `REPORT-006` | 2 | source records that could share an identity count separately | none | none |
| `REPORT-006` | 3 | a fresh attributed observation counts | `tests/services/kpi-cases.mjs:31` | asserted |
| `REPORT-006` | 3 | an unobserved device stays unknown | `tests/services/kpi-cases.mjs:32` | asserted |
| `REPORT-006` | 3 | the operator-recorded or provider-verified label is shown | none | none |
| `REPORT-006` | 3 | an expired observation stays unknown | none | none |
| `REPORT-006` | 4 | license utilization over allocated seats | `tests/services/kpi-cases.mjs:33` | asserted |
| `REPORT-006` | 4 | utilization uses each asset's latest usage period | none | none |
| `REPORT-006` | 4 | a usage period not wholly within the range is excluded | none | none |
| `REPORT-006` | 5 | non-USD spend is excluded, not converted | `tests/services/kpi-cases.mjs:34` | asserted |
| `REPORT-006` | 6 | upcoming renewals and refreshes | `tests/services/kpi-cases.mjs:37` | asserted |
| `REPORT-006` | 6 | dates outside [end, end+30 days) are excluded | none | none |
| `REPORT-006` | 6 | native useful-life anniversaries are labelled planning indicators | none | none |
| `REPORT-006` | 7 | each tile keeps its definition, units and records | `tests/services/kpi-cases.mjs:40` | asserted |
| `REPORT-006` | 7 | elapsed milliseconds display as minutes to two decimals | `tests/ui/kpi-journey.mjs:56` | asserted |
| `REPORT-006` | 7 | a whole percentage displays without trailing zeroes | `tests/ui/kpi-journey.mjs:51` | asserted |
| `REPORT-006` | 7 | JSON keeps numeric precision | `tests/services/kpi-cases.mjs:33` | asserted |
| `REPORT-006` | 7 | USD displays to cents | none | none |
| `REPORT-006` | 7 | a fractional percentage or number rounds to two decimals | none | none |
| `REPORT-006` | 8 | source scopes apply and the auditor's unavailable device scope is disclosed | `tests/ui/kpi-journey.mjs:127` | asserted |
| `AUDIT-001` | 1 | the auditor reads the grant-change entry | none | none |
| `AUDIT-001` | 2 | the auditor reads the data-export entry | none | none |
| `AUDIT-001` | 3 | after the actor's erasure the entries remain anonymized | `tests/platform/privacy-runtime.mjs:49` | asserted |
| `API-003` | 1 | an MCP client lists its permitted queue | `tests/platform/mcp-tools-cases.mjs:106` | asserted |
| `API-003` | 1 | an out-of-grant action is refused | `tests/platform/mcp-tools-cases.mjs:127` | asserted |
| `API-003` | 2 | an owner session is not an MCP grant; discovery needs authentication | `tests/platform/base-auth-runtime.mjs:90` | asserted |
| `API-003` | 2 | unauthenticated discovery returns only a protocol auth error | none | none |
| `API-003` | 3 | initialize works with authentication | `tests/platform/base-auth-runtime.mjs:106` | asserted |
| `API-003` | 3 | discovery intersects scopes and selected tools | `tests/platform/mcp-tools-cases.mjs:96` | asserted |
| `API-003` | 4 | six closed ticket tools | `tests/platform/mcp-tools-cases.mjs:104` | asserted |
| `API-003` | 5 | no tool exists for approvals, minting, grants, configuration, export, restore, erasure, effects or bulk changes | `tests/platform/mcp-tools-cases.mjs:104` | asserted |
| `API-003` | 6 | minting never grants approval rights | none | none |
| `API-005` | 1 | owner routes mint, list and revoke credentials | `tests/platform/base-auth-runtime.mjs:202` | asserted |
| `API-005` | 1 | a REST token is refused at MCP and an MCP credential at REST | `tests/platform/base-auth-runtime.mjs:134` | asserted |
| `API-005` | 2 | mixed or privileged roles refuse mint | `tests/platform/base-auth-runtime.mjs:192` | asserted |
| `API-005` | 3 | a credential expiring beyond 365 days is refused | `tests/platform/base-auth-runtime.mjs:96` | asserted |
| `API-005` | 3 | a credential binds one workspace | `tests/platform/base-auth-runtime.mjs:171` | asserted |
| `API-005` | 3 | the credential stores SHA-256 only | `tests/platform/base-auth-runtime.mjs:184` | asserted |
| `API-005` | 3 | the secret shows once and hashes never reappear | `tests/platform/mcp-tools-cases.mjs:262` | asserted |
| `API-005` | 4 | revocation refuses the next call at once | `tests/platform/base-auth-runtime.mjs:200` | asserted |
| `API-005` | 4 | the list shows last use | `tests/platform/base-auth-runtime.mjs:110` | asserted |
| `API-005` | 4 | minting is audited | `tests/platform/base-auth-runtime.mjs:186` | asserted |
| `API-005` | 4 | revocation is audited | `tests/platform/base-auth-runtime.mjs:202` | asserted |
| `API-005` | 4 | expiry is audited | `tests/platform/base-auth-runtime.mjs:208` | asserted |
| `API-005` | 5 | erasure revokes the credential and clears its hash | `tests/platform/base-auth-runtime.mjs:225` | asserted |
| `API-005` | 6 | export carries metadata without its hash and restore leaves it revoked | `tests/platform/base-auth-transfer.mjs:194` | asserted |
| `API-005` | 6 | an old archive introduces no credential authority | `tests/platform/base-auth-transfer.mjs:52` | asserted |
| `API-005` | 7 | each call audits ids only, never secrets or free text | `tests/platform/mcp-tools-cases.mjs:281` | asserted |
| `API-006` | 1 | mint records selected queue groups and refuses missing or foreign groups | `tests/platform/mcp-tools-cases.mjs:49` | asserted |
| `API-006` | 2 | narrowing advances the version; widening requires a new credential | `tests/platform/mcp-tools-cases.mjs:250` | asserted |
| `API-006` | 3 | a grant adds no group membership, lead or assignee | `tests/platform/mcp-tools-cases.mjs:44` | asserted |
| `API-006` | 4 | live authority is rechecked at commit and a loss rolls back | `tests/platform/mcp-tools-cases.mjs:235` | asserted |
| `API-006` | 5 | issuer loss refuses, revokes and audits | `tests/platform/mcp-tools-cases.mjs:261` | asserted |
| `API-006` | 6 | own created tickets are get/search readable but listed only when in a granted group | `tests/platform/mcp-tools-cases.mjs:189` | asserted |
| `API-006` | 6 | moving a ticket out removes it on the next list | `tests/platform/mcp-tools-cases.mjs:203` | asserted |
| `API-006` | 7 | missing, out-of-grant, HR and restricted tickets share the not-found response | `tests/platform/mcp-tools-cases.mjs:127` | asserted |
| `API-006` | 8 | mint, narrowing, issuer loss and calls are audited with ids | `tests/platform/mcp-tools-cases.mjs:269` | asserted |
| `API-007` | 1 | a read returns the id, group id, revision, display-only requester and beneficiary, public thread, classified fields and history | `tests/platform/mcp-tools-cases.mjs:108` | asserted |
| `API-007` | 1 | a read returns the number, title, state, type, priority, impact, urgency, category and service ids and labels, group label, SLA and timestamps | none | none |
| `API-007` | 1 | a read returns the principal's own comments | none | none |
| `API-007` | 2 | search uses only the projected fields | `tests/platform/mcp-tools-cases.mjs:122` | asserted |
| `API-007` | 3 | private notes, attachments, personal and HR facts are excluded | `tests/platform/mcp-tools-cases.mjs:119` | asserted |
| `API-007` | 4 | a comment is internal, attributed, revision-checked and sends nothing | `tests/platform/mcp-tools-cases.mjs:179` | asserted |
| `API-007` | 5 | create files normal own work without chosen queue placement | `tests/platform/mcp-tools-cases.mjs:186` | asserted |
| `API-007` | 6 | assign is refused for the principal | `tests/platform/mcp-tools-cases.mjs:66` | asserted |
| `API-007` | 7 | only owner-classified dropdowns are readable, and free text cannot be classified | `tests/platform/mcp-tools-cases.mjs:90` | asserted |
| `PORT-001` | 1 | export, restore into a fresh workspace, and matching counts and hashes | `tests/adoption/runtime.mjs:30` | asserted |
| `PORT-001` | 2 | the restored workspace holds execution | `tests/adoption/runtime.mjs:31` | asserted |
| `PORT-001` | 3 | restored grants are inert | `tests/adoption/runtime.mjs:31` | asserted |
| `ERASURE-001` | 1 | after erasure an older archive is refused and the content stays absent | `tests/adoption/runtime.mjs:52` | asserted |
| `RETENTION-001` | 1 | a ticket closed 400 days ago and its attachment are deleted with a receipt | `tests/adoption/retention-cases.mjs:37` | asserted |
| `RETENTION-001` | 2 | the owner sets closed-ticket days | `tests/adoption/retention-cases.mjs:31` | asserted |
| `RETENTION-001` | 2 | the owner sets archive retention | `tests/ui/connected-setup.mjs:50` | asserted |
| `RETENTION-001` | 3 | unset keeps everything with no hidden default | `tests/adoption/retention-cases.mjs:7` | asserted |
| `RETENTION-001` | 4 | open and recently closed tickets stay | `tests/adoption/retention-cases.mjs:41` | asserted |
| `RETENTION-001` | 5 | setting a policy needs the owner to confirm the previewed counts | `tests/adoption/retention-cases.mjs:28` | asserted |
| `RETENTION-001` | 5 | lengthening needs no confirmation | `tests/adoption/retention-cases.mjs:51` | asserted |
| `RETENTION-001` | 6 | a due ticket with an open obligation, linked repair or unfinished service record is held back and reported | none | none |
| `RETENTION-001` | 7 | deletion removes the ticket, attachment record and bytes and its quote | `tests/adoption/retention-cases.mjs:39` | asserted |
| `RETENTION-001` | 8 | the receipt keeps no content and the auditor reads it | `tests/adoption/retention-cases.mjs:48` | asserted |
| `RETENTION-001` | 8 | the deleted id is tombstoned so an older archive does not bring it back | none | none |
| `BASE-001` | 1 | the Base sign-in checks pass | `tests/platform/base-auth-runtime.mjs:32` | asserted |
| `BASE-001` | 2 | the Base mail-edge checks pass: the magic link is sent through the mail edge | `tests/platform/base-auth-runtime.mjs:38` | asserted |
| `BASE-001` | 3 | an upgrade keeps existing accounts | none | none |
| `COST-001` | 1 | an exhausted model budget holds discretionary research | `tests/intelligence/runtime.mjs:54` | asserted |
| `COST-001` | 2 | a Texas invoice preview shows seats and sales tax | `tests/intelligence/runtime.mjs:26` | asserted |
| `COST-001` | 3 | the owner records the seat price | `tests/ui/billing-browser.mjs:32` | asserted |
| `COST-001` | 4 | members count one seat each and requester-only and approver-only members are free | `tests/ui/billing-browser.mjs:54` | asserted |
| `COST-001` | 5 | the preview uses integer cents and the owner's explicit tax inputs | `tests/intelligence/runtime.mjs:31` | asserted |
| `COST-001` | 5 | the preview issues no invoice and takes no payment | none | none |
| `COST-001` | 6 | uncertain charges keep their reservation across month boundaries | none | none |
| `COST-001` | 7 | ordinary ticket creation and public conversation continue while research is held | none | none |
| `SANDBOX-001` | 1 | draft edits leave production unchanged | `tests/platform/sandbox-cases.mjs:146` | asserted |
| `SANDBOX-001` | 2 | every configuration difference is listed | `tests/platform/sandbox-cases.mjs:217` | asserted |
| `SANDBOX-001` | 2 | a separate current non-editor owner approves; the owner and the editor are refused | `tests/platform/sandbox-cases.mjs:227` | asserted |
| `SANDBOX-001` | 2 | a qualifying sandbox-admin approves under SANDBOX-004 | `tests/platform/sandbox-cases.mjs:470` | asserted |
| `SANDBOX-001` | 3 | promotion applies the versioned configuration with its audit | `tests/platform/sandbox-cases.mjs:261` | asserted |
| `SANDBOX-001` | 3 | in-flight requests keep their SLA and approval versions | `tests/platform/sandbox-cases.mjs:256` | asserted |
| `SANDBOX-001` | 4 | rollback restores the prior configuration and keeps production authority | `tests/platform/sandbox-cases.mjs:268` | asserted |
| `SANDBOX-001` | 5 | changed production configuration refuses the package | `tests/platform/sandbox-cases.mjs:323` | asserted |
| `SANDBOX-001` | 5 | a withdrawn reviewer refuses the package | `tests/platform/sandbox-cases.mjs:393` | asserted |
| `SANDBOX-001` | 6 | grants, secrets and records stay unchanged | `tests/platform/sandbox-cases.mjs:260` | asserted |
| `SANDBOX-001` | 6 | rehearsal answers are absent | `tests/platform/sandbox-cases.mjs:410` | asserted |
| `SANDBOX-001` | 7 | restore invalidates sandbox packages and approvals | `tests/platform/base-auth-transfer.mjs:206` | asserted |
| `SANDBOX-001` | 8 | the native journeys run at 1440 and 390 | `tests/ui/sandbox-journey.mjs:24` | asserted |
| `MIGRATE-004` | 1 | a 500-asset Snipe-IT export reports serial conflicts in the dry run | `tests/adoption/snipeit-import-cases.mjs:26` | asserted |
| `MIGRATE-004` | 1 | conflicts are resolved before apply | `tests/adoption/snipeit-import-cases.mjs:38` | asserted |
| `MIGRATE-004` | 2 | the owner supplies one Snipe-IT asset CSV export | `tests/adoption/snipeit-import-cases.mjs:21` | asserted |
| `MIGRATE-004` | 2 | the 2 MiB and 1,000-row bounds are enforced | none | none |
| `MIGRATE-004` | 3 | the dry run changes nothing and lists counts, rejected rows, omissions and conflicts | `tests/adoption/snipeit-import-cases.mjs:28` | asserted |
| `MIGRATE-004` | 4 | every row needs an asset tag unique in the file | none | none |
| `MIGRATE-004` | 5 | a serial already in Linen can only be skipped | `tests/adoption/snipeit-import-cases.mjs:33` | asserted |
| `MIGRATE-004` | 6 | apply needs resolved conflicts, the exact fingerprint and accepted omissions; a device recorded since the review refuses | `tests/adoption/snipeit-import-cases.mjs:43` | asserted |
| `MIGRATE-004` | 7 | apply records observed stock with a record custody event quoting the Snipe-IT status | `tests/adoption/snipeit-import-cases.mjs:62` | asserted |
| `MIGRATE-004` | 8 | importing the same export again finds every serial already in Linen | `tests/adoption/snipeit-import-cases.mjs:65` | asserted |
| `MIGRATE-008` | 1 | a ticket CSV and a Zendesk JSON export supply source IDs, authors, times and visibility | `tests/adoption/lightweight-import-cases.mjs:83` | asserted |
| `MIGRATE-008` | 2 | imported tickets are paused and restricted | `tests/adoption/lightweight-import-cases.mjs:35` | asserted |
| `MIGRATE-008` | 3 | imports resume without duplicates | `tests/adoption/lightweight-import-cases.mjs:29` | asserted |
| `MIGRATE-008` | 3 | undo refuses later native changes | none | none |
| `MIGRATE-008` | 4 | people CSV records source facts with no member or manager authority | `tests/adoption/lightweight-import-cases.mjs:65` | asserted |
| `MIGRATE-008` | 4 | existing source identities may only be skipped | `tests/adoption/lightweight-import-cases.mjs:68` | asserted |
| `MIGRATE-008` | 5 | assets CSV records observed stock with a record custody event | `tests/adoption/lightweight-import-cases.mjs:78` | asserted |
| `MIGRATE-008` | 6 | dry runs write nothing and apply needs the exact reviewed fingerprint | `tests/adoption/lightweight-import-cases.mjs:25` | asserted |
| `MIGRATE-008` | 6 | a revoked owner's in-flight import writes nothing | `tests/adoption/lightweight-import-cases.mjs:55` | asserted |
| `MIGRATE-008` | 7 | people and asset CSV files are not retained | none | none |
| `MIGRATE-008` | 8 | related erasure refuses unsanitized replay | `tests/adoption/lightweight-import-cases.mjs:100` | asserted |
| `A1` | 1 | an employee is denied a private note in the conversation | `tests/ui/browser.mjs:543` | asserted |
| `A1` | 1 | the private note is denied through search, notifications, exports and AI context | none | none |
| `A1` | 2 | an employee is denied a private attachment by direct download | `tests/ui/browser.mjs:554` | asserted |
| `A1` | 2 | the private attachment is denied through every other read surface | none | none |
| `A1` | 3 | an employee is denied the HR lifecycle record | `tests/ui/browser.mjs:556` | asserted |
| `A1` | 3 | the HR record is denied through every other read surface | none | none |
| `A1` | 4 | revoked membership prevents later access | none | none |
| `A1` | 5 | erasure removes the content | `tests/work/person-binding-runtime.mjs:88` | asserted |
| `A1` | 5 | erasure prevents replay | `tests/work/person-binding-runtime.mjs:112` | asserted |
| `A2` | 1 | an effect dispatches under a versioned grant | `tests/execution/authority-runtime.mjs:111` | asserted |
| `A2` | 2 | a grant revoked between plan and effect refuses the effect | `tests/execution/authority-runtime.mjs:130` | asserted |
| `A2` | 3 | a grant expired between plan and effect refuses the effect | none | none |
| `A2` | 4 | hostile retrieved text cannot cause an effect | none | none |
| `A3` | 1 | a crash between persisting an operation and its provider write, then a restart, shows reconciliation instead of a duplicate | none | none |
| `A3` | 2 | an unknown effect after a write reconciles without a repeat | `tests/execution/runtime.mjs:130` | asserted |
| `A3` | 3 | cancelling after the effect leaves the compensation owed | `tests/ui/connected-cancellation.mjs:22` | asserted |
| `A4` | 1 | provider readback alone leaves the request at effect verified | `tests/execution/runtime.mjs:582` | asserted |
| `A4` | 2 | only the independent verifier's probes mark it usable | `tests/execution/runtime.mjs:592` | asserted |
| `A4` | 2 | a negative workflow probe follows removal | `tests/ui/connected-request.mjs:40` | asserted |
| `A6` | 1 | an upgraded archived database keeps every prior row and field | `tests/adoption/prior-data-upgrade.mjs:25` | asserted |
| `A6` | 2 | every migration entry is applied and kept | `tests/adoption/prior-data-upgrade.mjs:62` | asserted |
| `A6` | 3 | an imported approval stays inert | `tests/platform/base-auth-transfer.mjs:222` | asserted |
| `A8` | 1 | a post-erasure export redacts the erased person's content | `tests/adoption/history-cases.mjs:56` | asserted |
| `A8` | 2 | each erased reference maps to one stable opaque alias | `tests/platform/base-auth-transfer.mjs:179` | asserted |
| `A8` | 3 | tombstones stay keyed digests | `tests/adoption/history-cases.mjs:61` | asserted |
| `A8` | 4 | typed audit identities remain as opaque aliases | `tests/adoption/history-cases.mjs:60` | asserted |
| `A8` | 4 | no grant is revived | `tests/adoption/runtime.mjs:31` | asserted |
| `A8` | 5 | untyped content still holding an erased identity refuses | `tests/adoption/history-cases.mjs:53` | asserted |
| `A8` | 6 | a pre-erasure snapshot stays refused | `tests/adoption/history-cases.mjs:39` | asserted |
| `A8` | 7 | fresh imports stay held and inert | `tests/adoption/runtime.mjs:44` | asserted |
| `A8` | 8 | no field is exempted and no retained business row is dropped | `tests/adoption/runtime.mjs:52` | asserted |
| `A7` | 1 | an exhausted budget holds the employee's request as budget_held | `tests/intelligence/runtime.mjs:67` | asserted |
| `A7` | 2 | a lost response is an unknown charge keeping its reservation | `tests/intelligence/runtime.mjs:69` | asserted |
| `A7` | 3 | both survive a restart | `tests/intelligence/runtime.mjs:74` | asserted |
| `A7` | 4 | missing model configuration returns needs_configuration with no data | `tests/intelligence/runtime.mjs:82` | asserted |
| `A7` | 5 | touches name sign-in or consent, a setup gap, a correction, physical custody, takeover or recovery | `tests/work/time-cases.mjs:45` | asserted |
| `A7` | 5 | vendor or technician work defaults to its own kind | `tests/work/time-cases.mjs:17` | asserted |
| `A7` | 5 | a touch for the request itself is recorded as that kind | none | none |
| `A7` | 5 | a resumed measured session names what it was for | none | none |
| `A7` | 6 | the effort report counts touches per kind beside unresolved and failed requests | `tests/work/time-cases.mjs:48` | asserted |
| `AGENT-006` | 1 | REPORT-004's report for two request types with a ranked proposal | `tests/work/work-saved-cases.mjs:103` | asserted |
| `AGENT-006` | 2 | the owner chooses the cohort | `tests/work/work-saved-cases.mjs:113` | asserted |
| `AGENT-006` | 3 | types rank by human minutes to remove, with realized saving and evidence | `tests/work/work-saved-cases.mjs:106` | asserted |
| `AGENT-006` | 4 | a type with no verified outcome is listed as not enough evidence, never ranked | none | none |
| `AGENT-006` | 5 | the proposal authorizes nothing | none | none |
| `AGENT-006` | 6 | an auditor reads the same ranking and evidence | `tests/work/work-saved-cases.mjs:111` | asserted |
| `AGENT-009` | 1 | a commitment survives ticket closure | `tests/ui/commitment-restart.mjs:13` | asserted |
| `AGENT-009` | 2 | the commitment survives restart | `tests/ui/commitment-restart.mjs:18` | asserted |
| `AGENT-009` | 3 | it flags a hire whose access never verified | `tests/ui/commitment-browser.mjs:61` | asserted |
| `F1` | 1 | an owner-defined outcome becomes cohort, observations, dependencies, owner and dated obligations | `tests/ui/commitment-browser.mjs:54` | asserted |
| `F1` | 2 | the commitment continues across closure and restart | `tests/intelligence/commitment-cases.mjs:41` | asserted |
| `F1` | 3 | changed staff and service facts invalidate old evidence | `tests/ui/commitment-browser.mjs:56` | asserted |
| `F1` | 4 | stale or absent observations stay unknown | `tests/intelligence/commitment-cases.mjs:59` | asserted |

Rows: 725 asserted, 149 none, 0 moved. Parts audited: 81 (from 59 clauses done at the old reference); 65 are now partial because a row reads none, each with a Gap naming the unasserted outcomes.

The rubric is brief c's: an assertion of the named outcome in a file the clause's Evidence cell lists; a test title, an assertion over an empty set, a subset match offered as proof of an absence, an assertion made before the named condition or in an uncited file does not count. A status-asserting helper call (for example `call(path, body, actor, 404)`) counts as the assertion of that refusal.
