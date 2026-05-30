// All TypeScript types in one place

export type UserRole =
  | 'student_member'
  | 'club_officer'
  | 'adviser'
  | 'faculty_coordinator'

export type Profile = {
  id: string
  full_name: string
  role: UserRole
  email: string
  // Public URL of the user's profile photo, or null if none uploaded yet.
  avatar_url: string | null
}

export type Organization = {
  id: string
  name: string
  description: string
  adviser_id: string
  faculty_coordinator_id: string
  member_count: number
  created_at: string
  // Public URL of the club's cover image, or null if none uploaded yet.
  image_url: string | null
}

// Club detail = the org row + the adviser's profile (joined) + the membership rows
// with each member's profile. Used by the club detail screen.
export type ClubDetail = Organization & {
  adviser: Pick<Profile, 'id' | 'full_name'> | null
  members: Array<Pick<Profile, 'id' | 'full_name' | 'role'> & { role_in_club: ClubMemberRole }>
}

// 'member' = regular student; 'officer' = student officer who can approve requests
// alongside the adviser. Stored on the memberships row, not on the user profile.
export type ClubMemberRole = 'member' | 'officer'

export type Membership = {
  id: string
  user_id: string
  organization_id: string
  role_in_club: ClubMemberRole
  joined_at: string
}

// Lifecycle: pending → approved (becomes a Membership) or rejected (terminal).
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected'

export type JoinRequest = {
  id: string
  user_id: string
  organization_id: string
  status: JoinRequestStatus
  message: string | null
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

// JoinRequest enriched with the org name (for the student's "My Requests" list)
// or with the requester's name (for the officer's "Pending Approvals" queue).
export type JoinRequestWithOrg = JoinRequest & {
  organization: Pick<Organization, 'id' | 'name'>
}
export type JoinRequestWithUser = JoinRequest & {
  user: Pick<Profile, 'id' | 'full_name'>
  organization: Pick<Organization, 'id' | 'name'>
}

export type Attendance = {
  id: string
  organization_id: string
  user_id: string
  event_name: string
  attended_date: string
  recorded_by: string | null
  created_at: string
}

// ── Scheduled events (calendar) ──────────────────────────────────────────────
// A planned club event. Distinct from Attendance (which records who showed up).
export type ClubEvent = {
  id: string
  organization_id: string
  title: string
  description: string | null
  location: string | null
  event_date: string // ISO date "YYYY-MM-DD"
  event_time: string | null // free text, e.g. "3:00 PM"
  created_by: string | null
  created_at: string
}

// Event enriched with the club name, for the home dashboard upcoming widget.
export type EventFeedItem = ClubEvent & {
  organization: Pick<Organization, 'id' | 'name'>
}

// Per-club statistics computed from attendance + memberships.
export type ClubStats = {
  memberCount: number
  activeMembers: number // members who attended at least one recorded event
  eventsHeld: number // distinct events with recorded attendance
  attendanceRate: number // 0–100, avg attendees per event ÷ member count
}

// ── Faculty coordinator: school-wide oversight ───────────────────────────────
// Aggregate counts across the whole school.
export type SchoolStats = {
  clubCount: number
  distinctMembers: number // unique students across all clubs
  totalEvents: number
  totalAnnouncements: number
}

// One club's at-a-glance row for the faculty console + inactivity monitor.
// lastActivity is the most recent of: announcement posted, event date,
// attendance recorded. null = no activity ever. daysSinceActivity is null when
// lastActivity is null, else whole days since (0 if today/future).
export type ClubActivity = {
  id: string
  name: string
  adviserName: string | null
  memberCount: number
  lastActivity: string | null
  daysSinceActivity: number | null
}

export type SchoolOverview = {
  stats: SchoolStats
  clubs: ClubActivity[]
}

// "Event" doesn't have its own table — instead we group attendance rows by
// (event_name, attended_date). EventSummary is the grouped projection used by
// the attendance overview screen.
export type EventSummary = {
  event_name: string
  attended_date: string
  attendee_count: number
}

// Per-member roll-up: how many events this user attended in a given club,
// plus the name so the UI doesn't need a second join.
export type MemberAttendanceSummary = {
  user_id: string
  full_name: string
  attended_count: number
}

// Attendance row enriched with the user's name — used by the "who attended
// this event?" detail view.
export type AttendanceWithUser = Attendance & {
  user: Pick<Profile, 'id' | 'full_name'>
}

export type Announcement = {
  id: string
  organization_id: string
  posted_by: string
  title: string
  content: string
  posted_at: string
  // Moderation status — see AnnouncementStatus below for the lifecycle.
  status: 'pending' | 'approved' | 'rejected'
}

// Lifecycle for an announcement when student submission is allowed:
//   • 'approved' — visible to all club members (default for officer/adviser posts)
//   • 'pending'  — student submission waiting for adviser review; hidden from
//                  other members but visible to the author + reviewers
//   • 'rejected' — declined by an adviser; hidden from everyone except author
export type AnnouncementStatus = 'pending' | 'approved' | 'rejected'

// Announcement enriched with the author's name + (for the dashboard feed)
// the club name. Both nested objects are populated by the service via Supabase
// joins, so the UI never needs a second round-trip.
export type AnnouncementWithAuthor = Announcement & {
  author: Pick<Profile, 'id' | 'full_name'> | null
  status: AnnouncementStatus
}
export type AnnouncementFeedItem = AnnouncementWithAuthor & {
  organization: Pick<Organization, 'id' | 'name'>
}

export type FinancialRecord = {
  id: string
  organization_id: string
  type: 'income' | 'expense'
  category: string
  amount: number
  description: string | null
  recorded_by: string | null
  record_date: string
  created_at: string
  // Optional URL of an uploaded receipt photo for this transaction.
  receipt_url: string | null
}

// Roll-up returned by the financial summary endpoint. `balance` is just
// totalIncome - totalExpense; kept on the type so the UI doesn't recompute it.
export type FinancialSummary = {
  totalIncome: number
  totalExpense: number
  balance: number
  transactionCount: number
}

// Record + the recorder's name for the history list (so we can show
// "Recorded by Jane Doe" without a second query).
export type FinancialRecordWithRecorder = FinancialRecord & {
  recorder: Pick<Profile, 'id' | 'full_name'> | null
}

// ── Collection tracking (dues) ───────────────────────────────────────────────
// A dues "period" is one collection campaign with an expected per-member amount.
export type DuesPeriod = {
  id: string
  organization_id: string
  name: string
  amount: number
  created_by: string | null
  created_at: string
}

// A member's payment status for one period, for the collection checklist.
// `paid` is derived (a dues_payments row exists) — there's no DB column for it.
export type DuesMemberStatus = {
  user_id: string
  full_name: string
  paid: boolean
  paid_at: string | null
}

// ── Budget planning ──────────────────────────────────────────────────────────
export type BudgetItem = {
  id: string
  organization_id: string
  period_label: string
  type: 'income' | 'expense'
  category: string
  planned_amount: number
  created_by: string | null
  created_at: string
}

// Reports are formal write-ups submitted by officers for adviser approval.
// 'activity'  = narrative report (events, achievements, project updates)
// 'financial' = financial summary (income/expense roll-up, audit notes)
export type ReportType = 'activity' | 'financial'
export type ReportStatus = 'pending' | 'approved' | 'rejected'

export type Report = {
  id: string
  organization_id: string
  submitted_by: string
  type: ReportType
  title: string
  content: string
  status: ReportStatus
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  review_comment: string | null
}

// Report enriched with submitter + (optional) reviewer profile, joined by
// the service so the UI can show "Submitted by X" + "Reviewed by Y".
export type ReportWithPeople = Report & {
  submitter: Pick<Profile, 'id' | 'full_name'> | null
  reviewer: Pick<Profile, 'id' | 'full_name'> | null
}

// Report row enriched with the org name for the global moderation queue.
export type ReportFeedItem = ReportWithPeople & {
  organization: Pick<Organization, 'id' | 'name'>
}

// ── Club chat (group chat per organization) ──────────────────────────────────
// Schema: supabase/schema_v18.sql. Every member can post; deletes are allowed
// for the author OR any officer/adviser of the club.
export type ClubMessage = {
  id: string
  organization_id: string
  // null when the author's auth row was deleted (FK on delete set null) — the
  // chat keeps the historical row but renders as "Deleted user".
  author_id: string | null
  body: string
  created_at: string
  // Set when the author edits the message; null if never edited. Drives the
  // "(edited)" marker in the chat UI.
  edited_at: string | null
}

// Chat row joined with the author's profile so the UI doesn't need a second
// query per message. `author` is null when the user account was deleted.
export type ClubMessageWithAuthor = ClubMessage & {
  author: Pick<Profile, 'id' | 'full_name'> | null
}

// ── Chat message reports (safety / moderation) ───────────────────────────────
// Schema: supabase/schema_v23.sql.
//   pending  → flagged, awaiting review
//   resolved → reviewer kept the message (report dismissed)
//   removed  → reviewer deleted the offending message
export type MessageReportStatus = 'pending' | 'resolved' | 'removed'

export type MessageReport = {
  id: string
  message_id: string
  organization_id: string
  reported_by: string | null
  reason: string
  status: MessageReportStatus
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

// Report enriched for the moderation queue: the reported message (body +
// author name), the club name, and the reporter's name. `message` is null if
// the underlying message was already deleted.
export type MessageReportFeedItem = MessageReport & {
  message: { id: string; body: string; author_name: string | null } | null
  organization: Pick<Organization, 'id' | 'name'>
  reporter: Pick<Profile, 'id' | 'full_name'> | null
}