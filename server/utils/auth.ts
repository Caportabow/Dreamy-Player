import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db } from '../db'
import { sessions, users } from '../db/schema'
import { env } from './env'

export const SESSION_COOKIE = 'dreamy_session'

export interface AuthUser {
  id: string
  email: string
  profile: {
    displayName: string | null
    avatarKey: string | null
  } | null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function signToken(token: string): string {
  return createHmac('sha256', env.sessionSecret).update(token).digest('base64url')
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db.insert(sessions).values({
    id: randomUUID(),
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + env.sessionTtlDays * 86_400_000),
  })
  return token
}

export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, SESSION_COOKIE, `${token}.${signToken(token)}`, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionTtlDays * 86_400,
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

function readSessionToken(event: H3Event): string | null {
  const raw = getCookie(event, SESSION_COOKIE)
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const token = raw.slice(0, dot)
  const signature = raw.slice(dot + 1)
  if (!token || !signature || signToken(token) !== signature) return null
  return token
}

/** Resolve the signed-in user, or null for guests. Never throws. */
export async function resolveUser(event: H3Event): Promise<AuthUser | null> {
  const token = readSessionToken(event)
  if (!token) return null

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())),
    with: { user: { with: { profile: true } } },
  })
  if (!session || !session.user) return null

  return {
    id: session.user.id,
    email: session.user.email,
    profile: session.user.profile
      ? { displayName: session.user.profile.displayName, avatarKey: session.user.profile.avatarKey }
      : null,
  }
}

/** Resolve the signed-in user or throw a 401. */
export async function getCurrentUser(event: H3Event): Promise<AuthUser> {
  const user = await resolveUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not signed in',
      message: 'Please sign in to keep your favourites, playlists, and listening story close.',
    })
  }
  return user
}

export async function destroySession(event: H3Event): Promise<void> {
  const token = readSessionToken(event)
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  }
  clearSessionCookie(event)
}

/** Convenience for handlers that want the current user's id. */
export async function getCurrentUserId(event: H3Event): Promise<string> {
  const user = await getCurrentUser(event)
  return user.id
}
