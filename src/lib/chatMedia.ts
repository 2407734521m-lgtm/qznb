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
