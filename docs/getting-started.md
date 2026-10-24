Linen runs on your own computer with one command, `rer`, the Run Edit Run tool. Everything it
keeps (requests, people, connections, attachments) stays in the folder you run it from.

Linen runs on macOS, Linux or Windows with WSL2, and `rer` brings the Node and pnpm it needs. `rer doctor` tells you if anything is missing and where to get it.

## Get Linen and start it

This is the same line as the [Run page](https://run-linen.com/run):

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-linen
```

Git is required; rer brings Node and pnpm. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-linen` does the same. The line installs `rer`, the Run Edit Run command, for you alone, then starts Linen. If the installer prints a line that puts `rer` on your PATH, run that line too.

`rer` gets Linen into a folder named `run-linen`, installs everything, asks for your email, makes you the owner
and builds the app. When it is ready it prints a line starting `RER_OPEN`. Open that link: Linen opens in your
browser, signed in as you. The link carries a private key for this computer only, so do not share it. To start
it again later, run the same line from the same folder, or `cd run-linen && rer dev`.

Linen answers on three addresses:

| Address | What it is |
|---|---|
| `/` | The front door of your installation, with **Sign in**, or **Finish setup** until you have confirmed it. |
| `/setup` | Confirm the owner account once, before anyone uses the app. |
| `/app` | Linen itself: your work, decisions and every service space. |

## Finish setup

The first time, Linen sends you to **Finish setup**. Check the name and email shown, tick
**I confirm this owner account is ready to use.** and choose **Finish setup**. You land on
**Your work**, with the composer and an empty list: Linen starts with no sample people or
requests.

## Sign in later

Stop Linen with Ctrl+C and start it again with `rer dev` whenever you need it; the new
`RER_OPEN` link signs you straight back in.

To sign in the ordinary way, ask for a sign-in link. Linen does not send real email on your
computer: the message goes to a local outbox instead. With Linen running, open a second
terminal in the same folder and run:

```sh
rer outbox
```

It prints the outbox address. Open it, choose the newest sign-in message and follow its link.
`rer outbox --owner-email you@example.com` asks for a fresh sign-in message for that address
first.

People you add inside Linen get an initial password; they sign in at `/app` with their work
email and that password (see [People and permissions](/docs/people)).

## What to do next

1. Add the people who will use Linen: [People and permissions](/docs/people).
2. Connect your identity provider, existing desk and reasoning model:
   [Connections and setup](/docs/connections).
3. Ask your first request: [Ask and follow a request](/docs/asking).
4. Decide how you will keep a copy of everything: [Back up and restore](/docs/backup-and-restore).
