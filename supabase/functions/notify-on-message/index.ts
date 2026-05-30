// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: notify-on-message
//
// Triggered by a Database Webhook on INSERT into public.messages. Sends an Expo
// push notification to every member / adviser / faculty coordinator of the
// club EXCEPT the author, so chat notifications arrive even when the app is
// fully closed (Supabase Realtime only fires while the app is running).
//
// Deploy:
//   supabase functions deploy notify-on-message --no-verify-jwt
//
// Wire it to the messages table (run once, in the SQL editor — see
// supabase/functions/notify-on-message/README.md for the webhook setup), or
// create a Database Webhook in the dashboard:
//   Database → Webhooks → Create
//     Table: public.messages   Events: INSERT
//     Type: Supabase Edge Function → notify-on-message
//
// Env vars (provided automatically to deployed functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// The webhook delivers the inserted row under `record`.
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: {
    id: string
    organization_id: string
    author_id: string | null
    body: string
  } | null
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

Deno.serve(async (req: Request) => {
  try {
    const payload = (await req.json()) as WebhookPayload
    const msg = payload.record
    if (!msg || payload.type !== 'INSERT') {
      return new Response('ignored', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1) Club name + author name + the org's adviser/faculty ids.
    const { data: org } = await supabase
      .from('organizations')
      .select('name, adviser_id, faculty_coordinator_id')
      .eq('id', msg.organization_id)
      .single()

    let authorName = 'Someone'
    if (msg.author_id) {
      const { data: author } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', msg.author_id)
        .single()
      if (author?.full_name) authorName = author.full_name
    }

    // 2) Recipient user ids = members + adviser + faculty, minus the author.
    const recipientIds = new Set<string>()
    const { data: members } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('organization_id', msg.organization_id)
    members?.forEach((m: { user_id: string }) => recipientIds.add(m.user_id))
    if (org?.adviser_id) recipientIds.add(org.adviser_id)
    if (org?.faculty_coordinator_id) recipientIds.add(org.faculty_coordinator_id)
    if (msg.author_id) recipientIds.delete(msg.author_id) // never notify the sender

    if (recipientIds.size === 0) {
      return new Response('no recipients', { status: 200 })
    }

    // 3) Push tokens for those users.
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', Array.from(recipientIds))

    const pushTokens = (tokens ?? []).map((t: { token: string }) => t.token)
    if (pushTokens.length === 0) {
      return new Response('no tokens', { status: 200 })
    }

    // 4) Build Expo push messages. Truncate the body for the notification.
    const preview = msg.body.length > 120 ? `${msg.body.slice(0, 117)}…` : msg.body
    const clubName = org?.name ?? 'Your club'
    const expoMessages = pushTokens.map((to) => ({
      to,
      sound: 'default',
      title: `${clubName}`,
      body: `${authorName}: ${preview}`,
      data: { organization_id: msg.organization_id, type: 'chat' },
    }))

    // 5) Send to Expo in chunks of 100 (Expo's per-request cap).
    for (let i = 0; i < expoMessages.length; i += 100) {
      const chunk = expoMessages.slice(i, i + 100)
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      })
    }

    return new Response(JSON.stringify({ sent: expoMessages.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('notify-on-message error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
