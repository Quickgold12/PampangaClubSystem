# Pampanga Club System

A mobile app for **Pampanga High School** to manage student clubs — discovery,
membership, attendance, announcements, finances, and reports — built with
**Expo (React Native)** + **Supabase**.

For how the code is organised, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Features

- **Auth** — email/password login & signup, role selection, 5-attempt lockout,
  persistent session, **forgot/reset password**, **change password** (logged in).
- **Profile** — edit name, **upload profile photo**, change password.
- **Clubs** — browse, **search**, **create** (advisers/faculty), **cover image
  upload**, request to join.
- **Membership** — add by email, promote/demote, remove.
- **Attendance** — record per event, history, per-member summary.
- **Announcements** — post (officers/advisers), submit-for-review (members),
  adviser moderation, in-app unread badges.
- **Finances** — record income/expense, running balance, **receipt photo
  upload**, **collection tracking** (dues paid/unpaid per member), **budget
  planning** per semester, **export report to PDF**.
- **Reports** — submit activity/financial reports, adviser approval workflow.
- **Role-aware dashboard** — pending-approval cards, officer-club shortcuts,
  upcoming-events widget.
- **Events & stats** — per-club activity calendar (upcoming/past) + club
  statistics (attendance rate, active members, events held).
- **Notifications** — realtime device notifications for new announcements,
  report approval/rejection, and join-request decisions (fires while the app is
  open/backgrounded — not a closed-app remote push). Plus **event reminders**
  scheduled 2 days before each upcoming event.
- **Calendar tab** — month-grid calendar of all your clubs' events with dot
  markers; tap a day to see its events.
- **Faculty console** (faculty coordinators) — school-wide stats, inactive-club
  monitor, manage-all-clubs list, and a school-wide PDF report.

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is fine)
- Expo Go app on your phone, or an Android/iOS emulator

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Find both in Supabase → Project Settings → API.

### 3. Database schema

In the Supabase **SQL Editor**, run these files **in order** (each is safe to
re-run):

```
supabase/schema.sql        -- users, organizations, memberships, join_requests
supabase/schema_v2.sql     -- attendance + membership write policies
supabase/schema_v3.sql     -- announcements + read tracking
supabase/schema_v4.sql     -- financial_records
supabase/schema_v5.sql     -- announcement moderation + creator-only deletes
supabase/schema_v6.sql     -- reports + approval workflow
supabase/schema_v7.sql     -- fix: users readable by all authenticated
supabase/schema_v8.sql     -- in-app club creation (organizations INSERT/UPDATE)
supabase/schema_v9.sql     -- club cover images (image_url + storage bucket)
supabase/schema_v10.sql    -- profile photos (users.avatar_url + avatars bucket)
supabase/schema_v11.sql    -- enable Realtime on announcements/reports/join_requests
supabase/schema_v12.sql    -- financial add-ons: receipts, dues, budget + RLS
supabase/schema_v13.sql    -- scheduled events (calendar) + RLS
supabase/schema_v14.sql    -- faculty school-wide read (announcements/events/attendance)
supabase/schema_v15.sql    -- author edit + status-guard triggers + faculty org admin
```

### 4. Auth configuration (Supabase dashboard)

- **Authentication → Providers → Email**: while developing, turn **Confirm
  email OFF** (so signup creates a session immediately and the profile insert
  succeeds).
- **Authentication → URL Configuration → Redirect URLs**: add the app's deep
  link so password reset can return to the app:
  ```
  pampangaclubsystem://reset-password
  ```

### 5. Run

```bash
npx expo start           # then press a (Android), i (iOS), or scan the QR code
npx expo start --clear   # if routes/assets seem stale
```

---

## Development build (needed for notifications)

Device notifications use `expo-notifications`, which **does not run in Expo Go**
(SDK 53+). Everything else works in Expo Go; only notifications require a
development build. `eas.json` is already configured with a `development` profile.

```bash
npm install -g eas-cli
eas login                 # create a free Expo account if you don't have one
eas init                  # links an EAS project id into app.json (first time only)
eas build --profile development --platform android
```

When the build finishes, install the APK on your phone, then:

```bash
npx expo start --dev-client
```

Open the app through the dev build (not Expo Go). You'll get the notification
permission prompt on first launch, and the three notification triggers
(announcements / report decisions / join-request decisions) will fire.

In **Expo Go** the app detects the sandbox and silently skips notification
setup (no error), so you can keep using Expo Go for everything else.

## Demo data

To create a fully-populated sample club (announcements, finances, attendance):

1. Open `supabase/seed_sample_club.sql`.
2. Change `v_email` to the email you signed up with.
3. Run it in the SQL Editor.
4. Reload the app → Clubs → **Computer Club**.

---

## Demo walk-through (suggested order)

1. **Sign up** as a Faculty Coordinator or Adviser.
2. From **Clubs**, tap **+ Create Club** → make one. You land on its detail page.
3. Open the club → try **Announcements**, **Finances**, **Reports**,
   **Record Attendance**, **Manage Members**.
4. Sign up a second account as a **Student Member** (different email).
5. As the student, **Browse Clubs** → request to join.
6. Back as the adviser, **Home → Pending Approvals → Join Requests** → approve.
7. As the student, submit an announcement → as the adviser, moderate it from
   **Home → Pending Approvals → Posts to Review**.
8. Test **Forgot Password** from the login screen.

---

## Project layout

```
app/            Screens (Expo Router routes)
src/
  components/   Reusable UI (Button, Input, Logo)
  constants/    Design tokens + app constants
  context/      AuthContext (session + profile)
  hooks/        useTheme, useColorScheme
  services/     Data access — one file per domain
  types/        Shared TypeScript types
  utils/        sanitize + validation helpers
supabase/       SQL migrations + seed
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the layering rules and how to add a
feature.

---

## Type-check

```bash
npx tsc --noEmit
```

---

## Known gaps (not yet built)

- File attachments on reports & announcements (club cover + avatar + receipt
  images ARE supported).
- **Remote** push that wakes a fully-closed app (realtime local notifications
  ARE supported while the app is open/backgrounded; closed-app push needs a
  Supabase Edge Function — see ARCHITECTURE.md "Notifications").
- Automated tests.

These are tracked as the next milestones toward production readiness.
