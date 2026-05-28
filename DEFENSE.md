# Defense Document — Pampanga Club System

> Practical talking points and anticipated questions for the project defense.
> Use this as a teleprompter — every section gives you what to *say*, not just
> what's true.

---

## 1. Elevator pitch (30 seconds)

> "The Pampanga Club System is a mobile app for Pampanga High School that
> digitises every part of running a student organization — from joining a
> club, tracking who paid dues, posting announcements, recording attendance,
> submitting reports for adviser approval, all the way to school-wide
> oversight for faculty coordinators. It's built with React Native and
> Supabase, with all access control enforced at the database level."

---

## 2. The problem we solved

What clubs currently do (talking points):
- **Paper trail.** Membership forms, sign-in sheets, financial logs — all paper. Easy to lose, slow to audit.
- **No central calendar.** Each club posts events separately; students miss things.
- **Adviser bottleneck.** Reports, announcements, and finances all go through the adviser, but the adviser only finds out when a student physically hands something in.
- **No school-wide view.** Faculty coordinators have no single place to see "which clubs are active, who's behind on reports, how many students are participating."

What this means: extra work for advisers, missed information for students, and zero data for the school to make decisions with.

---

## 3. What the system does

> "It's a single app where every member of the club system — student, officer,
> adviser, and faculty coordinator — has the right view and the right power
> for their role. Everything is on a phone, everything is recorded, and
> faculty have an oversight dashboard for the whole school."

---

## 4. Tech stack & why we chose each piece

| Layer | Choice | Why we picked it (talking points) |
|---|---|---|
| Mobile app | **Expo (React Native)** | One codebase runs on Android, iOS, and web. Expo's developer tools (Expo Go, EAS Build) mean we can ship to students without an app store during the pilot. |
| Backend | **Supabase** (Postgres + Auth + Storage + Realtime) | Single hosted backend — no separate server to maintain. Postgres gives us real relational data + powerful security via Row Level Security. Supabase Auth handles passwords/sessions; Storage handles uploaded files. |
| Language | **TypeScript (strict mode)** | Catches bugs at compile time instead of runtime. Important because the team is small and changes ripple across screens. |
| Navigation | **Expo Router** | File-based routes — the folder structure IS the navigation, easy to reason about. |
| Styling | **Custom design tokens** (`src/constants/tokens.ts`) | One source of truth for colour, spacing, type. Theme switches (light/dark) without touching components. |

**Why not Firebase?** Firebase uses a NoSQL document model — joins are awkward and security rules are harder to reason about. Postgres + RLS gave us real foreign keys (so we can't have orphaned data) and policies that read like SQL.

**Why not a custom Node/PHP backend?** It would have been more code to write and host, with no functional benefit. Supabase gives us auth, database, file storage, and realtime out of the box.

---

## 5. System architecture (high level)

```
┌──────────────────────────────────────────────────────────────┐
│  Expo (React Native) — runs on student phones                │
│                                                              │
│  app/        → Screens (Expo Router file-based routes)       │
│  src/services/ → One file per domain; the ONLY place that    │
│                 talks to Supabase                            │
│  src/context/ → Auth state (session + profile)               │
│  src/components/, hooks/, constants/, types/, utils/         │
└──────────────────────────────────────────────────────────────┘
                            │
                            │  HTTPS + Supabase JS client
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Supabase (cloud)                                            │
│   • Postgres database (all club data)                        │
│   • Row Level Security policies — the security floor         │
│   • Auth (email/password, sessions, password reset)          │
│   • Storage (club covers, avatars, receipts)                 │
│   • Realtime (postgres_changes subscriptions for             │
│     in-app notifications)                                    │
└──────────────────────────────────────────────────────────────┘
```

**Key principle to defend:** the database is the security boundary, not the
client. Even if someone reverse-engineered the app and tried to make a
forbidden request, the database rejects it.

> "Our security model is server-enforced, not app-enforced. Every read and
> write goes through a Row Level Security policy. The mobile app is a
> rendered view of what the database is willing to show you."

---

## 6. Roles & access model (memorize this table)

Two layers of role:

**App-wide role** (chosen at signup, stored on `users.role`):
- `student_member` — regular student
- `club_officer` — student leader
- `adviser` — teacher who advises one or more clubs
- `faculty_coordinator` — school-level oversight (highest)

**Per-club role** (derived from the actual data — never trusted from the app-wide role alone):
- A user is an **officer** of a club only if there's a `memberships` row with `role_in_club = 'officer'`.
- A user is an **adviser/coordinator** of a club only if they're named on the org row.

> "A student officer of Club A is just a regular student to Club B. Per-club
> power is always checked against the per-club data, never the user's app-wide
> label."

### Who can do what (per-club, enforced by RLS)

| Action | Who |
|---|---|
| Browse all clubs | any signed-in user |
| Create a new club | adviser / faculty coordinator |
| Request to join | any student |
| Approve / reject join request | officer / adviser / faculty (of that club) |
| Add / remove / promote members | officer / adviser / faculty |
| Post announcement (directly approved) | officer / adviser / faculty |
| **Submit** announcement (goes to pending queue) | any club member |
| Approve / reject pending announcement | **adviser / faculty only** |
| Record attendance | officer / adviser / faculty |
| Record finance transaction | officer / adviser / faculty |
| Track dues collection | officer / adviser / faculty |
| Submit report | officer / adviser / faculty |
| Approve / reject report | **adviser / faculty only** |
| Schedule event | officer / adviser / faculty |
| Delete a post / record / report | **its author/recorder** OR adviser / faculty |
| Edit a post / report | **its author only** (status changes still locked to adviser) |
| View entire school's activity | **faculty coordinator only** |
| Assign adviser to a club | faculty coordinator |

---

## 7. Feature walkthrough by module

(Use this as the order to demo in — it tells a story.)

### Authentication
- Email + password login, signup with role selection.
- Rate-limited login (5 attempts → 5-minute lockout).
- Persistent session (stays signed in across app restarts).
- **Forgot password** with email reset link + deep link back to the app.
- **Change password** while logged in (verifies current password first).
- Profile editing — name + **profile photo** (uploaded to Supabase Storage).

### Club Discovery & Registration
- Browse all clubs with cover images + member counts.
- **Search** by name/description.
- View club details (description, adviser, members, officers).
- Students send a join request → goes to officer/adviser queue.
- Officers/advisers approve or reject from the **Requests tab**.
- Students see their request status (pending / approved / rejected).

### Membership Management
- Officers/advisers manage members per club: add by email, **promote** to officer, **demote**, remove.
- Self-removal is blocked (so an officer can't accidentally lock themselves out).
- Member directory shown on every club's detail page.

### Attendance Tracking
- Record attendance per event with a checkable roster.
- View **history** of past events.
- Per-member summary: how many events each person attended.

### Announcements & Moderation
- Officers/advisers post announcements directly (auto-approved).
- **Regular students can submit too** — their post goes to "Pending Review".
- Adviser sees a moderation queue (school-wide and per-club).
- Members get in-app notifications when a post is approved.
- **Edit** posts after publishing (author only; status changes locked at DB level).

### Financial Management
- Income & expense tracking per club with running balance.
- **Collection tracking** — campaign-style dues collection (who paid / who didn't).
- **Budget planning** per semester (planned income/expense by category).
- **Receipt photo upload** on each transaction.
- **Export financial report to PDF** — generates an HTML invoice-style statement on-device and shares it.

### Reports
- Two report types — activity and financial — submitted by officers.
- Adviser/faculty approves or rejects with a reviewer note.
- Status pills (Pending / Approved / Rejected).
- Author can edit own reports while pending.

### Notifications
- **Realtime in-app notifications** for: new approved announcement, report approved/rejected, join request approved/rejected.
- **Scheduled local reminders** 2 days before every upcoming event.
- (Real closed-app push is documented but deferred — see "Limitations".)

### Events & Calendar
- Per-club events screen with **club statistics** (attendance rate, active members, events held).
- **Calendar tab**: a real month grid with dot markers on event days; tap a day to see its events.
- **Upcoming events widget** on the home dashboard.

### Faculty Coordinator console
- **School-wide stats**: clubs, students, events, announcements.
- **Inactive clubs monitor** — clubs with no activity in 30+ days.
- **Manage all clubs**: searchable list of every club, status badges, **assign/change adviser** from a modal.
- **Generate school-wide PDF report**.

---

## 8. Security & access control (likely Q&A area)

### Two-layer defense
1. **Row Level Security (RLS) in Postgres** — every read and write goes through a policy. Even if someone bypassed the app, the database rejects unauthorized requests.
2. **UI gating** — buttons and screens only render when the user is allowed to use them. Defense-in-depth: UI is a convenience, RLS is the actual security.

### Examples to cite if asked

> "How do you prevent a student from approving their own announcement?"

The `announcements` table has a `BEFORE UPDATE` trigger
(`announcements_block_status_spoofing`) that raises an exception if anyone
other than the club's adviser or faculty coordinator tries to change the
`status` column. Even if a malicious client crafted a SQL request directly,
it would fail.

> "How do you prevent one student from deleting another student's report?"

The `DELETE` policy on `reports` reads:
`submitted_by = auth.uid() OR caller is adviser/faculty of the club`.
A regular student can only delete their own. An officer cannot delete another
officer's report — that was deliberately tightened in `schema_v5.sql`.

> "What about passwords?"

We never store or see passwords — Supabase Auth handles hashing
(bcrypt-equivalent). The app only exchanges email + password for a session
token, which is stored in **expo-secure-store** (encrypted device storage,
not plain localStorage).

> "What if someone uploads a malicious image?"

Storage buckets are public-read but require an authenticated upload. Files
are served with the correct content-type via the public URL — they can't be
"executed" as code. The receipt bucket could be made private with signed
URLs for stronger isolation (noted as a follow-up).

### Privacy
- Users can read other users' names + emails + roles (intentional for "Add
  Member by Email" and the members list).
- Per-club data (announcements, finances, attendance) is RLS-gated to that
  club's members + adviser + faculty.
- Faculty coordinators can READ school-wide for oversight but cannot WRITE to
  clubs they don't coordinate.

---

## 9. Database schema (at a glance)

12 tables, all under RLS:

| Table | Purpose |
|---|---|
| `users` | Profile rows mirrored from auth.users (full_name, role, email, avatar_url) |
| `organizations` | Clubs (name, description, image_url, adviser_id, faculty_coordinator_id) |
| `memberships` | Who belongs to which club, and as what (member vs officer) |
| `join_requests` | Students requesting to join a club (status lifecycle) |
| `attendance` | One row per (user, event) marking they were present |
| `announcements` | Posts per club, with moderation status |
| `financial_records` | Income/expense transactions with optional receipt photo |
| `dues_periods` + `dues_payments` | Collection tracking |
| `budget_items` | Planned income/expense per period |
| `reports` | Activity / financial reports with approval workflow |
| `events` | Scheduled (calendar) events |

Plus two **Supabase Storage** buckets: `club-images`, `avatars`, `receipts`.

**Schema is versioned.** 15 migration files (`supabase/schema*.sql`) — each one
adds tables, columns, or policies and is safe to re-run. We can replay the
whole schema on a fresh Supabase project in minutes.

---

## 10. Demo walkthrough (suggested 8-minute script)

1. **(30s)** **Sign in** as a faculty coordinator. Open the drawer → School Overview.
   - Point out: stats tiles, inactive clubs section, "Generate Report" button.
2. **(30s)** Tap **Manage All Clubs** → show search → assign an adviser to a club via the modal.
3. **(1m)** Sign out, **sign up** a new account as a Student Member. Show the role picker on signup.
4. **(1m)** Land on the **Home dashboard** — stat tiles + Quick Actions + Calendar tab.
5. **(1m)** **Clubs tab** → tap "Computer Club" → cover image, members, **Request to Join**.
6. **(1m)** Switch to a second account (the adviser) → **Requests tab** → approve the request.
   - In the first account, the dashboard updates (Clubs Joined +1).
7. **(1m)** As a member, open the club → **Announcements** → submit a post. Note the "Pending" status.
8. **(1m)** Adviser approves it from Home → Pending Approvals → "Posts to Review".
9. **(1m)** Show **Finances** → record a transaction with a **receipt photo** → **Export PDF**.
10. **(30s)** Show **Calendar tab** → month grid with markers.

End by closing the app to show the session persists.

---

## 11. Design decisions — questions the panel will ask

### "Why did you use Supabase instead of Firebase?"
Supabase is built on Postgres — a real relational database with foreign keys,
joins, and Row Level Security. Firebase's NoSQL document model would have
made our many-to-many relationships (clubs ↔ members, events ↔ attendance)
much harder to model, and its security rules are less expressive than RLS.

### "Why React Native / Expo?"
One codebase ships to Android, iOS, and web. The school's students use a mix
of devices, so we can't afford to write two apps. Expo specifically gives us
managed builds (no Xcode/Android Studio needed during development) and a
dev-client workflow for over-the-air updates.

### "How does authentication work?"
Email + password handled by Supabase Auth (which uses bcrypt-equivalent
hashing). On successful login the app receives a JWT, stored encrypted in
device secure storage (expo-secure-store on native, localStorage on web with
appropriate warnings). The JWT is sent automatically with every API call.

### "What is RLS?"
Row Level Security is a Postgres feature where the database checks a
**policy** before returning or modifying any row. For example, the
`announcements` SELECT policy says "you can read this row if you're a member
of its club, or if you're the club's adviser." The check runs in the
database on every query — the client cannot bypass it.

### "How do you handle network failures?"
The services return `{ data, error }` objects rather than throwing. Screens
show error banners or toast messages on failure. Critical writes (like
recording attendance) are not yet retry-on-failure — this is documented as
future work.

### "Is this scalable?"
For one high school (≤100 clubs, ≤3000 students), yes — the architecture
holds. Beyond that (a whole district, years of accumulated data), several
patterns would need rework: replacing fetch-everything stats with Postgres
views, adding pagination, server-side search. The clean service-layer
architecture means these are localized changes — you optimize a single
function without touching screens.

### "What happens if Supabase goes down?"
The app needs network connectivity. Offline support is a documented future
enhancement. For school operations this is acceptable since the school has
Wi-Fi; for outdoor events we'd add an offline queue.

### "How did you test it?"
Manual end-to-end testing with multiple accounts across roles. Automated
test suites are documented as future work — at this stage, type-checking via
TypeScript strict mode catches most class-of-bug errors before they ship.

### "Why no closed-app push notifications?"
We built **realtime in-app notifications** + **scheduled local reminders**
which together cover most cases (a calendar reminder still fires when the
app is closed, because the OS holds the schedule). True closed-app push that
wakes the app on a new event requires a Supabase Edge Function deployed
separately — documented in ARCHITECTURE.md as the next step.

### "How is user data privacy maintained?"
Names + roles are visible to other authenticated users (necessary for joining
clubs by email and seeing rosters). Per-club data — announcements, finances,
attendance — is restricted by RLS to that club's members and adviser. Faculty
coordinators have read-only oversight for school-level visibility. We do not
store personal data beyond what's needed (no addresses, phone numbers, etc.).

### "Could a student SQL-inject the database?"
The Supabase JS client uses parameterized queries — strings are never
concatenated into SQL. RLS would block any unauthorized query even if
injection were possible. The threat surface is essentially the public API.

### "How much would this cost to run?"
On Supabase's free tier: $0 for a single school's scale (well under the
500MB database / 1GB storage / 50k monthly active users limits). The first
paid tier is $25/month if those limits are exceeded.

---

## 12. Known limitations (don't hide these — own them)

1. **No automated tests.** Manual testing only. Documented as priority for the next phase.
2. **No closed-app remote push.** In-app realtime + scheduled reminders only.
3. **No offline support.** Requires network.
4. **In-memory client-side search.** Works for current scale; would need server-side `ilike` queries at thousands of rows.
5. **Receipts in a public bucket.** Receipts can contain sensitive info; future work is moving to a private bucket with signed URLs.
6. **No audit log.** Deletions are hard-deletes with cascade. Future work is a `deleted_at` soft-delete + an audit table.
7. **Email confirmation disabled during development.** Production rollout would re-enable with a Postgres trigger to auto-create the profile row.

> "We chose to defer these because for the school's pilot scale they don't
> bite, and the layered architecture means each is a localized fix when we
> decide to do them."

---

## 13. Future work / roadmap

- Pagination + server-side aggregation for performance at district scale.
- Audit log for finances + soft deletes.
- True remote push (Supabase Edge Function calling Expo's push service).
- File attachments on announcements & reports.
- Offline support via a local SQLite mirror + sync.
- Real environments split (dev / staging / prod Supabase projects).
- Error tracking (Sentry).
- Automated test suite.
- Accessibility audit + multi-language (English / Tagalog).

---

## 14. Closing statement (memorize)

> "What we've built is a complete, role-aware, security-first club management
> system that runs on a phone and replaces an entirely paper-based workflow
> for Pampanga High School. Every feature — from the join-request flow to
> faculty oversight — is gated by database-level rules so the app is safe
> against bypass. The architecture is intentionally simple and layered so
> the system can grow without rewrite. We deferred a small list of
> production items in the interest of getting the core experience right; all
> of them are localized, well-documented, and on the roadmap."

---

## 15. One-line answer to "is the system done?"

> "Yes, for what we set out to build. The complete club workflow is in;
> the deferrals are production-readiness items, not missing features."

---

## Quick reference: file map for the panel

- **README.md** — How to install + run the app.
- **ARCHITECTURE.md** — How the codebase is organized + every migration explained.
- **DEFENSE.md** (this file) — What to say at the defense.
- **supabase/schema*.sql** — 15 migration files, one per feature batch, all idempotent.
- **app/** — Screens (Expo Router).
- **src/services/** — One file per domain; every Supabase query lives here.

---

## 16. Opening script (literal lines to read)

> "Good [morning/afternoon], members of the panel. We're presenting the
> **Pampanga Club System** — a mobile application designed to digitise the
> entire workflow of student organizations at Pampanga High School.
>
> Today's currently paper-based process makes it hard for students to discover
> clubs, for officers to track members and finances, for advisers to oversee
> what's happening, and for faculty coordinators to get a school-wide picture.
> The result is missed deadlines, lost records, and very little institutional
> memory.
>
> Our solution is a single mobile app where each user — student, officer,
> adviser, and faculty coordinator — has a role-appropriate experience, and
> where every piece of data is protected by database-level security rules.
>
> Over the next [X] minutes we'll walk through the architecture, demo the
> system, and discuss the design decisions we made along the way."

---

## 17. Glossary (in case the panel asks "what is…?")

| Term | Plain English |
|---|---|
| **React Native** | A framework that lets us write one app in JavaScript that runs on both Android and iOS. |
| **Expo** | A toolkit on top of React Native that makes building and testing easier (it handles signing, packaging, and over-the-air updates). |
| **Supabase** | Our backend-as-a-service. Think of it as a cloud-hosted database that also handles user accounts and file storage, all behind a single API. |
| **PostgreSQL / Postgres** | The relational database engine inside Supabase. Same database used by huge companies like Apple, Reddit, and Instagram. |
| **Row Level Security (RLS)** | A Postgres feature that runs a "permission check" on every single row before letting a user see or change it. This is the bedrock of our security. |
| **JWT (JSON Web Token)** | The cryptographically-signed token a logged-in user carries on every request. The database uses it to know who's asking. |
| **TypeScript** | A version of JavaScript that adds type checking — catches typos and wrong-type bugs at compile time, before users see them. |
| **Realtime** | Supabase's feature that pushes database changes to subscribed apps. Our notification system uses this. |
| **Migration** | A SQL file that changes the database schema. We have 15 of them, each safe to re-run. |
| **RLS policy** | A SQL `WHERE` clause attached to a table that defines who can do what. |
| **Trigger** | A small piece of code that runs automatically on every insert/update/delete on a table. We use them to block users from changing fields they shouldn't. |
| **Storage bucket** | A folder in Supabase Storage holding uploaded files (we have three: club images, avatars, receipts). |
| **Edge Function** | A serverless function on Supabase. We don't use one yet, but it's the path for true remote push. |

---

## 18. Why this and not [existing alternative]?

The panel may ask "why didn't you just use [X]?" Here are honest answers:

### "Why not just use Google Forms + Sheets?"
- No role-based access; everyone who has the link can edit.
- No mobile-first workflow — fine on a laptop, painful on a phone.
- No realtime — students don't get notifications.
- No file storage for receipts, photos, etc.
- No relational integrity — easy to create orphaned data.
- Fragmented: every club ends up with its own folder, no school-wide view.

> "Google Forms is great for one-off polls. It's not a system."

### "Why not just use a Facebook group?"
- No structured data — can't query "who paid dues?" or "what's the balance?"
- No role enforcement — anyone with the link can post anything.
- No persistence — old posts disappear into the timeline.
- Not searchable, not exportable.
- Privacy: tied to personal Facebook accounts.

### "Why not buy a commercial school-management product?"
- They're expensive (typically per-student per-year licensing).
- Built for billing/grading first; clubs are an afterthought (if included at all).
- Vendor lock-in: data lives in their system, hard to leave.
- This project gives the school full control over the data and the roadmap.

### "Why not a website instead of an app?"
- Push notifications work best on installed apps.
- Camera access (receipts, profile photos) is smoother native.
- Offline-capable in the future.
- Our framework (Expo / React Native) actually builds a website too — `expo start --web` produces a browser version of the same codebase. Best of both worlds.

---

## 19. Cost & sustainability

> "How much does this cost to operate?"

| Tier | Cost | Limits | Good for |
|---|---|---|---|
| **Supabase Free** | $0 / month | 500 MB database, 1 GB storage, 50k monthly active users, 2 GB egress | This pilot + first year at Pampanga HS |
| **Supabase Pro** | $25 / month | 8 GB database, 100 GB storage, 100k MAU | District-wide, multiple schools |
| **Apple App Store** | $99 / year | — | Only if publishing to iOS App Store |
| **Google Play** | $25 one-time | — | Android distribution |

For the school's pilot scale, the **total ongoing cost is ₱0**. Distribution
during the pilot can use a sideloaded APK (no Play Store needed).

> "What if Supabase changes their pricing?"
The database is plain Postgres — fully portable. We could migrate to any
Postgres-compatible host (Neon, Render, self-hosted) in a weekend. Supabase
is convenient, not a hard dependency.

---

## 20. Implementation summary (what's actually been built)

If asked about scope of work:

- **15 database migrations** (~700 lines of SQL) defining 12 tables, ~40 RLS policies, 2 triggers, 3 storage buckets.
- **~25 screens** in the mobile app, organized into role-aware sections.
- **~12 service modules** — one per domain (auth, clubs, membership, attendance, announcements, financial, dues, budget, reports, events, notifications, faculty, storage).
- **Typed end-to-end** — TypeScript strict mode, ~30 shared types in `src/types/index.ts`.
- **Comprehensive documentation**: README, ARCHITECTURE, this DEFENSE.
- **Demo seed data** (`supabase/seed_sample_club.sql`) for a fully-populated test club.

The codebase is **production-grade in structure**: cleanly layered, type-safe, and documented. The work remaining is *operational* (testing, monitoring, deployment polish), not *architectural*.

---

## 21. Lessons learned (for the reflective question)

If asked "what did you learn?" or "what would you do differently?":

1. **Build the security model first, not last.** Designing RLS from day one is much easier than retrofitting it. Doing this prevented an entire class of "we forgot to check permissions" bugs.

2. **The database is part of the codebase.** Treating SQL migrations as first-class artifacts (versioned, idempotent, documented) made it easy to reproduce environments and onboard new contributors.

3. **Comments should explain *why*, not *what*.** A comment that says "this is a button" wastes attention. A comment that says "we cancel all scheduled notifications because the reminder set must always match current events" earns its keep.

4. **Defer features deliberately, not accidentally.** Knowing exactly what we left out — and why — is more valuable than building everything halfway. The "Known Limitations" section is something we own, not something we hide.

5. **One source of truth per domain.** Every Supabase query for "clubs" lives in one file. Future-us doesn't have to grep across screens to know what the system can do.

---

## 22. Backup plan if the demo breaks

Things that could go wrong + how to recover:

| Failure | Mitigation |
|---|---|
| Internet drops mid-demo | Have the seed-data screenshots ready as backup; describe the flow with stills. |
| Supabase outage | Switch to the prepared demo video. |
| Wrong account state | Restart the app; the auth gate routes you correctly. |
| Image picker fails on Expo Go | Acknowledge the Expo Go vs dev build difference; show with covers already in the seed data. |
| App crashes | The **ErrorBoundary** catches it gracefully; show how the "Try Again" works as a feature, not a failure. |

> "If something breaks, slow down, name what's happening, and move on. The
> panel cares more about your understanding than your demo's perfection."

---

## 23. Self-assessment on common rubric criteria

Use this to anticipate scoring questions. Be honest — examiners can tell.

| Criterion | Self-rating | Justification |
|---|---|---|
| **Problem-solution fit** | Strong | Every feature ties back to a paper-based pain point. No bolted-on functionality. |
| **Technical depth** | Strong | Real database design with RLS, triggers, foreign-key integrity, realtime. Not a CRUD-only project. |
| **UI/UX polish** | Solid | Consistent design tokens, role-aware screens, native pickers, toasts, error boundary, school branding. |
| **Code quality** | Strong | Strict TypeScript, layered architecture, comprehensive comments, ~30 typed interfaces. |
| **Documentation** | Strong | Three separate docs (setup, architecture, defense) + inline. |
| **Testing** | Honest gap | Manual testing only; automated tests deferred. We acknowledge this in Limitations and future work. |
| **Scalability** | Good for scope | Holds for one school. Documented bottlenecks and the fix plan if it grows. |
| **Security** | Strong | RLS + triggers + creator-only delete + spoofing-proof status changes. |
| **Innovation** | Moderate | Conventional architecture choices, but role-aware moderation workflow + RLS-driven realtime are not trivial. |
| **Project management** | Solid | 15 migration files + 3 docs show iterative, traceable development. |

---

## 24. If you only remember three things

For each defense member, leave them with:

1. **"Security is enforced at the database, not the app."** That's the headline.
2. **"One codebase, four roles, full workflow."** From join request to faculty oversight — every step of running a club is in one app.
3. **"Architected to grow."** What we've shipped fits one school today, and the clean service-layer architecture means scaling to a district is *localized changes*, not a rewrite.

---

## 25. Sample exchange (what a smooth defense might sound like)

**Panel:** "How do you prevent a regular student from approving their own
announcement to bypass moderation?"

**You:** "Two layers. First, the UI hides the approve button — it only renders
for adviser and faculty coordinator roles. But UI gating is a convenience,
not security. The real protection is a Postgres trigger called
`announcements_block_status_spoofing` — it runs on every UPDATE to the
announcements table and raises an exception if anyone other than the club's
adviser or faculty coordinator tries to change the `status` column. So even
if a student crafted a direct database request, the database itself refuses
to apply it."

**Panel:** "And what if someone deletes a transaction to hide it?"

**You:** "Currently transactions are hard-deleted with a cascade. Only the
original recorder or the adviser can delete a row — we deliberately blocked
officer-vs-officer deletes in schema version 5. For a real audit trail
we've documented soft-deletes plus an audit log table as the next phase of
work — it's a localized addition, two new tables and updated policies, no
restructure needed."

**Panel:** "Why not implement that already?"

**You:** "We prioritized features that demonstrate the full workflow first.
The audit log is something the school needs once the system is operational
and there's real money flowing through it. It's the right next step, but
not the right *first* step."

---

## 26. Final closing (memorize)

> "We set out to replace a paper-based, fragmented club workflow with a
> mobile-first, role-aware, security-first system. We built it on solid
> foundations — relational data, server-enforced permissions, type-safe code
> — so the school can rely on it now and grow it later. Thank you for your
> time, and we're happy to answer any questions."
