# Documentation-derived synthetic fixtures

These are not customer exports and have no provider acceptance. `tickets.csv`
uses selected field labels pictured in the official Freshservice end-user guide
(page 6): https://s3.amazonaws.com/freshservice-support-assets/user-guides/Freshservice-end-user-guide.pdf
The UTF-8/RFC4180 quoting and ISO timestamps are this fixture's explicit format
choices; the vendor guide does not fix a universal date grammar.

`conversations-101.json` is a separately saved API-response shape based on
https://api.freshservice.com/#list_all_conversations, not a CSV field or an XML
account export. The attachment reference deliberately lacks bytes. Ticket 102
has no conversation page; this absence is reported rather than filled.
The current CSV export guide describes omitted notes/history:
https://support.freshservice.com/support/solutions/articles/50000006341-exporting-tickets
