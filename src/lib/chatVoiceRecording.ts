export const MAX_VOICE_RECORDING_SECONDS = 60;
export const VOICE_CANCEL_DISTANCE_PX = 88;

export function getVoiceCancelProgress(startX: number, currentX: number): number {
  if (!Number.isFinite(startX) || !Number.isFinite(currentX)) return 0;
  const distance = Math.max(0, startX - currentX);
  return Math.min(1, distance / VOICE_CANCEL_DISTANCE_PX);
}

export function formatVoiceDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const seconds = Math.floor(totalSeconds);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

export function resolveVoiceRecordingFormat(blobType: string): { mime: string; extension: string } {
  const normalized = blobType.toLowerCase();
  if (normalized.includes('mp4')) return { mime: 'audio/mp4', extension: 'm4a' };
  if (normalized.includes('ogg')) return { mime: 'audio/ogg', extension: 'ogg' };
  if (normalized.includes('aac')) return { mime: 'audio/aac', extension: 'aac' };
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return { mime: 'audio/mpeg', extension: 'mp3' };
  return { mime: 'audio/webm', extension: 'webm' };
}
