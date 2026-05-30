// ─────────────────────────────────────────────────────────────────────────────
// useChatUnread — total number of unread chat messages across all the user's
// clubs, kept live for the bottom-tab Chat badge.
//
// Reactive on both edges:
//   • A new message from someone else (messages INSERT via Realtime) → refetch
//     → badge goes up.
//   • The user reads a chat (markChatRead upserts chat_reads, which is in the
//     realtime publication per schema_v22) → refetch → badge goes down.
//   • App returns to the foreground (AppState) → refetch, in case events were
//     missed while backgrounded.
//
// The count itself comes from countUnreadByClubForUser, which already excludes
// the user's own messages, so this never counts something you sent yourself.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { countUnreadByClubForUser } from '@/services/chat.service'
import { supabase } from '@/services/supabase'
import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

export function useChatUnread(): number {
  const { user } = useAuth()
  const [total, setTotal] = useState(0)

  const refresh = useCallback(async () => {
    if (!user) {
      setTotal(0)
      return
    }
    const { data } = await countUnreadByClubForUser(user.id)
    if (data) {
      let sum = 0
      data.forEach((n) => (sum += n))
      setTotal(sum)
    }
  }, [user])

  // Initial fetch + whenever the user changes.
  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime: new messages (from others) bump the count; our own chat_reads
  // changes (mark-as-read) drop it. Both just trigger a recompute.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('chat-unread-total')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          // Ignore our own sends — they never count as unread anyway.
          const row = payload.new as { author_id?: string }
          if (row.author_id === user.id) return
          refresh()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_reads',
          filter: `user_id=eq.${user.id}`,
        },
        () => refresh()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, refresh])

  // Recompute when the app comes back to the foreground (Realtime can miss
  // events while backgrounded).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  return total
}
