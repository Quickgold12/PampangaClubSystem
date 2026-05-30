// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy screen.
//
// ⚠️ TEMPLATE — this content describes how the app ACTUALLY handles data based
// on its schema, but it is not legal advice. Before publishing (especially for
// a school with minors, where COPPA / local data-protection rules and Google
// Play's "Data Safety" section apply), have your school administration / legal
// review and adjust it, and fill in a real contact email below.
// ─────────────────────────────────────────────────────────────────────────────
import LegalScreen, { LegalSection } from '@/components/common/LegalScreen'
import React from 'react'

const SCHOOL_CONTACT = 'your school administration'

const SECTIONS: LegalSection[] = [
  {
    heading: 'Who this is for',
    body: [
      'The Pampanga Club System ("the app") is provided for students, club officers, advisers, and faculty coordinators of Pampanga High School to manage school organizations.',
      'Because students may be minors, the app is intended to be used under the school’s supervision. The school is the data controller; questions should be directed to ' +
        SCHOOL_CONTACT +
        '.',
    ],
  },
  {
    heading: 'Information we collect',
    body: [
      'Account information you provide at sign-up:',
      '• Your full name',
      '• Your email address',
      '• Your role (student, officer, adviser, or faculty coordinator)',
      '• Your password (stored securely by our authentication provider; we never see it in plain text)',
      'Information created as you use the app:',
      '• Club memberships and your role within each club',
      '• Join requests you submit and their status',
      '• Chat messages you send in club group chats',
      '• Announcements, events, and attendance records',
      '• Club finances, dues, and budget entries (for officers/advisers)',
      '• An optional profile photo and club cover images you upload',
      '• A device push-notification token, if you allow notifications',
      '• Timestamps of when you last read a club’s chat or announcements',
    ],
  },
  {
    heading: 'How we use it',
    body: [
      'Your information is used only to operate the club system: to show clubs and members, route join requests, deliver chat and announcements, send notifications you opted into, and let advisers manage their clubs.',
      'We do not sell your information, show third-party advertising, or use your data for profiling.',
    ],
  },
  {
    heading: 'Who can see your information',
    body: [
      'Access is limited by your role using database security rules:',
      '• Other signed-in users can see your name, role, profile photo, and the clubs you belong to.',
      '• Members of a club can see chat messages and announcements in that club.',
      '• Officers, advisers, and faculty coordinators can see additional club data (members, attendance, finances, reported messages) for the clubs they manage.',
      'Your email address is not shown on your public profile.',
    ],
  },
  {
    heading: 'Where your data is stored',
    body: [
      'Data is stored in the school’s Supabase project (a hosted PostgreSQL database with file storage). Access is protected by row-level security rules and authentication.',
    ],
  },
  {
    heading: 'Notifications',
    body: [
      'If you allow notifications, we store a push token for your device so we can alert you to new chat messages and announcements. You can turn notifications off at any time in your device settings; doing so stops new alerts.',
    ],
  },
  {
    heading: 'Content moderation',
    body: [
      'Chat messages can be reported by members and reviewed by club officers and advisers, who may remove messages that violate school rules. Reports include the reported message and who reported it, visible only to the club’s moderators.',
    ],
  },
  {
    heading: 'Data retention and deletion',
    body: [
      'Your information is kept while your account is active. If your account is removed by the school, your profile and the personal records tied to it are deleted; some content you posted may be retained in a club’s history without your name attached.',
      'To request access to, correction of, or deletion of your information, contact ' +
        SCHOOL_CONTACT +
        '.',
    ],
  },
  {
    heading: 'Changes to this policy',
    body: [
      'We may update this policy as the app changes. Material changes will be reflected here with a new “Last updated” date.',
    ],
  },
]

export default function PrivacyPolicyScreen() {
  return (
    <LegalScreen
      title="Privacy Policy"
      lastUpdated="May 30, 2026"
      intro="This policy explains what information the Pampanga Club System collects, how it is used, and who can see it."
      sections={SECTIONS}
    />
  )
}
