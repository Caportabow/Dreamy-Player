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

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 32

export function validateUsername(username: string): string | null {
  if (
    typeof username !== 'string' ||
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH
  ) {
    return `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters.`
  }
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(username)) {
    return 'Username can only contain letters, numbers, dots, dashes, and underscores.'
  }
  return null
}
