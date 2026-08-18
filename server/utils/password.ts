import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export const PASSWORD_MIN_LENGTH = 8

export function validatePassword(plain: string): string | null {
  if (typeof plain !== 'string' || plain.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (plain.length > 200) return 'Password is too long.'
  return null
}

export function validateEmail(email: string): string | null {
  if (typeof email !== 'string' || email.length > 254) return 'Please enter a valid email address.'
  const trimmed = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return 'Please enter a valid email address.'
  return null
}
