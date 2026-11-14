import { useEffect, useRef } from 'react';
import type { AppOverlaysModel } from '../app/overlays/buildAppOverlaysModel';
import { getSongArtistLabel } from '../../services/onlineMusic/songMetadata';
import { PlayerState } from '../../types';
import { audioBands } from '../../stores/motionSignals';
import {
    selectDisplayCoverUrl,
    selectDisplayPlayerState,
    usePlaybackStore,
} from '../../stores/usePlaybackStore';

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
    const currentSong = usePlaybackStore(state => state.currentSong);
    const displayCoverUrl = usePlaybackStore(selectDisplayCoverUrl);
    const displayPlayerState = usePlaybackStore(selectDisplayPlayerState);
    const playbackRoute = usePlaybackStore(state => state.playbackRoute);

    const modelRef = useRef(model);
    modelRef.current = model;
    const playbackRef = useRef({ currentSong, displayCoverUrl, displayPlayerState, playbackRoute });
    playbackRef.current = { currentSong, displayCoverUrl, displayPlayerState, playbackRoute };

    useEffect(() => {
        if (window.parent === window) return;

        let parentOrigin: string | null = null;
        const publish = () => {
            if (!parentOrigin) return;
            const controls = modelRef.current.floatingControls;
            const playback = playbackRef.current;
            const song = playback.currentSong;
            if (!song) {
                window.parent.postMessage({
                    source: 'qznb-music',
                    type: 'STATE',
                    version: 1,
                    track: null,
                }, parentOrigin);
                return;
            }

            const currentTime = Number(controls?.currentTime.get() ?? 0);
            const duration = Number(controls?.duration ?? 0);
            const artist = getSongArtistLabel(song) || song.artists?.map(item => item.name).filter(Boolean).join(' / ') || '';
            window.parent.postMessage({
                source: 'qznb-music',
                type: 'STATE',
                version: 1,
                track: {
                    title: song.name || '未知歌曲',
                    artist,
                    coverUrl: playback.displayCoverUrl || song.album?.coverUrl || null,
                    isPlaying: playback.displayPlayerState === PlayerState.PLAYING,
                    currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0,
                    duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
                    canPrevious: controls?.trackNavigation?.canPrev === true,
                    canNext: controls?.trackNavigation?.canNext === true,
                    canToggle: controls?.canTogglePlay === true && !!controls,
                },
            }, parentOrigin);
        };

        // Send the real analyser bands separately from track metadata. 20 Hz is enough
        // for a fluid island meter without pushing frame-rate React updates across origins.
        const publishSpectrum = () => {
            if (!parentOrigin) return;
            const playback = playbackRef.current;
            const playing = playback.displayPlayerState === PlayerState.PLAYING;
            const available = playing && playback.playbackRoute === 'web';
            const normalize = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value / 255 : 0));
            window.parent.postMessage({
                source: 'qznb-music',
                type: 'SPECTRUM',
                version: 1,
                playing,
                available,
                bands: available ? {
                    bass: normalize(audioBands.bass.get()),
                    lowMid: normalize(audioBands.lowMid.get()),
                    vocal: normalize(audioBands.vocal.get()),
                    treble: normalize(audioBands.treble.get()),
                } : null,
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
                    if (controls.canTogglePlay === true) controls.onTogglePlay();
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
        const spectrumTimer = window.setInterval(publishSpectrum, 50);
        return () => {
            window.removeEventListener('message', onMessage);
            window.clearInterval(timer);
            window.clearInterval(spectrumTimer);
        };
    }, []);

    return null;
};

export default QianzhiEmbedBridge;
