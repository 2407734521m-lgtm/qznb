import { useEffect, useRef } from 'react';
import type { AppOverlaysModel } from '../app/overlays/buildAppOverlaysModel';
import { getSongArtistLabel } from '../../services/onlineMusic/songMetadata';
import { PlayerState } from '../../types';

const MAIN_SITE_ORIGINS = new Set([
    'https://qianzhi.pw',
    'https://www.qianzhi.pw',
]);

type BridgeCommand = {
    source: 'qznb-main';
    type: 'HELLO' | 'COMMAND';
    version: 1;
    command?: 'toggle' | 'previous' | 'next' | 'seek';
    value?: number;
};

type Props = { model: AppOverlaysModel };

const QianzhiEmbedBridge = ({ model }: Props) => {
    const modelRef = useRef(model);
    modelRef.current = model;

    useEffect(() => {
        if (window.parent === window) return;

        let parentOrigin: string | null = null;
        const publish = () => {
            if (!parentOrigin) return;
            const controls = modelRef.current.floatingControls;
            const song = controls?.currentSong ?? null;
            if (!song) {
                window.parent.postMessage({
                    source: 'qznb-music',
                    type: 'STATE',
                    version: 1,
                    track: null,
                }, parentOrigin);
                return;
            }

            const currentTime = Number(controls.currentTime.get());
            const duration = Number(controls.duration);
            const artist = getSongArtistLabel(song) || song.artists?.map(item => item.name).filter(Boolean).join(' / ') || '';
            window.parent.postMessage({
                source: 'qznb-music',
                type: 'STATE',
                version: 1,
                track: {
                    title: song.name || '未知歌曲',
                    artist,
                    coverUrl: song.album?.coverUrl || null,
                    isPlaying: controls.playerState === PlayerState.PLAYING,
                    currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0,
                    duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
                    canPrevious: controls.trackNavigation?.canPrev === true,
                    canNext: controls.trackNavigation?.canNext === true,
                    canToggle: controls.canTogglePlay !== false,
                },
            }, parentOrigin);
        };

        const onMessage = (event: MessageEvent<unknown>) => {
            if (event.source !== window.parent || !MAIN_SITE_ORIGINS.has(event.origin)) return;
            const message = event.data as Partial<BridgeCommand> | null;
            if (!message || message.source !== 'qznb-main' || message.version !== 1) return;

            if (message.type === 'HELLO') {
                parentOrigin = event.origin;
                publish();
                return;
            }

            if (message.type !== 'COMMAND' || !parentOrigin || event.origin !== parentOrigin) return;
            const controls = modelRef.current.floatingControls;
            if (!controls || controls.controlsDisabled) return;

            switch (message.command) {
                case 'toggle':
                    if (controls.canTogglePlay !== false) controls.onTogglePlay();
                    break;
                case 'previous':
                    if (controls.trackNavigation?.canPrev) controls.trackNavigation.onPrev();
                    break;
                case 'next':
                    if (controls.trackNavigation?.canNext) controls.trackNavigation.onNext();
                    break;
                case 'seek': {
                    const value = Number(message.value);
                    if (Number.isFinite(value) && controls.duration > 0) {
                        controls.onSeek(Math.max(0, Math.min(controls.duration, value)));
                    }
                    break;
                }
            }
        };

        window.addEventListener('message', onMessage);
        const timer = window.setInterval(publish, 700);
        return () => {
            window.removeEventListener('message', onMessage);
            window.clearInterval(timer);
        };
    }, []);

    return null;
};

export default QianzhiEmbedBridge;
