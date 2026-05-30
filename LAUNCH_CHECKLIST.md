# Launch checklist — Pampanga Club System

Everything needed to ship to the Google Play Store / Apple App Store, plus the
data-safety answers you'll be asked for. Tick items as you go.

---

## 1. Database migrations (run once, in order)

In the Supabase SQL Editor, run any you haven't yet, in numeric order:

```
schema.sql, schema_v2 … schema_v17   (base app — assumed already applied)
schema_v18.sql   chat: messages table + realtime
schema_v19.sql   chat: last_read_messages_at column
schema_v20.sql   chat: chat_reads table (per-user read state, all roles)
schema_v21.sql   chat: server-clock mark_chat_read RPC
schema_v22.sql   chat: publish chat_reads to realtime (live tab badge)
schema_v23.sql   safety: message_reports table
schema_v24.sql   push: push_tokens table
schema_v25.sql   chat: editable messages (edited_at + update RLS)
schema_v26.sql   chat: anti-flood rate-limit trigger
schema_v27.sql   attendance: QR check-in sessions + check_in RPC
```

> ⚠️ **Native rebuild required**: QR check-in added `expo-camera`
> (a native module). You must create a NEW dev/production build — an old
> build or Expo Go will not have the camera, and scanning won't work.

Also run the data seed once if not done: `seed_real_clubs.sql` (28 PHS clubs).

## 2. Push notifications (optional but recommended)

1. `eas init` — creates the EAS project and writes `extra.eas.projectId` into
   the app config (the client needs it to fetch a push token).
2. `supabase functions deploy notify-on-message --no-verify-jwt`
3. Create a Database Webhook on `public.messages` (INSERT) → the
   `notify-on-message` function. Full steps:
   `supabase/functions/notify-on-message/README.md`.
4. Test on a real dev/production build with two accounts (Expo Go can't
   receive push on SDK 53+).

## 3. App identity / assets

- [ ] **App icon** — replace `assets/images/icon.png` and the Android adaptive
      set (`android-icon-foreground.png`, `android-icon-background.png`,
      `android-icon-monochrome.png`) with branded artwork (school logo on the
      amber/white brand colors). 1024×1024 for `icon.png`.
- [ ] **Splash** — `assets/images/splash-icon.png` (the background colors are
      already set to the brand tones in `app.json`).
- [ ] **Bump the version** in `app.json` (`expo.version`) for each release, and
      set Android `versionCode` / iOS `buildNumber` (EAS can auto-increment).
- [ ] Confirm `expo.name` ("PampangaClubSystem") and `slug` are what you want
      shown; set a friendlier display name if needed.

## 4. Store listing copy (prepare in advance)

- [ ] **Title**: e.g. "Pampanga Club System"
- [ ] **Short description** (≤80 chars): "Join clubs, chat, and manage
      activities at Pampanga High School."
- [ ] **Full description**: what it does + who it's for (students, officers,
      advisers, faculty).
- [ ] **Screenshots**: phone screenshots of Home, Clubs, a club page, Chat, and
      the Calendar. (At least 2; Play wants 1080px-wide.)
- [ ] **Category**: Education.
- [ ] **Privacy Policy URL**: Play & Apple both REQUIRE a publicly reachable
      URL. The in-app policy (`app/legal/privacy.tsx`) is the source text —
      publish the same content at a public link (e.g. a GitHub Pages page or
      the school website) and paste that URL into both stores.

## 5. Google Play "Data Safety" form (answers, derived from the privacy policy)

Data collected and linked to the user:
- [ ] **Name** — collected, linked to user. Purpose: App functionality.
- [ ] **Email address** — collected, linked. Purpose: App functionality,
      account management. Not shown publicly.
- [ ] **Photos** (optional avatar / club covers) — collected, linked. Purpose:
      App functionality.
- [ ] **Messages** (in-app chat) — collected, linked. Purpose: App
      functionality. NOT shared with third parties.
- [ ] **App activity** (memberships, attendance, events) — collected, linked.
      Purpose: App functionality.
- [ ] **Device identifiers** (push token) — collected, linked. Purpose: app
      functionality (notifications you opt into).

Answers to the standard questions:
- Is data encrypted in transit? **Yes** (HTTPS to Supabase).
- Can users request deletion? **Yes** — via the school (document the contact).
- Is data sold/shared with third parties? **No.**
- Is any data used for ads? **No.**

> ⚠️ Minors: the app is used by students who may be under 18, under school
> supervision. Review Google Play's **Families** policy and your local
> data-protection rules. Fill in a real contact email in
> `app/legal/privacy.tsx` (currently "your school administration") before
> publishing.

## 6. Apple App Privacy (if shipping to iOS)

Mirror the Play answers in App Store Connect → App Privacy. Declare: Contact
Info (name, email), User Content (photos, messages), Identifiers (push token),
Usage Data — all "used for app functionality," not for tracking.

## 7. Build & submit

```bash
# Android (AAB) and iOS builds via EAS
eas build --platform android --profile production
eas build --platform ios --profile production

# Submit to the stores (after creating store listings)
eas submit --platform android
eas submit --platform ios
```

## 8. Production hardening (recommended, post-launch)

- [ ] **Crash reporting** — an in-app `ErrorBoundary` already catches render
      crashes (`src/components/common/ErrorBoundary.tsx`). To capture them
      remotely: `npx expo install @sentry/react-native`, add your DSN, and in
      `componentDidCatch` call `Sentry.captureException(error)` (there's a TODO
      marker there already).
- [ ] Verify the chat rate-limit (10 msgs / 10 s) feels right; tune
      `schema_v26.sql` if needed.
- [ ] Confirm RLS by signing in as each role and checking what's visible.
