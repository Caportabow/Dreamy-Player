const str = (v: string | undefined, fallback: string): string =>
  v && v.trim().length > 0 ? v.trim() : fallback

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const bool = (v: string | undefined, fallback = false): boolean =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())

export const env = {
  databaseUrl: str(process.env.DATABASE_URL, 'postgres://dreamy:dreamy@localhost:5432/dreamy'),
  sessionSecret: str(process.env.SESSION_SECRET, 'dev-session-secret-change-me'),
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 30),
  minio: {
    endpoint: str(process.env.MINIO_ENDPOINT, 'localhost'),
    port: num(process.env.MINIO_PORT, 9000),
    useSSL: bool(process.env.MINIO_USE_SSL),
    accessKey: str(process.env.MINIO_ACCESS_KEY, 'minioadmin'),
    secretKey: str(process.env.MINIO_SECRET_KEY, 'minioadmin'),
    region: str(process.env.MINIO_REGION, 'us-east-1'),
  },
  buckets: {
    audio: str(process.env.MINIO_AUDIO_BUCKET, 'audio'),
    artwork: str(process.env.MINIO_ARTWORK_BUCKET, 'artwork'),
    avatars: str(process.env.MINIO_AVATARS_BUCKET, 'avatars'),
  },
  downloadServiceUrl: str(process.env.DOWNLOAD_SERVICE_URL, 'http://localhost:8787'),
  downloadServiceSecret: str(process.env.DOWNLOAD_SERVICE_SECRET, 'dev-download-secret'),
  isProduction: process.env.NODE_ENV === 'production',
}
