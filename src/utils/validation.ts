// Input validation utilities

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const validateEmail = (email: string): string | null => {
  if (!email) return 'Email is required.'
  if (!EMAIL_REGEX.test(email)) return 'Please enter a valid email address.'
  return null
}

export const validatePassword = (password: string, minLength = 8): string | null => {
  if (!password) return 'Password is required.'
  if (password.length < minLength) return `Password must be at least ${minLength} characters.`
  return null
}

export const validateFullName = (name: string): string | null => {
  if (!name) return 'Full name is required.'
  if (name.length < 2) return 'Please enter your full name.'
  return null
}

export const validatePasswordMatch = (password: string, confirmPassword: string): string | null => {
  if (password !== confirmPassword) return 'Passwords do not match.'
  return null
}

export const validateRole = (role: string): string | null => {
  if (!role) return 'Please select your role.'
  return null
}