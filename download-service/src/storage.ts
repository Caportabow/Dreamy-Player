import { Client } from 'minio'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { env } from './env'

export const minio = new Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: env.minio.useSSL,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
  region: env.minio.region,
})

export async function ensureBuckets(): Promise<void> {
  for (const bucket of [env.buckets.audio, env.buckets.artwork]) {
    try {
      const exists = await minio.bucketExists(bucket)
      if (!exists) await minio.makeBucket(bucket, env.minio.region)
    } catch (err) {
      console.error('[worker] bucket check failed for', bucket, err)
    }
  }
}

export async function uploadFile(
  bucket: string,
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const info = await stat(filePath)
  await minio.putObject(bucket, key, createReadStream(filePath), info.size, {
    'Content-Type': contentType,
  })
}
