import { describe, expect, it } from 'vitest';
import { isChatVideoFile, resolveChatVideoMime } from './chatMedia';

describe('chat video MIME normalization', () => {
  it('accepts supported browser MIME values', () => {
    expect(resolveChatVideoMime({ type: 'video/mp4', name: 'clip.mp4' })).toBe('video/mp4');
    expect(resolveChatVideoMime({ type: 'video/webm', name: 'clip.webm' })).toBe('video/webm');
    expect(resolveChatVideoMime({ type: 'video/quicktime', name: 'clip.mov' })).toBe('video/quicktime');
  });

  it('normalizes empty or generic Android file-provider MIME values by extension', () => {
    expect(resolveChatVideoMime({ type: '', name: 'clip.mp4' })).toBe('video/mp4');
    expect(resolveChatVideoMime({ type: 'application/octet-stream', name: 'clip.m4v' })).toBe('video/mp4');
    expect(resolveChatVideoMime({ type: '', name: 'clip.3gp' })).toBe('video/3gpp');
  });

  it('recognizes likely video files while rejecting non-video documents', () => {
    expect(isChatVideoFile({ type: 'video/x-unknown', name: 'clip.bin' })).toBe(true);
    expect(isChatVideoFile({ type: 'application/octet-stream', name: 'clip.webm' })).toBe(true);
    expect(isChatVideoFile({ type: 'application/pdf', name: 'report.pdf' })).toBe(false);
  });

  it('does not guess a codec from an unsupported extension', () => {
    expect(resolveChatVideoMime({ type: '', name: 'clip.avi' })).toBeNull();
  });
});
