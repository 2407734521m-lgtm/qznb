const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
};

const SUPPORTED_CHAT_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',
]);

/** Normalize Android document-provider MIME fallbacks using a conservative extension allow-list. */
export function resolveChatVideoMime(file: Pick<File, 'type' | 'name'>): string | null {
  if (SUPPORTED_CHAT_VIDEO_MIMES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_MIME_BY_EXTENSION[extension] ?? null;
}

/** Detect likely video files so unsupported video codecs receive an explicit error, not a generic document card. */
export function isChatVideoFile(file: Pick<File, 'type' | 'name'>): boolean {
  return file.type.startsWith('video/')
    || Boolean(VIDEO_MIME_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? '']);
}

/** Create a small local JPEG poster without decoding the video again on each chat open. */
export async function createChatVideoPoster(file: File): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('poster timeout')), 8000);
      const cleanup = () => window.clearTimeout(timeout);
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          cleanup();
          reject(new Error('video duration unavailable'));
          return;
        }
        const seekTo = Math.min(0.8, video.duration * 0.08);
        if (seekTo < 0.05) {
          cleanup();
          resolve();
          return;
        }
        video.currentTime = seekTo;
      };
      video.onseeked = () => { cleanup(); resolve(); };
      video.onerror = () => { cleanup(); reject(new Error('video poster decode failed')); };
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const scale = Math.min(1, 640 / width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.76));
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
