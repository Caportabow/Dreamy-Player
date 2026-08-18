import { Client } from 'minio'
import type { Readable } from 'node:stream'
import { env } from '../utils/env'

export const minio = new Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: env.minio.useSSL,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
  region: env.minio.region,
})

const BUCKETS = [env.buckets.audio, env.buckets.artwork, env.buckets.avatars] as const

/** Create the logical buckets on startup if they are missing. */
export async function ensureBuckets(): Promise<void> {
  for (const bucket of BUCKETS) {
    try {
      const exists = await minio.bucketExists(bucket)
      if (!exists) await minio.makeBucket(bucket, env.minio.region)
    } catch {
      // Non-fatal during startup; requests will surface real errors.
    }
  }
}

export const storageKeys = {
  audio(trackId: string): string {
    return `audio/${trackId}/track.mp3`
  },
  artwork(trackId: string): string {
    return `artwork/${trackId}/cover.webp`
  },
  avatar(userId: string, ext: string): string {
    return `avatars/${userId}/avatar.${ext.replace(/^\./, '')}`
  },
}

export function bucketForKey(key: string): string | null {
  const prefix = key.split('/')[0]
  if (prefix === env.buckets.audio) return env.buckets.audio
  if (prefix === env.buckets.artwork) return env.buckets.artwork
  if (prefix === env.buckets.avatars) return env.buckets.avatars
  return null
}

export async function putObject(
  bucket: string,
  key: string,
  data: Buffer | Readable,
  contentType: string,
): Promise<void> {
  await minio.putObject(bucket, key, data, undefined, { 'Content-Type': contentType })
}

export async function getObjectStream(bucket: string, key: string): Promise<Readable | null> {
  try {
    return (await minio.getObject(bucket, key)) as Readable
  } catch (err: any) {
    if (err?.code === 'NoSuchKey' || err?.code === 'NotFound') return null
    throw err
  }
}

export async function statObject(bucket: string, key: string) {
  try {
    return await minio.statObject(bucket, key)
  } catch (err: any) {
    if (err?.code === 'NoSuchKey' || err?.code === 'NotFound') return null
    throw err
  }
}

export async function removeObject(bucket: string, key: string): Promise<void> {
  await minio.removeObject(bucket, key)
}
