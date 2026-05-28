// ─────────────────────────────────────────────────────────────────────────────
// Storage service — image picking + upload to Supabase Storage.
//
// Handles two image kinds, both via the same pipeline:
//   • Club cover images → bucket 'club-images', path '<orgId>/cover.<ext>'
//   • User avatars      → bucket 'avatars',     path '<userId>/avatar.<ext>'
//
// Flow:
//   1. pickImage(aspect)   → opens the library, returns a base64 image
//   2. uploadClubImage()   → club cover → public URL for organizations.image_url
//      uploadAvatar()      → avatar     → public URL for users.avatar_url
//
// Why base64 (not a Blob): in React Native, fetching a local file URI into a
// Blob is unreliable across platforms. expo-image-picker can hand us base64
// directly, which we decode to an ArrayBuffer that the Supabase client uploads
// cleanly. (base64-arraybuffer is a tiny, dependency-free decoder.)
//
// Uploads use a stable path + upsert, so re-uploading overwrites the previous
// file in place instead of piling up orphans.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { decode } from 'base64-arraybuffer'
import * as ImagePicker from 'expo-image-picker'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

const CLUB_BUCKET = 'club-images'
const AVATAR_BUCKET = 'avatars'
const RECEIPT_BUCKET = 'receipts'

// The shape we hand back from the picker — just what the uploader needs.
export type PickedImage = {
  base64: string
  // e.g. 'image/jpeg' — used as the upload contentType and to derive the ext.
  mimeType: string
}

// ── Pick an image from the device library ───────────────────────────────────
// `aspect` controls the crop frame: [16,9] for club covers, [1,1] for square
// avatars. Returns null (not an error) when the user cancels — the caller
// treats that as "do nothing". A denied permission is a real error.
export const pickImage = async (
  aspect: [number, number] = [16, 9]
): Promise<Result<PickedImage | null>> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    return fail('Photo library permission is needed to choose an image.')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.7, // compress a little so uploads stay small
    base64: true, // we need the bytes, see file header
  })

  if (result.canceled) return ok(null)

  const asset = result.assets[0]
  if (!asset.base64) return fail('Could not read the selected image.')

  return ok({
    base64: asset.base64,
    mimeType: asset.mimeType ?? 'image/jpeg',
  })
}

// ── Internal: upload bytes to a bucket + return a cache-busted public URL ───
// Shared by both club-cover and avatar uploads. The `?v=timestamp` suffix
// forces clients to re-fetch after an overwrite instead of serving a stale
// cached image from the stable path.
const uploadToBucket = async (
  bucket: string,
  path: string,
  image: PickedImage
): Promise<Result<{ publicUrl: string }>> => {
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, decode(image.base64), {
      contentType: image.mimeType,
      upsert: true,
    })

  if (uploadError) return fail(uploadError.message)

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return ok({ publicUrl: `${data.publicUrl}?v=${Date.now()}` })
}

// ── Upload a club cover image ───────────────────────────────────────────────
// Stores at '<orgId>/cover.<ext>'. Caller persists the URL via clubs.updateClub.
export const uploadClubImage = async (
  orgId: string,
  image: PickedImage
): Promise<Result<{ publicUrl: string }>> => {
  const ext = image.mimeType.split('/')[1] ?? 'jpg'
  return uploadToBucket(CLUB_BUCKET, `${orgId}/cover.${ext}`, image)
}

// ── Upload a user avatar ────────────────────────────────────────────────────
// Stores at '<userId>/avatar.<ext>'. Caller persists the URL via
// auth.updateProfile({ avatar_url }).
export const uploadAvatar = async (
  userId: string,
  image: PickedImage
): Promise<Result<{ publicUrl: string }>> => {
  const ext = image.mimeType.split('/')[1] ?? 'jpg'
  return uploadToBucket(AVATAR_BUCKET, `${userId}/avatar.${ext}`, image)
}

// ── Upload a receipt photo ──────────────────────────────────────────────────
// Receipts aren't a single per-row file (a club has many), so we use a unique
// filename per upload instead of a stable path. Caller saves the URL on the
// financial_records row's receipt_url.
export const uploadReceipt = async (
  orgId: string,
  image: PickedImage
): Promise<Result<{ publicUrl: string }>> => {
  const ext = image.mimeType.split('/')[1] ?? 'jpg'
  // Unique name so multiple receipts in the same club never collide.
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  return uploadToBucket(RECEIPT_BUCKET, `${orgId}/${filename}`, image)
}
