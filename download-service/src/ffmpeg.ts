import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export class FfmpegError extends Error {
  code = 'conversion_failure'
  constructor(message: string) {
    super(message)
  }
}

/** Convert any audio file to MP3 (V2 quality ≈ 190 kbps, plenty for music). */
export async function toMp3(
  input: string,
  output: string,
  meta: { title: string; artist: string; album?: string },
): Promise<void> {
  const args = [
    '-y',
    '-i', input,
    '-vn',
    '-acodec', 'libmp3lame',
    '-q:a', '2',
    '-id3v2_version', '3',
    '-metadata', `title=${meta.title.slice(0, 200)}`,
    '-metadata', `artist=${meta.artist.slice(0, 200)}`,
  ]
  if (meta.album) args.push('-metadata', `album=${meta.album.slice(0, 200)}`)
  args.push(output)
  try {
    await execFileAsync('ffmpeg', args, { timeout: 240_000, maxBuffer: 16 * 1024 * 1024 })
  } catch (err: any) {
    throw new FfmpegError('FFmpeg conversion failed: ' + (err?.stderr || err?.message || '').slice(0, 300))
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
