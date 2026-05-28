# Architecture

Pampanga Club System — a React Native (Expo) + Supabase mobile app for managing
school clubs: discovery, membership, attendance, announcements, finances, and
reports.

This document describes the **standard layered architecture** the codebase
follows so new features stay consistent. If you add a feature, follow the same
layering.

---

## 1. Tech stack

| Concern | Choice |
|---|---|
| App framework | Expo (React Native), Expo Router (file-based routing) |
| Language | TypeScript (strict mode) |
| Backend / DB | Supabase (Postgres + Auth + Row Level Security) |
| Navigation | Expo Router: Stack at the root, Drawer + Tabs nested under it |
| State | React Context for auth/session; local component state elsewhere |
| Styling | A single design-token file (`src/constants/tokens.ts`) consumed via `useTheme()` |
| Session storage | `expo-secure-store` on native, `localStorage` on web |

---

## 2. Layers (the important part)

Data flows in one direction. Each layer only talks to the layer directly below
it. **Never skip a layer** (e.g. a screen must not call `supabase` directly for
domain data — it goes through a service).

```
┌─────────────────────────────────────────────────────────────┐
│  app/**            SCREENS (Expo Router routes)              │
│                    - UI + local state + user interaction     │
│                    - calls services, never the DB directly*  │
├─────────────────────────────────────────────────────────────┤
│  src/services/**   SERVICES (domain logic / data access)     │
│                    - one file per domain (clubs, auth, …)    │
│                    - the ONLY place that builds Supabase     │
│                      queries for that domain                 │
│                    - returns { data, error } — never throws  │
├─────────────────────────────────────────────────────────────┤
│  src/services/supabase.ts   CLIENT (single Supabase client) │
├─────────────────────────────────────────────────────────────┤
│  Supabase Postgres + Row Level Security (RLS)               │
│                    - RLS is the real security boundary       │
└─────────────────────────────────────────────────────────────┘

  Cross-cutting:
   src/context/    React Context (AuthContext — session + profile)
   src/hooks/      Reusable hooks (useTheme, useColorScheme)
   src/components/ Reusable UI (Button, Input, Logo, …)
   src/constants/  Design tokens + app-wide constants
   src/types/      All shared TypeScript types
   src/utils/      Pure helpers (sanitize, validation)
```

\* The home dashboard reads a couple of raw `count` queries directly from
`supabase` for simple tile counts. That's the one allowed exception — anything
with domain logic belongs in a service.

### Why this layering

- **Screens stay dumb.** They render state and forward events. Swapping the UI
  doesn't touch data logic.
- **Services are the contract.** Every Supabase query for "clubs" lives in
  `clubs.service.ts`. To know what the app can do with clubs, read one file.
- **RLS is the security floor.** Even if a screen forgets to hide a button, the
  database rejects the unauthorized write. UI gating is a UX nicety; RLS is the
  enforcement.

---

## 3. Service conventions

Every service function returns a `Result<T>`:

```ts
type Result<T> = { data: T | null; error: string | null }
```

- On success: `{ data, error: null }`
- On failure: `{ data: null, error: 'user-safe message' }`

Rules:
- Services **never throw** for expected failures — they return `error`.
- Services **never surface raw Postgres errors** to the UI unless they're
  already safe; map known codes (e.g. `23505` unique-violation) to friendly
  messages.
- One file per domain: `auth`, `clubs`, `membership`, `attendance`,
  `announcement`, `report`. Add a new file for a new domain.
- Joined rows from Supabase may arrive as an object OR a 1-element array
  depending on relationship inference — normalize with the shared `oneOf()`
  helper pattern.

---

## 4. Routing map (Expo Router)

```
app/
├── _layout.tsx                  Root Stack + auth gate (redirects by session)
├── (auth)/                      Unauthenticated screens
│   ├── login.tsx
│   ├── signup.tsx
│   ├── forgot-password.tsx      Request a reset email
│   └── reset-password.tsx       Set a new password (from recovery link)
├── (drawer)/                    Authenticated app (drawer wraps tabs)
│   ├── _layout.tsx              Drawer: Home / Profile / About / Sign Out
│   ├── (tabs)/                  Bottom tabs
│   │   ├── index.tsx            Home dashboard (role-aware)
│   │   ├── clubs.tsx            Browse + search + create
│   │   ├── requests.tsx         Join-request queue (role-aware)
│   │   └── calendar.tsx         All-clubs events agenda
│   ├── profile.tsx
│   └── about.tsx
├── club/
│   ├── create.tsx               Create a new club (adviser/faculty only)
│   └── [id]/                    One club
│       ├── index.tsx            Detail + role-aware action grid
│       ├── manage.tsx           Members management
│       ├── attendance.tsx       Attendance history + summary
│       ├── record-attendance.tsx
│       ├── announcements.tsx    Posts + moderation
│       ├── finances.tsx         Income/expense + balance (+ Export PDF)
│       ├── dues.tsx             Collection tracking (who paid dues)
│       ├── budget.tsx           Budget planning per period
│       ├── reports.tsx          Report submit + approval
│       └── events.tsx          Activity calendar + club statistics
├── moderation/                  Global queues (adviser/faculty)
│   ├── announcements.tsx
│   └── reports.tsx
└── faculty/                     Faculty-coordinator console (role-gated)
    ├── index.tsx               School overview: stats, inactive clubs, PDF report
    └── clubs.tsx               Manage all clubs (cross-club list)
```

The root layout (`app/_layout.tsx`) is an **auth gate**: it watches
`useAuth().session` and redirects unauthenticated users to `/(auth)/login`,
authenticated users into the drawer, and recovery sessions to
`/(auth)/reset-password`.

---

## 5. Roles & access model

Two layers of role, used for different checks (see in-code comments for detail):

- **App-wide role** (`users.role`): `student_member | club_officer | adviser |
  faculty_coordinator`. Chosen at signup. Used for app-wide hints (which
  dashboard cards to show, who may create a club).
- **Per-club role** (derived from `memberships.role_in_club` and
  `organizations.adviser_id` / `faculty_coordinator_id`): "are you an officer of
  THIS club?". Used for per-club power. Never trust the app-wide role for
  per-club gating — a student officer of Club A is a plain student to Club B.

Capability summary (enforced by RLS):

| Action | Who |
|---|---|
| Browse clubs | any signed-in user |
| Create a club | adviser / faculty coordinator |
| Request to join | any student |
| Approve join request | club officer / adviser / faculty |
| Add/remove/promote members | club officer / adviser / faculty |
| Record attendance | club officer / adviser / faculty |
| Post announcement (direct) | club officer / adviser / faculty |
| Submit announcement (pending) | any club member |
| Approve/reject announcement | adviser / faculty |
| Add finance record | club officer / adviser / faculty |
| Submit report | club officer / adviser / faculty |
| Approve/reject report | adviser / faculty |
| Delete a post/record/report | its author/recorder, OR adviser / faculty |

---

## 6. Database & migrations

SQL lives in `supabase/`. Migrations are applied in order via the Supabase SQL
editor:

| File | Adds |
|---|---|
| `schema.sql` | users, organizations, memberships, join_requests + RLS |
| `schema_v2.sql` | attendance + membership write policies |
| `schema_v3.sql` | announcements + last-read tracking |
| `schema_v4.sql` | financial_records |
| `schema_v5.sql` | announcement moderation + creator-only deletes |
| `schema_v6.sql` | reports + approval workflow |
| `schema_v7.sql` | fix: users readable by all authenticated |
| `schema_v8.sql` | organizations INSERT/UPDATE (in-app club creation) |
| `schema_v9.sql` | club cover images: `organizations.image_url` + Storage bucket `club-images` + storage RLS |
| `schema_v10.sql` | profile photos: `users.avatar_url` + Storage bucket `avatars` + storage RLS |
| `schema_v11.sql` | adds `announcements`, `reports`, `join_requests` to the `supabase_realtime` publication |
| `schema_v12.sql` | financial add-ons: `financial_records.receipt_url` + `receipts` bucket, `dues_periods` + `dues_payments`, `budget_items` + RLS |
| `schema_v13.sql` | `events` table (scheduled club events / calendar) + RLS |
| `schema_v14.sql` | faculty coordinator school-wide READ on announcements/events/attendance |
| `schema_v15.sql` | author edit policies + status-guard triggers + faculty cross-club update |
| `seed_sample_club.sql` | demo data |

### Notifications

The app uses **realtime-driven local notifications**, not remote push. While the
app is open or backgrounded, it holds a Supabase Realtime subscription
(`src/services/notifications.service.ts`, started by
`src/hooks/use-realtime-notifications.ts`, mounted in the drawer layout so it
only runs when signed in). When a relevant change arrives it schedules an
immediate local notification via `expo-notifications`:

| Trigger | Audience | Source event |
|---|---|---|
| New approved announcement | club members | `INSERT` on `announcements` |
| Report approved/rejected | the submitter | `UPDATE` on `reports` |
| Join request approved/rejected | the requester | `UPDATE` on `join_requests` |

Realtime respects RLS — each subscriber only receives change events for rows it
can SELECT, so no extra filtering security is needed.

**Event reminders:** `scheduleEventReminders()` (same service) schedules a
LOCAL notification 2 days before each upcoming event using a date trigger. The
Calendar tab calls it on load (gated by `isExpoGo`), cancelling + rescheduling
so the set always matches current events.

**Limitation:** none of this wakes a fully-closed app for *new* server-side
changes. True closed-app push would require registering Expo push tokens and a
Supabase Edge Function (or `pg_net` trigger) that calls the Expo push service
when those rows change — a documented future upgrade, deliberately not built
yet. (Scheduled event reminders DO fire when the app is closed, since the OS
holds the schedule — only the realtime "new change" alerts need the app open.)

### Storage

Two **public** Supabase Storage buckets hold uploaded images:
- `club-images` (schema_v9) — club covers at `<orgId>/cover.<ext>`
- `avatars` (schema_v10) — user photos at `<userId>/avatar.<ext>`

Three **public** Supabase Storage buckets hold uploaded images:
- `club-images` (schema_v9) — club covers at `<orgId>/cover.<ext>`
- `avatars` (schema_v10) — user photos at `<userId>/avatar.<ext>`
- `receipts` (schema_v12) — transaction receipts at `<orgId>/<unique>.<ext>`

Covers/avatars use a stable path + upsert (re-upload overwrites). Receipts use a
unique filename per upload (a club has many). The shared pipeline lives in
`src/services/storage.service.ts`: `expo-image-picker` (base64) →
`base64-arraybuffer` decode → `supabase.storage.upload()` → public URL saved to
the owning row. Cover/avatar URLs get a `?v=<timestamp>` suffix to bust the
image cache after an overwrite.

### PDF export

`exportFinancialPdf()` in `financial.service.ts` builds an HTML statement
(inline styles only), renders it to a PDF with `expo-print`'s
`printToFileAsync`, then opens the share sheet via `expo-sharing`. No server
involved — generation happens on-device.

Migration conventions:
- Tables use `create table if not exists`.
- New columns on existing tables use `alter table … add column if not exists`
  (because `create table if not exists` skips column changes on re-run).
- Policies use **drop-then-create** (`drop policy if exists` then `create
  policy`) because Postgres has no `create policy if not exists`. This makes
  every file safe to re-run.

---

## 7. Adding a new feature (checklist)

1. **Types** — add the row shape(s) to `src/types/index.ts`.
2. **Migration** — new `supabase/schema_vN.sql` with table + RLS (drop-then-create).
3. **Service** — new or existing `src/services/<domain>.service.ts` returning
   `Result<T>`.
4. **Screen(s)** — under `app/`, calling the service; gate UI by role.
5. **Route registration** — add `<Stack.Screen>` entries in `app/_layout.tsx`
   if the screen is outside an existing group.
6. **Document** — update this file's routing map + capability table if relevant.

---

## 8. Conventions recap

- TypeScript strict; no `any` in exported signatures (internal `any` for
  Supabase join rows is tolerated, normalized via `oneOf()`).
- Theme tokens only — no raw hex in components. Pull from `useTheme()`.
- Comments explain **why**, not what; service files carry a header block
  describing their functions and audience.
- `{ data, error }` everywhere — no thrown errors for expected failure paths.
