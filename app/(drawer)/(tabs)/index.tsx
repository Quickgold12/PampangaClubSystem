// ─────────────────────────────────────────────────────────────────────────────
// Home dashboard — the first thing a user sees after signing in.
//
// What this screen does:
//   • Greets the user by name and shows their role.
//   • Shows two stat tiles:
//       - Clubs joined   (count from memberships table)
//       - Pending requests (count from join_requests where status='pending')
//   • Role-aware quick action buttons that deep-link to the right screen.
//       - Everyone: Browse Clubs
//       - Students: My Requests
//       - Officers/advisers/faculty: Approvals Queue
//
// Counts use Supabase's `head: true, count: 'exact'` mode so we only pay for
// the count, never the row payload. If a count fails we render "—" instead of
// blocking the whole dashboard on an error.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import {
  countPendingForReviewer as countPendingAnnouncementsForReviewer,
  countUnreadForUser,
  listFeedForUser,
} from '@/services/announcement.service'
import { countPendingMessageReports } from '@/services/chat.service'
import {
  getPendingForReviewer,
  listAdviserClubs,
  listOfficerClubs,
} from '@/services/clubs.service'
import { listUpcomingForUser } from '@/services/event.service'
import { countPendingForReviewer as countPendingReportsForReviewer } from '@/services/report.service'
import { supabase } from '@/services/supabase'
import { AnnouncementFeedItem, EventFeedItem, Organization } from '@/types'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

type Stats = {
  // Count of upcoming events across the user's clubs. Replaced the old
  // "Clubs Joined" tile — that one always showed 0 for advisers (adviser
  // isn't a membership) and was redundant with the Clubs tab anyway.
  upcomingEvents: number | null
  pendingRequests: number | null
  // Total announcements newer than the user's last_read across all their
  // clubs. Acts as the in-app "notification badge" — see the Recent feed
  // section below for the actual rows.
  unreadAnnouncements: number | null
}

// Counts shown on the "Pending Approvals" card pack — populated only for
// users who actually have moderation power somewhere. Any null indicates
// the corresponding fetch failed; the card is hidden in that case to avoid
// showing "—" as a count (would be confusing for an actionable card).
type ApprovalCounts = {
  joinRequests: number
  announcements: number
  reports: number
  messageReports: number
}

export default function HomeDashboard() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user, profile } = useAuth()

  const [stats, setStats] = useState<Stats>({
    upcomingEvents: null,
    pendingRequests: null,
    unreadAnnouncements: null,
  })
  // Approval counts — three numbers for the adviser/officer "Pending
  // Approvals" card pack. Zeroed by default; per-card visibility is decided
  // by checking > 0 at render time.
  const [approvals, setApprovals] = useState<ApprovalCounts>({
    joinRequests: 0,
    announcements: 0,
    reports: 0,
    messageReports: 0,
  })
  // Clubs where the user holds an officer membership — drives the "Your
  // Officer Clubs" horizontal strip below the Quick Actions.
  const [officerClubs, setOfficerClubs] = useState<Array<Pick<Organization, 'id' | 'name'>>>([])
  // Clubs where the user is the named adviser or faculty coordinator —
  // drives the "Clubs You Advise" strip on the dashboard so an adviser
  // can jump directly into their clubs.
  const [adviserClubs, setAdviserClubs] = useState<Array<Pick<Organization, 'id' | 'name'>>>([])
  // The 5 most recent announcements across the user's clubs — feed strip.
  const [recentFeed, setRecentFeed] = useState<AnnouncementFeedItem[]>([])
  // The next few upcoming events across the user's clubs — events widget.
  const [upcomingEvents, setUpcomingEvents] = useState<EventFeedItem[]>([])
  // No top-level loading state — the dashboard renders immediately and each
  // section progressively fills in. See the render note further down.
  const [refreshing, setRefreshing] = useState(false)

  const isStudent =
    profile?.role === 'student_member' || profile?.role === 'club_officer'
  const isReviewer =
    profile?.role === 'club_officer' ||
    profile?.role === 'adviser' ||
    profile?.role === 'faculty_coordinator'

  const loadStats = useCallback(async () => {
    if (!user) return
    // All queries fire in parallel — bigger batch than before, but each is
    // either a HEAD count or a tiny join. The dashboard stays snappy.
    const [
      requestsRes,
      unreadRes,
      feedRes,
      joinReqRes,
      pendAnnRes,
      pendRepRes,
      msgReportsRes,
      officerClubsRes,
      upcomingEventsRes,
      adviserClubsRes,
    ] = await Promise.all([
      supabase
        .from('join_requests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending'),
      countUnreadForUser(user.id),
      listFeedForUser(user.id, 5),
      // Approval counts for the moderator card pack. join_requests uses the
      // existing getPendingForReviewer (already handles officer+adviser
      // visibility); announcements/reports counts are adviser-only since
      // only advisers can moderate those.
      getPendingForReviewer(user.id),
      countPendingAnnouncementsForReviewer(user.id),
      countPendingReportsForReviewer(user.id),
      // Reported chat messages — officers + advisers can review.
      countPendingMessageReports(user.id),
      // Officer clubs strip data.
      listOfficerClubs(user.id),
      // Upcoming events across the user's clubs.
      listUpcomingForUser(user.id, 4),
      // Clubs the user advises (named on the org as adviser/faculty).
      listAdviserClubs(user.id),
    ])
    setStats({
      // listUpcomingForUser is capped at 4 above, so this is a "next-few"
      // counter rather than an absolute total — which is exactly what an
      // at-a-glance tile should show.
      upcomingEvents: upcomingEventsRes.error ? null : upcomingEventsRes.data?.length ?? 0,
      pendingRequests: requestsRes.error ? null : requestsRes.count ?? 0,
      unreadAnnouncements: unreadRes.error ? null : unreadRes.data ?? 0,
    })
    setApprovals({
      joinRequests: joinReqRes.data?.length ?? 0,
      announcements: pendAnnRes.data ?? 0,
      reports: pendRepRes.data ?? 0,
      messageReports: msgReportsRes.data ?? 0,
    })
    if (feedRes.data) setRecentFeed(feedRes.data)
    if (officerClubsRes.data) setOfficerClubs(officerClubsRes.data)
    if (upcomingEventsRes.data) setUpcomingEvents(upcomingEventsRes.data)
    if (adviserClubsRes.data) setAdviserClubs(adviserClubsRes.data)
  }, [user])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadStats()
    setRefreshing(false)
  }, [loadStats])

  // First word of full_name for a friendlier greeting.
  const firstName = useMemo(() => {
    if (!profile?.full_name) return ''
    return profile.full_name.split(' ')[0]
  }, [profile?.full_name])

  // No full-screen spinner — the dashboard renders immediately so the
  // greeting (using the cached profile from AuthContext) appears on the
  // first paint. Stat tiles fill in their numbers as their queries return;
  // until then they show "—" via StatTile's null-handling.
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Welcome back</Text>
        <Text style={styles.title}>{firstName || 'Hello'}</Text>
        {profile && <Text style={styles.subtitle}>{formatRole(profile.role)}</Text>}
      </View>

      {/* Three stats now — Clubs / Pending / Unread Announcements. The third
          tile acts as the in-app "notification badge" for new posts. */}
      <View style={styles.statRow}>
        <StatTile label="Upcoming" value={stats.upcomingEvents} />
        <StatTile label="Pending" value={stats.pendingRequests} />
        <StatTile label="New Posts" value={stats.unreadAnnouncements} />
      </View>

      {/* ── Pending Approvals card pack (officer / adviser / faculty) ──
          One card per non-zero queue. Whole section is hidden when every
          count is zero, so regular students never see it. */}
      {(approvals.joinRequests +
        approvals.announcements +
        approvals.reports +
        approvals.messageReports) > 0 && (
        <>
          <Text style={styles.sectionLabel}>Pending Approvals</Text>
          <View style={styles.approvalRow}>
            {approvals.joinRequests > 0 && (
              <ApprovalCard
                count={approvals.joinRequests}
                label="Join Requests"
                onPress={() => router.push('/requests' as never)}
              />
            )}
            {approvals.announcements > 0 && (
              <ApprovalCard
                count={approvals.announcements}
                label="Posts to Review"
                onPress={() => router.push('/moderation/announcements' as never)}
              />
            )}
            {approvals.reports > 0 && (
              <ApprovalCard
                count={approvals.reports}
                label="Reports to Review"
                onPress={() => router.push('/moderation/reports' as never)}
              />
            )}
            {approvals.messageReports > 0 && (
              <ApprovalCard
                count={approvals.messageReports}
                label="Reported Messages"
                onPress={() => router.push('/moderation/messages' as never)}
              />
            )}
          </View>
        </>
      )}

      {/* ── Clubs You Advise strip (advisers / faculty coordinators) ──
          Same shape as the Officer Clubs strip below but for the user's
          named-adviser clubs. Rendered ABOVE the officer strip so an
          adviser sees their own clubs first. */}
      {adviserClubs.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Clubs You Advise</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.officerStripContent}
            style={styles.officerStrip}
          >
            {adviserClubs.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/club/${c.id}` as never)}
                style={({ pressed }) => [
                  styles.adviserChip,
                  pressed && styles.actionRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${c.name}`}
              >
                {/* No "ADVISER OF" label — the section header already says
                    "Clubs You Advise". Just the name keeps the chip compact. */}
                <Text style={styles.adviserChipName} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* ── Your Officer Clubs strip (officers only) ──
          Horizontal scroll of compact club chips — quick way to jump into
          a club where the user holds elevated power. Hidden if the user
          isn't an officer of any club. */}
      {officerClubs.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Your Officer Clubs</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.officerStripContent}
            style={styles.officerStrip}
          >
            {officerClubs.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/club/${c.id}` as never)}
                style={({ pressed }) => [
                  styles.officerChip,
                  pressed && styles.actionRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${c.name}`}
              >
                <Text style={styles.officerChipName} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* "What's New" feed strip — only renders when there is recent activity.
          Tapping a row opens that club's full announcements screen, which
          also clears the unread badge for that club. */}
      {recentFeed.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>What&apos;s New</Text>
          <View style={styles.actionList}>
            {recentFeed.map((post) => (
              <Pressable
                key={post.id}
                onPress={() =>
                  router.push(`/club/${post.organization.id}/announcements` as never)
                }
                style={({ pressed }) => [
                  styles.feedCard,
                  pressed && styles.actionRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${post.title} in ${post.organization.name}`}
              >
                <Text style={styles.feedTitle} numberOfLines={1}>
                  {post.title}
                </Text>
                <Text style={styles.feedMeta} numberOfLines={1}>
                  {post.organization.name} • {formatPostedAt(post.posted_at)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Upcoming Events widget — next few events across the user's clubs.
          Each row shows a date chip and links to that club's Events screen.
          Hidden when there's nothing upcoming. */}
      {upcomingEvents.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Upcoming Events</Text>
          <View style={styles.actionList}>
            {upcomingEvents.map((ev) => (
              <Pressable
                key={ev.id}
                onPress={() => router.push(`/club/${ev.organization.id}/events` as never)}
                style={({ pressed }) => [styles.eventRow, pressed && styles.actionRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${ev.title} in ${ev.organization.name}`}
              >
                {/* Compact date chip on the left. */}
                <View style={styles.eventDateChip}>
                  <Text style={styles.eventDateDay}>{eventDay(ev.event_date)}</Text>
                  <Text style={styles.eventDateMonth}>{eventMonth(ev.event_date)}</Text>
                </View>
                <View style={styles.eventRowText}>
                  <Text style={styles.feedTitle} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <Text style={styles.feedMeta} numberOfLines={1}>
                    {ev.organization.name}
                    {ev.event_time ? ` • ${ev.event_time}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionLabel}>Quick Actions</Text>
      <View style={styles.actionList}>
        <ActionRow
          label="Browse Clubs"
          hint="Discover and join organizations"
          onPress={() => router.push('/clubs' as never)}
        />
        {isStudent && (
          <ActionRow
            label="My Requests"
            hint="See the status of clubs you've applied to"
            onPress={() => router.push('/requests' as never)}
          />
        )}
        {isReviewer && (
          <ActionRow
            label="Approvals Queue"
            hint="Review pending join requests for your clubs"
            onPress={() => router.push('/requests' as never)}
          />
        )}
      </View>
    </ScrollView>
  )
}

// Same compact format as the announcements screen — today/yesterday in
// natural language, full date for older posts. Kept here to avoid a shared
// util just for two callers.
const formatPostedAt = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return 'Today'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Day-of-month + short month for the event widget's date chip.
const eventDay = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '?' : String(d.getDate())
}
const eventMonth = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short' })
}

// Approval-queue card — big amber number + label, tappable to jump to the
// relevant queue. Used by the "Pending Approvals" card pack for officers/
// advisers. Three-up in a row with flex:1 so widths match.
function ApprovalCard({
  count,
  label,
  onPress,
}: {
  count: number
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.approvalCard, pressed && styles.actionRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${label}`}
    >
      <Text style={styles.approvalValue}>{count}</Text>
      <Text style={styles.approvalLabel}>{label}</Text>
    </Pressable>
  )
}

// Big number + small label tile. `null` renders as "—" so the layout stays
// stable when a count fails to load.
function StatTile({ label, value }: { label: string; value: number | null }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

// Chevron-style call-to-action row.
function ActionRow({
  label,
  hint,
  onPress,
}: {
  label: string
  hint: string
  onPress: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.actionRowText}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionHint}>{hint}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

const formatRole = (role: string): string => {
  const map: Record<string, string> = {
    student_member: 'Student Member',
    club_officer: 'Club Officer',
    adviser: 'Club Adviser',
    faculty_coordinator: 'Faculty Coordinator',
  }
  return map[role] ?? role
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.color.background,
    },
    container: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    header: {
      marginBottom: t.space.xl,
    },
    eyebrow: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    title: {
      fontSize: t.font.size.h1,
      lineHeight: t.font.lineHeight.h1,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    subtitle: {
      fontSize: t.font.size.body,
      color: t.color.textMuted,
    },
    statRow: {
      flexDirection: 'row',
      // Tighter gap so three tiles fit comfortably on narrow phones. Labels
      // are now short ("Pending", "New Posts") for the same reason.
      gap: t.space.sm,
      marginBottom: t.space.xl,
    },
    statTile: {
      flex: 1,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    statValue: {
      // Slightly smaller than h1 since we now show three tiles per row and
      // the values stay single-digit/double-digit most of the time.
      fontSize: t.font.size.h2,
      lineHeight: t.font.lineHeight.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.accent,
    },
    statLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginTop: t.space.xs,
    },
    sectionLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.md,
    },
    actionList: {
      gap: t.space.sm,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    // Compact announcement card used in the "What's New" strip — denser than
    // an ActionRow so 5 fit without dominating the screen.
    feedCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    // ── Pending Approvals card pack ──────────────────────────────────────
    // Row of 1-3 cards (only those with count > 0). flex:1 so widths match
    // when there are fewer than 3.
    approvalRow: {
      flexDirection: 'row',
      gap: t.space.sm,
      marginBottom: t.space.xl,
    },
    approvalCard: {
      flex: 1,
      backgroundColor: t.color.brandSubtle,
      borderRadius: t.radius.lg,
      padding: t.space.md,
      borderWidth: 1,
      borderColor: t.color.brand,
    },
    approvalValue: {
      fontSize: t.font.size.h2,
      lineHeight: t.font.lineHeight.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
    },
    approvalLabel: {
      fontSize: t.font.size.caption,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginTop: t.space.xs,
    },
    // ── Horizontal chip strips (used by both Adviser-Of and Officer-Of) ───
    officerStrip: {
      marginBottom: t.space.sm,
    },
    // Edge padding lives on the contentContainer so the first/last chips
    // align with the rest of the page padding.
    officerStripContent: {
      gap: t.space.sm,
      paddingRight: t.space.xl,
    },
    // Mini club card — same look as the Clubs list cards (white surface,
    // lg radius, soft shadow, warm border) but sized for a horizontal strip.
    // Adviser gets a brand-coloured border so the role still reads at a
    // glance; officer keeps the neutral card border.
    adviserChip: {
      width: 180,
      alignSelf: 'flex-start',
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.brand,
      ...t.shadow.card,
    },
    adviserChipName: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    officerChip: {
      width: 180,
      alignSelf: 'flex-start',
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    officerChipName: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    feedTitle: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
      marginBottom: 2,
    },
    feedMeta: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
    },
    // Upcoming-event row: date chip + text.
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.md,
      padding: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    eventDateChip: {
      width: 44,
      borderRadius: t.radius.sm,
      paddingVertical: t.space.xs,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.color.brandSubtle,
    },
    eventDateDay: {
      fontSize: t.font.size.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
    },
    eventDateMonth: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      color: t.color.brandPressed,
    },
    eventRowText: {
      flex: 1,
    },
    actionRowPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    actionRowText: {
      flex: 1,
    },
    actionLabel: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
    },
    actionHint: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      marginTop: 2,
    },
    chevron: {
      fontSize: 28,
      color: t.color.textSubtle,
      marginLeft: t.space.sm,
    },
  })
