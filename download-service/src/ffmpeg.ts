import { execFile, spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export class FfmpegError extends Error {
  code = 'conversion_failure'
  constructor(message: string) {
    super(message)
  }
}

/** Target integrated loudness (EBU R128) — matches streaming-platform norms
 * so every track in the library plays back at the same perceived volume. */
const TARGET_LOUDNESS_LUFS = -14
/** Leave headroom so normalization never clips. */
const TARGET_TRUE_PEAK_DBTP = -1.5
/** Target loudness range (music content per EBU R128). */
const TARGET_LRA = 11

/** Audio quieter than this is treated as silence and trimmed from the very
 * start of a track (-50 dB ≈ digital silence; quiet intros survive). */
const SILENCE_THRESHOLD_DB = -50
/** Keep a hair of silence so playback never starts on a hard sample edge. */
const LEADING_PAD_S = 0.05

/**
 * Trim leading silence only. ffmpeg's silenceremove stop-detection is
 * unreliable: stop_periods trims everything after the FIRST brief gap that
 * meets stop_duration — real music is full of sub-second dips (breaths,
 * pauses), so a 272s track collapsed to ~3s with stop_duration=0.01. The
 * start detection is fine, so it is kept; trailing silence is harmless and
 * stays. Muted/partial downloads are instead caught by the audio-end check
 * below (silencedetect-based), which is reliable.
 */
const SILENCE_REMOVE_FILTER =
  `silenceremove=start_periods=1:start_duration=0.01:start_threshold=${SILENCE_THRESHOLD_DB}dB:start_silence=${LEADING_PAD_S}`

/** A source quieter than this is effectively silence — a broken download
 * (YouTube occasionally serves a muted/partial stream). Converting it would
 * produce an empty track, so the job fails with a retryable message instead. */
const SILENT_LOUDNESS_FLOOR_LUFS = -60
/** A track's audible audio must extend at least this far into the source
 * (silence at the very end is normal). A stream whose audio stops far
 * earlier — a muted/partial download — is rejected instead of saved as a
 * stub. Also the lower bound for a converted track's duration. */
const MIN_OUTPUT_FRACTION = 0.2

/** Measured loudness from the probe pass, fed back into the encode pass so
 * loudnorm applies a single linear gain instead of dynamic compression. */
interface LoudnessMeasure {
  inputI: number
  inputTp: number
  inputLra: number
  inputThresh: number
  targetOffset: number
}

function loudnormFilter(measure?: LoudnessMeasure): string {
  const base = `loudnorm=I=${TARGET_LOUDNESS_LUFS}:TP=${TARGET_TRUE_PEAK_DBTP}:LRA=${TARGET_LRA}`
  if (!measure) return `${base}:print_format=json`
  return (
    `${base}:measured_I=${measure.inputI}:measured_TP=${measure.inputTp}` +
    `:measured_LRA=${measure.inputLra}:measured_thresh=${measure.inputThresh}` +
    `:offset=${measure.targetOffset}:linear=true:print_format=summary`
  )
}

/** Timestamp (seconds) where the final silence run begins — i.e. where the
 * audible part of the track ends. Null when the track ends on audio (or
 * detection fails). Uses silencedetect, whose silence map is reliable,
 * unlike silenceremove's own stop-detection. */
function parseLastSilenceStart(stderr: string): number | null {
  let last: number | null = null
  for (const match of stderr.matchAll(/silence_start:\s*([\d.]+)/g)) {
    const t = Number(match[1])
    if (Number.isFinite(t)) last = t
  }
  return last
}

/** Pull the loudnorm JSON block out of ffmpeg's stderr log. */
function parseLoudnormJson(stderr: string): LoudnessMeasure | null {
  const start = stderr.indexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const raw = JSON.parse(stderr.slice(start, end + 1)) as Record<string, unknown>
    const num = (value: unknown): number | null => {
      const n = typeof value === 'string' ? Number(value) : NaN
      return Number.isFinite(n) ? n : null
    }
    const inputI = num(raw.input_i)
    const inputTp = num(raw.input_tp)
    const inputLra = num(raw.input_lra)
    const inputThresh = num(raw.input_thresh)
    const targetOffset = num(raw.target_offset)
    if (
      inputI === null ||
      inputTp === null ||
      inputLra === null ||
      inputThresh === null ||
      targetOffset === null
    ) {
      return null
    }
    return { inputI, inputTp, inputLra, inputThresh, targetOffset }
  } catch {
    return null
  }
}

/** Probe an audio file's duration in seconds; null when unreadable. */
async function probeDuration(input: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input],
      { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
    )
    const duration = Number(stdout.trim())
    return Number.isFinite(duration) && duration > 0 ? duration : null
  } catch {
    return null
  }
}

/**
 * Convert any audio file to MP3 (V2 quality ≈ 190 kbps, plenty for music),
 * normalizing the volume and trimming the leading silence first so every
 * track in the library plays at a consistent level and starts on audio.
 *
 * Normalization is two-pass EBU R128: a quick probe pass measures the track's
 * loudness, then the encode pass applies that exact linear gain — dynamics are
 * preserved, unlike single-pass dynamic loudnorm. If the probe fails on an
 * unusual file, the track is still converted with silence trimming only.
 *
 * A silent or empty source (YouTube occasionally serves a muted/partial
 * stream) is a failed download, not a track — it throws a clear, retryable
 * error instead of saving a stub that would end playback almost immediately.
 */
export async function toMp3(
  input: string,
  output: string,
  meta: { title: string; artist: string; album?: string },
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const sourceDuration = await probeDuration(input)
  const inputSize = await stat(input).then((s) => s.size).catch(() => null)

  // Pass 1: map the track's silence (silencedetect, on the raw signal) and
  // measure loudness after the leading-silence trim. Best-effort.
  let measure: LoudnessMeasure | null = null
  let lastSilenceStart: number | null = null
  try {
    const probe = await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i', input,
        '-vn',
        '-af',
        `silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:d=0.01,${SILENCE_REMOVE_FILTER},${loudnormFilter()}`,
        '-f', 'null',
        '-',
      ],
      { timeout: 240_000, maxBuffer: 16 * 1024 * 1024 },
    )
    measure = parseLoudnormJson(probe.stderr)
    lastSilenceStart = parseLastSilenceStart(probe.stderr)
    // The probe pass decoded the whole track; the encode pass is the longer
    // half and drives the remaining fraction via ffmpeg's progress output.
    onProgress?.(0.35)
  } catch {
    measure = null
    onProgress?.(0.4)
  }

  // The loudness measurement itself is the silence detector: a real track
  // lands far above this floor, a muted/empty stream never does.
  if (measure && measure.inputI < SILENT_LOUDNESS_FLOOR_LUFS) {
    console.error('[worker] silent source detected — refusing to convert', {
      sourceDuration,
      inputI: measure.inputI,
      inputSize,
    })
    throw new FfmpegError(
      'The downloaded audio is silent — please try downloading this track again.',
    )
  }

  // Muted/partial streams (YouTube serves them for claim-restricted videos)
  // carry a few seconds of real audio followed by silence. A real track's
  // audio runs to the (near) end, so an early audio-end means a broken
  // download — fail instead of saving a stub.
  const audioEnd = lastSilenceStart ?? sourceDuration
  if (
    sourceDuration !== null &&
    audioEnd !== null &&
    audioEnd < MIN_OUTPUT_FRACTION * sourceDuration
  ) {
    console.error('[worker] audio ends far before the source end — muted/partial download', {
      sourceDuration,
      audioEnd,
      measuredLoudness: measure?.inputI ?? null,
      inputSize,
    })
    throw new FfmpegError(
      'The downloaded audio is silent or unreadable — please try downloading this track again.',
    )
  }

  // Pass 2: encode with the exact gain (or silence-trim only if unmeasured).
  const metadataArgs = [
    '-metadata', `title=${meta.title.slice(0, 200)}`,
    '-metadata', `artist=${meta.artist.slice(0, 200)}`,
  ]
  if (meta.album) metadataArgs.push('-metadata', `album=${meta.album.slice(0, 200)}`)

  const runEncode = (filter: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = spawn(
        'ffmpeg',
        [
          '-y',
          '-i', input,
          '-vn',
          '-af', filter,
          '-acodec', 'libmp3lame',
          '-q:a', '2',
          '-id3v2_version', '3',
          ...metadataArgs,
          '-nostats',
          '-loglevel', 'error',
          // Machine-readable progress on stdout: out_time_us/out_time_ms are
          // microseconds. Drives the download card's bar through conversion
          // instead of sitting still.
          '-progress', 'pipe:1',
          output,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stderr = ''
      let lineBuffer = ''
      let lastFraction = 0
      let lastEmit = 0
      let timedOut = false
      const killTimer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, 240_000)
      killTimer.unref?.()

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        lineBuffer += chunk
        let nl: number
        while ((nl = lineBuffer.indexOf('\n')) !== -1) {
          const line = lineBuffer.slice(0, nl).trim()
          lineBuffer = lineBuffer.slice(nl + 1)
          const m = /^out_time_(?:us|ms)=(\d+)$/.exec(line)
          if (m && sourceDuration && sourceDuration > 0) {
            const seconds = Number(m[1]) / 1e6
            const fraction = Math.min(0.4 + 0.6 * (seconds / sourceDuration), 1)
            const now = Date.now()
            // Report on meaningful deltas (or a slow trickle), monotonically.
            if (fraction > lastFraction && (fraction - lastFraction >= 0.01 || now - lastEmit >= 1500)) {
              lastFraction = fraction
              lastEmit = now
              onProgress?.(fraction)
            }
          }
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-16384)
      })
      child.on('error', (err) => {
        clearTimeout(killTimer)
        reject(err)
      })
      child.on('close', (code) => {
        clearTimeout(killTimer)
        if (timedOut) {
          reject(Object.assign(new Error('ffmpeg encode timed out.'), { stderr }))
        } else if (code === 0) {
          resolve()
        } else {
          reject(Object.assign(new Error(`ffmpeg exited with code ${code}`), { stderr }))
        }
      })
    })

  try {
    await runEncode(
      measure ? `${SILENCE_REMOVE_FILTER},${loudnormFilter(measure)}` : SILENCE_REMOVE_FILTER,
    )
  } catch (err: any) {
    // Loudness normalization shouldn't be the reason a track is lost — if the
    // loudnorm pass fails on an unusual file, convert with trimming only.
    if (!measure) {
      throw new FfmpegError('FFmpeg conversion failed: ' + (err?.stderr || err?.message || '').slice(0, 300))
    }
    try {
      await runEncode(SILENCE_REMOVE_FILTER)
    } catch (trimErr: any) {
      throw new FfmpegError(
        'FFmpeg conversion failed: ' + (trimErr?.stderr || trimErr?.message || '').slice(0, 300),
      )
    }
  }

  // Safety net: a conversion that kept almost none of the source — or produced
  // something even ffprobe can't read — means the download itself was empty or
  // broken. (Muted/partial streams are already rejected earlier by the
  // audio-end check; this catches anything that slipped through.)
  const outputDuration = await probeDuration(output)
  const outputIsStub =
    outputDuration === null ||
    (sourceDuration !== null && outputDuration < MIN_OUTPUT_FRACTION * sourceDuration)
  if (outputIsStub) {
    // Diagnostic breadcrumb: a big readable source whose measurement was
    // normal (or never captured) points at a pipeline bug, while a tiny or
    // -inf measurement on a large file means YouTube served a muted stream.
    const outputSize = await stat(output).then((s) => s.size).catch(() => null)
    console.error('[worker] conversion produced a stub — download is broken', {
      sourceDuration,
      outputDuration,
      measuredLoudness: measure?.inputI ?? null,
      inputSize,
      outputSize,
    })
    throw new FfmpegError(
      'The downloaded audio is silent or unreadable — please try downloading this track again.',
    )
  }
}

/** Downscale a thumbnail to a square WebP. Returns false on failure (artwork is optional). */
export async function toWebpSquare(input: string, output: string): Promise<boolean> {
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i', input,
        '-vf', 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512',
        '-q:v', '4',
        output,
      ],
      { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
    )
    return true
  } catch {
    return false
  }
}
