import { describe, expect, it } from 'vitest';
import { createChatForwardAttachmentPlan } from './chatForwarding';

describe('chat message forwarding media plans', () => {
  it('copies an image to a new conversation path', () => {
    const plan = createChatForwardAttachmentPlan('[[im-image:42/user-a/photo.webp]]', 42);
    expect(plan?.kind).toBe('image');
    expect(plan?.sourcePaths).toEqual(['42/user-a/photo.webp']);
    expect(plan?.buildBody(['81/user-b/forwarded.webp'])).toBe('[[im-image:81/user-b/forwarded.webp]]');
  });

  it('keeps the voice message marker while replacing its storage path', () => {
    const plan = createChatForwardAttachmentPlan('[[im-audio:42/user-a/voice.m4a]]', 42);
    expect(plan?.kind).toBe('audio');
    expect(plan?.buildBody(['81/user-b/voice.m4a'])).toBe('[[im-audio:81/user-b/voice.m4a]]');
  });

  it('copies both video and poster assets', () => {
    const plan = createChatForwardAttachmentPlan('[[im-video:42/user-a/clip.mp4|42/user-a/cover.jpg]]', 42);
    expect(plan?.kind).toBe('video');
    expect(plan?.sourcePaths).toEqual(['42/user-a/clip.mp4', '42/user-a/cover.jpg']);
    expect(plan?.buildBody(['81/user-b/clip.mp4', '81/user-b/cover.jpg']))
      .toBe('[[im-video:81/user-b/clip.mp4|81/user-b/cover.jpg]]');
  });

  it('preserves file name and byte size', () => {
    const plan = createChatForwardAttachmentPlan('[[im-file:42/user-a/report.pdf|期中报告.pdf|1024]]', 42);
    expect(plan?.kind).toBe('file');
    expect(plan?.fileName).toBe('期中报告.pdf');
    expect(plan?.fileSize).toBe(1024);
    expect(plan?.buildBody(['81/user-b/report.pdf']))
      .toBe('[[im-file:81/user-b/report.pdf|期中报告.pdf|1024]]');
  });

  it('strips bubble effects before identifying the attachment', () => {
    const plan = createChatForwardAttachmentPlan('[[im-bubble-effect:invisible-ink]][[im-image:42/user-a/photo.png]]', 42);
    expect(plan?.kind).toBe('image');
  });

  it('leaves text messages to the database forwarding RPC', () => {
    expect(createChatForwardAttachmentPlan('普通文字消息', 42)).toBeNull();
    expect(createChatForwardAttachmentPlan('[[im-bubble-effect:screen-fireworks]]文字', 42)).toBeNull();
  });

  it('rejects paths from another conversation and path traversal', () => {
    expect(() => createChatForwardAttachmentPlan('[[im-image:99/user-a/photo.png]]', 42)).toThrow();
    expect(() => createChatForwardAttachmentPlan('[[im-image:42/user-a/../photo.png]]', 42)).toThrow();
  });

  it('rejects incomplete attachment markers and an incorrect destination path count', () => {
    expect(() => createChatForwardAttachmentPlan('[[im-video:42/user-a/clip.mp4', 42)).toThrow();
    const plan = createChatForwardAttachmentPlan('[[im-video:42/user-a/clip.mp4]]', 42);
    expect(() => plan?.buildBody(['81/user-b/clip.mp4', '81/user-b/cover.jpg'])).toThrow();
  });
});
