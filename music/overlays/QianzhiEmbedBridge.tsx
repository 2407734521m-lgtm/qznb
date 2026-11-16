import { useEffect, useRef } from 'react';
import type { AppOverlaysModel } from '../app/overlays/buildAppOverlaysModel';
import { getSongArtistLabel } from '../../services/onlineMusic/songMetadata';
import { PlayerState } from '../../types';
import { audioBands, audioLevel } from '../../stores/motionSignals';
import { handleSetVolume, useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
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
    command?: 'toggle' | 'previous' | 'next' | 'seek' | 'volume' | 'mute';
    value?: number;
};

type Props = { model: AppOverlaysModel };

const QianzhiEmbedBridge = ({ model }: Props) => {
    const currentSong = usePlaybackStore(state => state.currentSong);
    const displayCoverUrl = usePlaybackStore(selectDisplayCoverUrl);
    const displayPlayerState = usePlaybackStore(selectDisplayPlayerState);
    const playbackRoute = usePlaybackStore(state => state.playbackRoute);
    const volume = useAudioSettingsStore(state => state.volume);
    const isMuted = useAudioSettingsStore(state => state.isMuted);

    const modelRef = useRef(model);
    modelRef.current = model;
    const playbackRef = useRef({ currentSong, displayCoverUrl, displayPlayerState, playbackRoute, volume, isMuted });
    playbackRef.current = { currentSong, displayCoverUrl, displayPlayerState, playbackRoute, volume, isMuted };

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
                    volume: Number.isFinite(playback.volume) ? Math.max(0, Math.min(1, playback.volume)) : null,
                    isMuted: playback.isMuted === true,
                },
            }, parentOrigin);
        };

        // Prefer frequency bands. When they carry no useful energy, fall back to
        // the same analyser's time-domain RMS loudness; never create another audio graph.
        const publishSpectrum = () => {
            if (!parentOrigin) return;
            const playback = playbackRef.current;
            const playing = playback.displayPlayerState === PlayerState.PLAYING;
            // Paused: the bars already fall back to idle on the next STATE, so there is
            // nothing to push until playback resumes.
            if (!playing) return;
            const routeSupportsWebAnalyser = playback.playbackRoute === 'web';
            const spectrumData = audioBands.spectrum.get();
            const spectrumReady = playing && routeSupportsWebAnalyser && spectrumData.length > 0;
            const normalizeBand = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value / 255 : 0));
            const bands = spectrumReady ? {
                bass: normalizeBand(audioBands.bass.get()),
                lowMid: normalizeBand(audioBands.lowMid.get()),
                vocal: normalizeBand(audioBands.vocal.get()),
                treble: normalizeBand(audioBands.treble.get()),
            } : null;
            const hasSpectrumEnergy = !!bands && (bands.bass + bands.lowMid + bands.vocal + bands.treble) > 0.025;
            const levelValue = playing && routeSupportsWebAnalyser ? audioLevel.get() : 0;
            const level = Math.max(0, Math.min(1, Number.isFinite(levelValue) ? levelValue : 0));
            const hasAudioLevel = playing && routeSupportsWebAnalyser && level > 0.012;
            // Some playback routes do not expose analyser data. Mark them explicitly so the
            // main-site capsule can use its lightweight visual fallback instead of freezing.
            const mode = hasSpectrumEnergy ? 'spectrum' : hasAudioLevel ? 'level' : 'fallback';
            window.parent.postMessage({
                source: 'qznb-music',
                type: 'SPECTRUM',
                version: 1,
                playing,
                available: hasSpectrumEnergy,
                mode,
                level,
                bands: mode === 'spectrum' ? bands : null,
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
                case 'volume': {
                    const value = Number(message.value);
                    if (Number.isFinite(value)) {
                        handleSetVolume(Math.max(0, Math.min(1, value)));
                    }
                    break;
                }
                case 'mute': {
                    useAudioSettingsStore.getState().handleSetMuted(message.value === 1);
                    break;
                }
            }
        };

        window.addEventListener('message', onMessage);
        // STATE still pushes every 700ms — the main site skips pushes that change nothing —
        // but nothing is pushed while the tab is in the background: nobody is listening, and
        // the HELLO handshake re-publishes within 2.5s of coming back.
        const timer = window.setInterval(() => {
            if (!document.hidden) publish();
        }, 700);
        // The equalizer moves on a 118ms transition, so pushing bands every 50ms only fought
        // it. 120ms matches the transition, and a paused or backgrounded tab sends nothing.
        const spectrumTimer = window.setInterval(() => {
            if (!document.hidden) publishSpectrum();
        }, 120);
        return () => {
            window.removeEventListener('message', onMessage);
            window.clearInterval(timer);
            window.clearInterval(spectrumTimer);
        };
    }, []);

    return null;
};

export default QianzhiEmbedBridge;
