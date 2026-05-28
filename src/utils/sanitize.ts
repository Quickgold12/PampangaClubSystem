// Input sanitization utilities

export const sanitizeText = (input: string): string => {
  return input.trim().replace(/[<>]/g, '')
}

export const sanitizeEmail = (email: string): string => {
  return email.trim().toLowerCase().replace(/[<>]/g, '')
}