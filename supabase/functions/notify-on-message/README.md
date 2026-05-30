# notify-on-message — chat push notifications

Sends an Expo push to every club member/adviser/faculty (except the sender)
when a new chat message is inserted, so notifications arrive even when the app
is **fully closed**. (Supabase Realtime only delivers while the app is running;
that path already covers foreground/background and lives in
`src/services/notifications.service.ts`.)

## One-time setup

### 1. Prerequisites
- A **development/production build** of the app (not Expo Go — Expo Go can't
  receive push in SDK 53+).
- An EAS project: run `eas init` in the project root. This writes
  `extra.eas.projectId` into the app config, which the client needs to fetch a
  push token. Without it, `registerPushToken()` logs a notice and no tokens are
  stored (push silently stays off until configured).

### 2. Run the SQL migrations
In the Supabase SQL Editor, run in order if you haven't already:
`schema_v18` → `v19` → `v20` → `v21` → `v22` → `v23` → `v24`.
(`schema_v24.sql` creates the `push_tokens` table this function reads.)

### 3. Deploy the function
```bash
supabase functions deploy notify-on-message --no-verify-jwt
```
`--no-verify-jwt` is required because the Database Webhook calls the function
with the service role, not an end-user JWT.

### 4. Wire the webhook
Easiest via the dashboard:
**Database → Webhooks → Create a new hook**
- Name: `notify-on-message`
- Table: `public.messages`
- Events: ✅ Insert
- Type: **Supabase Edge Functions** → `notify-on-message`
- HTTP method: POST

Or via SQL (requires the `supabase_functions` helper, available on hosted
projects). Replace `<PROJECT_REF>`:
```sql
create trigger on_message_insert_notify
  after insert on public.messages
  for each row
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/notify-on-message',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
```

## Test
1. Build + install the app on two devices, sign in as two different users in
   the same club, and confirm both got the notification permission prompt.
2. Fully close the app on device B.
3. Send a chat message from device A.
4. Device B should receive a push within a few seconds.

## Notes
- The client registers/refreshes its token on every login
  (`registerPushToken` in `notifications.service.ts`).
- Tokens are per-device; uninstalling or reinstalling rotates them. Stale
  tokens are harmless — Expo returns a `DeviceNotRegistered` receipt and the
  row can be cleaned up later if desired.
- To extend this to announcements, add a second webhook on
  `public.announcements` (INSERT, status = approved) pointing at a similar
  function, or generalise this one to branch on `payload.table`.
