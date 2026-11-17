import { stripChatBubbleEffect } from './chatMessageEffect';

export type ChatForwardMediaKind = 'image' | 'audio' | 'video' | 'file';

export type ChatForwardAttachmentPlan = {
  kind: ChatForwardMediaKind;
  sourcePaths: string[];
  fileName?: string;
  fileSize?: number;
  buildBody: (destinationPaths: string[]) => string;
};

function assertSourcePath(path: string, sourceConversationId: number) {
  const parts = path.split('/');
  if (
    parts.length !== 3
    || parts[0] !== String(sourceConversationId)
    || !parts[1]
    || !parts[2]
    || parts.some(part => part === '.' || part === '..')
    || path.includes('\\')
  ) {
    throw new Error('媒体路径与原会话不匹配，无法安全转发。');
  }
}

function requireDestinationPaths(paths: string[], count: number) {
  if (paths.length !== count || paths.some(path => {
    const parts = path.split('/');
    return parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]
      || parts.some(part => part === '.' || part === '..')
      || path.includes('\\');
  })) {
    throw new Error('媒体复制不完整，请重试。');
  }
}

/** Parse the existing chat-media message markers into a safe copy plan. */
export function createChatForwardAttachmentPlan(
  originalBody: string,
  sourceConversationId: number,
): ChatForwardAttachmentPlan | null {
  const body = stripChatBubbleEffect(originalBody);

  const image = /^\[\[im-image:([^\]]+)\]\]$/.exec(body);
  if (image) {
    const sourcePath = image[1];
    assertSourcePath(sourcePath, sourceConversationId);
    return {
      kind: 'image',
      sourcePaths: [sourcePath],
      buildBody: paths => {
        requireDestinationPaths(paths, 1);
        return `[[im-image:${paths[0]}]]`;
      },
    };
  }

  const audio = /^\[\[im-audio:([^\]]+)\]\]$/.exec(body);
  if (audio) {
    const sourcePath = audio[1];
    assertSourcePath(sourcePath, sourceConversationId);
    return {
      kind: 'audio',
      sourcePaths: [sourcePath],
      buildBody: paths => {
        requireDestinationPaths(paths, 1);
        return `[[im-audio:${paths[0]}]]`;
      },
    };
  }

  const video = /^\[\[im-video:([^|\]]+)(?:\|([^\]]*))?\]\]$/.exec(body);
  if (video) {
    const sourcePaths = [video[1], ...(video[2] ? [video[2]] : [])];
    sourcePaths.forEach(path => assertSourcePath(path, sourceConversationId));
    return {
      kind: 'video',
      sourcePaths,
      buildBody: paths => {
        requireDestinationPaths(paths, sourcePaths.length);
        return `[[im-video:${paths[0]}${paths[1] ? `|${paths[1]}` : ''}]]`;
      },
    };
  }

  const file = /^\[\[im-file:([^|\]]+)\|([^|\]]{1,80})\|(\d+)\]\]$/.exec(body);
  if (file) {
    const sourcePath = file[1];
    const fileName = file[2];
    const fileSize = Number(file[3]);
    assertSourcePath(sourcePath, sourceConversationId);
    return {
      kind: 'file',
      sourcePaths: [sourcePath],
      fileName,
      fileSize,
      buildBody: paths => {
        requireDestinationPaths(paths, 1);
        return `[[im-file:${paths[0]}|${fileName}|${file[3]}]]`;
      },
    };
  }

  if (/^\[\[im-(?:image|audio|video|file):/.test(body)) {
    throw new Error('这条媒体消息格式不完整，暂时无法转发。');
  }
  return null;
}
