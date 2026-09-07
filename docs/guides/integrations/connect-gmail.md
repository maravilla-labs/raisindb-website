---
sidebar_position: 4
---

# Connect Gmail

:::caution Preview
The Gmail connector is a preview feature. Validate it against your own account
before relying on it in production.
:::

This guide mounts a Gmail mailbox as a stream of `raisin:Mail` nodes. Gmail is
reached over IMAP with the native `raisin.imap` binding, authenticated with an
XOAUTH2 access token from Google's OAuth flow, so the mount behaves exactly
like the one in [Sync a mailbox](sync-a-mailbox.md) and only the connection
step differs.

## Before you start

- A running RaisinDB instance and a repository you can install packages into.
- `RAISIN_MASTER_KEY` set on the server and backed up. Google tokens are stored
  encrypted with it.
- `RAISINDB_BASE_URL` set to your public base URL, so the console can show
  the redirect URI.
- A Google account with the mailbox you want to mount.

## Step 1: Install the connector

The Gmail connector ships in the IMAP adapter package:

```bash
raisindb package install imap-adapter --repo myapp
```

Besides the adapter and mappers described in
[Sync a mailbox](sync-a-mailbox.md#step-1-install-the-adapter), it installs a
`/connectors/gmail` template preset with `host: imap.gmail.com`,
`port: 993`, `tls: true`, `auth: xoauth2`, Google's OAuth endpoints and the
scope `https://mail.google.com/`.

## Step 2: Add the connector and create a Google OAuth client

In the admin console open **Connectors**, click **Add connector**, pick the
**Gmail** template and save. The connector editor shows the **OAuth Redirect
URI** with a copy button; it has the form
`https://<your-host>/api/integrations/<repo>/oauth/callback`.

In the [Google Cloud Console](https://console.cloud.google.com/):

1. Select a project and enable the **Gmail API**.
2. Configure the OAuth consent screen and add the scope
   `https://mail.google.com/`.
3. Create an **OAuth 2.0 Client ID** of type *Web application*.
4. Paste the redirect URI under *Authorized redirect URIs*.
5. Copy the **Client ID** and **Client secret**.

## Step 3: Connect the account

Back in the connector editor paste the client id and secret, enable the
connector, save, and click **Connect account**. After Google's consent the
account appears with its email address as the subject; the adapter uses that
address as the IMAP username and the access token as the XOAUTH2 secret. The
refresh token stays encrypted on the connector and the engine refreshes the
access token before it expires.

Run **Test connection** with the account selected to confirm the login and
list the mailboxes.

## Step 4: Mount the mailbox

The Gmail template carries the same mount bundle as the IMAP one: **Add
bundle** on the Mounts page creates an ephemeral inbox mount and a `submit`
outbox mount under a root of your choosing (`/gmail` by default). The inbox
mount as a node:

```yaml
node_type: raisin:VirtualMount
properties:
  title: Gmail Inbox
  integration_ref: /integrations/gmail
  account_ref: "<connection id>"
  target_workspace: default
  target_branch: main
  mount_path: /gmail/inbox
  remote_root: INBOX                 # a Gmail label, as an IMAP folder
  mapping_function: /mappers/imap-default
  sync_config:
    mode: poll
    interval_seconds: 300
    ephemeral: true
    ttl_seconds: 86400
    reconcile_deletes: false
  enabled: true
```

Messages become `raisin:Mail` nodes with the properties listed in
[Sync a mailbox](sync-a-mailbox.md#step-3-mount-the-inbox), and a
`node_event` trigger on the mount path runs a function per message exactly as
described there.

## Push through Pub/Sub

Gmail cannot call a webhook directly; it publishes to a Cloud Pub/Sub topic.
With a topic configured the connector reports `supports_push: true` and a
`hybrid` mount arms Gmail's `users.watch` for you. The Pub/Sub setup is
yours to do; see
[Real-time sync with webhooks](realtime-sync-webhooks.md#gmail).

## Running in production

- The mount syncs read-only. Sending goes through the outbox and the tenant's
  configured email provider, not through Gmail's IMAP connection; see
  [Sending from the outbox](sync-a-mailbox.md#sending-from-the-outbox).
- A rejected token pauses the mount with status `auth_required` until the
  account is reconnected.
- Replicated clusters need the `redis` locks backend.

## Next steps

- [Sync a mailbox](sync-a-mailbox.md): the same pattern with an app password.
- [Connect Microsoft 365](connect-microsoft-365.md): mail and calendar over
  Microsoft Graph.
- [Adapter reference](../../reference/virtual-node-adapters.md).
