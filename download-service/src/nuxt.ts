import { env } from './env'

function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${env.serviceSecret}`,
  }
}

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${env.nuxtUrl}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Nuxt internal API ${path} responded ${res.status}`)
  }
}

/** Fire-and-forget progress ping. Never throws. */
export async function reportProgress(
  jobId: string,
  payload: { status?: string; stage?: string; progress?: number; error?: string; errorCode?: string },
): Promise<void> {
  try {
    await post(`/api/internal/jobs/${jobId}/progress`, payload)
  } catch (err) {
    console.error('[worker] progress report failed', err)
  }
}

export async function reportComplete(
  jobId: string,
  payload: {
    id: string
    title: string
    artist: string
    duration: number
    audioKey: string
    artworkKey: string | null
    sourceUrl: string
    sourceId: string | null
  },
): Promise<void> {
  await post(`/api/internal/jobs/${jobId}/complete`, payload)
}

export async function reportFailure(jobId: string, error: string, errorCode: string): Promise<void> {
  try {
    await post(`/api/internal/jobs/${jobId}/fail`, { error, errorCode })
  } catch (err) {
    console.error('[worker] failure report failed', err)
  }
}
