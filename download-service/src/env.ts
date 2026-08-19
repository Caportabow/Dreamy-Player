const str = (v: string | undefined, fallback: string): string =>
  v && v.trim().length > 0 ? v.trim() : fallback

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export const env = {
  port: num(process.env.PORT, 8787),
  serviceSecret: str(process.env.DOWNLOAD_SERVICE_SECRET, ''),
  /** Base URL of the Nuxt application (its internal job API). */
  nuxtUrl: str(process.env.DOWNLOAD_SERVICE_URL, 'http://localhost:3000').replace(/\/$/, ''),
  maxDuration: 600,
  tempDir: str(process.env.WORKER_TMP_DIR, '/tmp/dreamy-downloads'),
  minio: {
    endpoint: str(process.env.MINIO_ENDPOINT, 'localhost'),
    port: num(process.env.MINIO_PORT, 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: str(process.env.MINIO_ACCESS_KEY, 'minioadmin'),
    secretKey: str(process.env.MINIO_SECRET_KEY, 'minioadmin'),
    region: str(process.env.MINIO_REGION, 'us-east-1'),
  },
  buckets: {
    audio: str(process.env.MINIO_AUDIO_BUCKET, 'audio'),
    artwork: str(process.env.MINIO_ARTWORK_BUCKET, 'artwork'),
  },
}
