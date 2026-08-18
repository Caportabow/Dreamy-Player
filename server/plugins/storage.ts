import { ensureBuckets } from '../storage/minio'

export default defineNitroPlugin(async () => {
  try {
    await ensureBuckets()
  } catch (err) {
    console.error('[storage] Failed to initialise MinIO buckets:', err)
  }
})
