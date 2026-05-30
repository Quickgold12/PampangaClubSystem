// ─────────────────────────────────────────────────────────────────────────────
// Terms of Service screen.
//
// ⚠️ TEMPLATE — reasonable baseline terms for a school club app. Not legal
// advice; have your school administration / legal review before publishing.
// ─────────────────────────────────────────────────────────────────────────────
import LegalScreen, { LegalSection } from '@/components/common/LegalScreen'
import React from 'react'

const SCHOOL_CONTACT = 'your school administration'

const SECTIONS: LegalSection[] = [
  {
    heading: 'Acceptance',
    body: [
      'By using the Pampanga Club System ("the app") you agree to these terms. The app is provided by Pampanga High School for managing school clubs and organizations. If you do not agree, please do not use the app.',
    ],
  },
  {
    heading: 'Who may use the app',
    body: [
      'The app is for current students, club officers, advisers, and faculty coordinators of the school. Your account and role are assigned for school use only. Students who are minors use the app under school supervision.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'Keep your login details private and do not share your account. You are responsible for activity under your account. Provide accurate information (your real name and a valid email) so advisers can identify members.',
    ],
  },
  {
    heading: 'Acceptable use',
    body: [
      'When posting messages, announcements, or other content, you agree NOT to:',
      '• Harass, bully, threaten, or demean anyone',
      '• Post hateful, violent, sexual, or otherwise inappropriate content',
      '• Spam, flood, or disrupt chats',
      '• Impersonate others or misrepresent your role',
      '• Share others’ private information without permission',
      '• Attempt to bypass security or access data you are not authorized to see',
      'Follow your school’s student conduct rules at all times.',
    ],
  },
  {
    heading: 'Content and moderation',
    body: [
      'You own the content you post but grant the school permission to display it within the app for its intended purpose. Club officers, advisers, and faculty coordinators may review reported messages and remove content that violates these terms or school rules. Repeated or serious violations may be referred to school administration and can result in loss of access.',
    ],
  },
  {
    heading: 'Availability',
    body: [
      'The app is provided “as is.” The school aims to keep it available and accurate but does not guarantee uninterrupted or error-free service, and may change or suspend features.',
    ],
  },
  {
    heading: 'Changes to these terms',
    body: [
      'These terms may be updated as the app evolves. Continued use after an update means you accept the revised terms. The “Last updated” date reflects the latest version.',
    ],
  },
  {
    heading: 'Contact',
    body: ['Questions about these terms can be directed to ' + SCHOOL_CONTACT + '.'],
  },
]

export default function TermsScreen() {
  return (
    <LegalScreen
      title="Terms of Service"
      lastUpdated="May 30, 2026"
      intro="These terms cover how you may use the Pampanga Club System."
      sections={SECTIONS}
    />
  )
}
