Everything Linen keeps lives in the folder you run it from. A backup is one archive file you
make with `rer export` and keep somewhere safe; `rer import` puts it back.

## Make a backup

With Linen stopped or running, from the Linen folder:

```sh
rer export --output exports/linen-2026-10-14.rer
```

Name the file with the date. Archives go in the `exports/` folder of your checkout, which Linen
never serves, or at a full path outside the checkout, such as a backup drive. `rer` refuses any
other place inside the folder, so an archive can never end up on a page.

The archive holds your workspace, people, requests, conversations, attachments and history, with
a check of its own integrity. It deliberately leaves out signed-in sessions and stored provider
credentials. Keep it as private as the data in it.

## Restore

An archive restores with the Linen release that made it. Restore into the same version of Linen
you exported from (the same commit of this repository), then update Linen afterwards if you need
to. Keep that release and its exact source/release identity with each archive.

Restoring only goes into an empty installation, so it can never mix two workspaces. To restore
over the copy on this computer, empty it first. `rer reset --yes` deletes this checkout's local
Linen data, so make sure your backup is the one you want:

```sh
rer reset --yes
rer import --input exports/linen-2026-10-14.rer --yes
```

To restore on another computer, clone the repository at the same commit, then run the same
`rer import` with the archive's path.

## After a restore

Restore the local owner settings before starting Linen:

```sh
rer setup --owner-email '<original owner email>'
rer dev
```

Replace `<original owner email>` inside the quotes with the email that owned the exported
installation, for example `'alex@example.com'`. Keep the quotes, not the angle brackets.
`rer dev` uses these saved settings; it does not ask for the previous owner email.

- **Sign in again.** Sessions are not part of a backup. Open the link from `rer dev`, or use
  `rer outbox` (see [Get started](/docs/getting-started#sign-in-later)).
- **Re-enter connections.** Stored credentials are not part of a backup; open **Connections &
  setup** and enter each one again.
- **Release held work.** Anything that was in flight when you exported is restored as held. In
  **Existing desk & backups**, under **Work on hold**, check each one against what really
  happened (**Confirm what really happened**), then **Release this work**. Linen never
  repeats an action on its own after a restore, and restored history never brings back
  permission to act: current grants are checked again at every action.

## Keep a habit

Make a backup before every update of Linen and on a regular schedule, keep more than one, and try
a restore into a spare checkout now and then. A backup you have never restored is a hope, not a
backup.
