You can try Linen beside the desk you have. Connect Freshservice, review what comes across, and
keep your current desk running while you decide. Nothing in Freshservice changes because Linen
reads it.

## 1. Connect your existing desk

In **Connections & setup**, choose **Connect a service** and **Freshservice existing desk**.
Enter your exact `tenant.freshservice.com` domain and an API key, save, then **Check
connection**. When the check passes, **Discover available facts** reads what your desk holds, a page at a
time, into one review. Confirm or correct what it found before you apply it.

## 2. Bring the history across

Open **Existing desk & data custody** from the setup rail.

1. Under **Incumbent sources**, use **Connect an incumbent source**: pick the **Validated
   Freshservice connection**, its workspace number and, if you like, a date to read changes
   since.
2. **Read the next source page** until every page you want has been read.
3. Open the import. **Map an imported principal to a reviewed current member** for each person
   who should see their old conversations; anyone you do not map stays an anonymous name in the
   history and gets no account.
4. **Check this import** lists exactly what will come across, what will not, and why.
5. When you accept that list, tick the box and choose **Apply reviewed import** under **Adopt
   reviewed history**.

Imported requests arrive paused and restricted, with their Freshservice status kept as history.
Only the mapped requester and owners can see them, and private notes stay private.

## 3. Run both side by side

While you decide, both desks can stay open. Linen never takes over work that Freshservice still
does: under **Choose custody and execution responsibility**, **Review one execution owner**
records, for one exact resource and action, that Linen now owns it, and asks for evidence that
the Freshservice side is switched off before it does. Until then Linen does not act on that
resource.

Imported work never acts on its own. Anything that was in flight stays held until an owner
checks the current evidence (**Reconcile current evidence**) and releases it (**Release
reconciled hold**).

## Saved files instead of a connection

If you have saved Freshservice exports instead of an API key, Linen can import tickets and
conversations from those files through its owner-only API. The formats, limits and steps are in
[Freshservice saved files](/docs/freshservice-saved-files).

## Before you switch off Freshservice

Keep your original Freshservice exports and a Linen backup ([Back up and
restore](/docs/backup-and-restore)) until you have tried a restore and are happy with what came
across.
