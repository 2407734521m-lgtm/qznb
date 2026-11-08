
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
};
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Landscape player overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) {
        throw new Error('Landscape player overlay found ambiguous ' + label + ' anchor');
    }
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

const componentPath = resolve(root, 'src/components/app/PlayerLandscapeExperience.tsx');
const componentSource = `import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Disc3, RotateCw } from 'lucide-react';
import { useAppViewStore } from '../../stores/useAppViewStore';
import { useThemeSettingsStore } from '../../stores/useThemeSettingsStore';
import {
    selectDisplayCoverUrl,
    selectDisplaySong,
    usePlaybackStore,
} from '../../stores/usePlaybackStore';

type OrientationApi = {
    lock?: (orientation: 'landscape') => Promise<void>;
    unlock?: () => void;
};

const PlayerLandscapeExperience: React.FC = () => {
    const currentView = useAppViewStore(state => state.view);
    const isDaylight = useThemeSettingsStore(state => state.isDaylight);
    const currentSong = usePlaybackStore(selectDisplaySong);
    const coverUrl = usePlaybackStore(selectDisplayCoverUrl);
    const isPlayerView = currentView === 'player';

    const [isLandscape, setIsLandscape] = useState(false);
    const [isLockActive, setIsLockActive] = useState(false);
    const [isFullscreenOwned, setIsFullscreenOwned] = useState(false);
    const [notice, setNotice] = useState('');
    const noticeTimerRef = useRef<number | null>(null);

    const notify = useCallback((message: string) => {
        setNotice(message);
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => {
            setNotice('');
            noticeTimerRef.current = null;
        }, 3400);
    }, []);

    const syncOrientation = useCallback(() => {
        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const landscape = viewportWidth > viewportHeight;
        setIsLandscape(landscape);
        if (isPlayerView) {
            document.documentElement.dataset.qznbPlayerLandscape = landscape ? 'true' : 'false';
        } else {
            delete document.documentElement.dataset.qznbPlayerLandscape;
        }
    }, [isPlayerView]);

    useEffect(() => {
        if (!isPlayerView) {
            delete document.documentElement.dataset.qznbPlayerLandscape;
            return;
        }

        syncOrientation();
        window.addEventListener('resize', syncOrientation, { passive: true });
        window.addEventListener('orientationchange', syncOrientation, { passive: true });
        window.visualViewport?.addEventListener('resize', syncOrientation, { passive: true });

        return () => {
            window.removeEventListener('resize', syncOrientation);
            window.removeEventListener('orientationchange', syncOrientation);
            window.visualViewport?.removeEventListener('resize', syncOrientation);
            delete document.documentElement.dataset.qznbPlayerLandscape;
        };
    }, [isPlayerView, syncOrientation]);

    useEffect(() => () => {
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    }, []);

    useEffect(() => {
        if (isPlayerView) return;
        const orientation = window.screen.orientation as unknown as OrientationApi | undefined;
        if (isLockActive) orientation?.unlock?.();
        if (isFullscreenOwned && document.fullscreenElement && document.exitFullscreen) {
            void document.exitFullscreen().catch(() => undefined);
        }
        setIsLockActive(false);
        setIsFullscreenOwned(false);
    }, [isPlayerView, isLockActive, isFullscreenOwned]);

    const toggleLandscape = useCallback(async () => {
        const orientation = window.screen.orientation as unknown as OrientationApi | undefined;

        if (isLockActive || isFullscreenOwned) {
            orientation?.unlock?.();
            setIsLockActive(false);
            if (isFullscreenOwned && document.fullscreenElement && document.exitFullscreen) {
                try {
                    await document.exitFullscreen();
                } catch {
                    notify('已解除横屏锁定；可继续旋转设备恢复竖屏');
                }
            }
            setIsFullscreenOwned(false);
            notify('已退出横屏锁定');
            return;
        }

        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            try {
                await document.documentElement.requestFullscreen();
                setIsFullscreenOwned(true);
            } catch {
                // Some mobile browsers do not expose document fullscreen.
            }
        }

        if (orientation?.lock) {
            try {
                await orientation.lock('landscape');
                setIsLockActive(true);
                notify('横屏模式已开启');
                return;
            } catch {
                // Manual device rotation still activates the responsive landscape layout.
            }
        }

        notify(isLandscape
            ? '当前浏览器不支持锁定方向，横屏布局仍会自动适配'
            : '请开启设备自动旋转并横向转动手机，页面会自动适配');
    }, [isFullscreenOwned, isLandscape, isLockActive, notify]);

    const artists = currentSong?.artists?.map(artist => artist.name).filter(Boolean).join(' / ') ?? '';
    const orientationActive = isLockActive || isFullscreenOwned;

    if (!isPlayerView) return null;

    return (
        <>
            {isLandscape && currentSong && (
                <aside className="qznb-player-landscape-card" aria-label="正在播放">
                    {coverUrl ? (
                        <img src={coverUrl} alt="" draggable={false} />
                    ) : (
                        <span className="qznb-player-landscape-cover-fallback"><Disc3 size={24} /></span>
                    )}
                    <span className="qznb-player-landscape-copy">
                        <strong title={currentSong.name}>{currentSong.name}</strong>
                        <span title={artists || currentSong.album?.name || ''}>
                            {artists || currentSong.album?.name || '正在播放'}
                        </span>
                    </span>
                </aside>
            )}

            <div className="qznb-player-orientation-control" data-daylight={isDaylight ? 'true' : 'false'}>
                <button
                    type="button"
                    onClick={() => void toggleLandscape()}
                    aria-label={orientationActive ? '退出横屏模式' : '切换横屏模式'}
                    title={orientationActive ? '退出横屏模式' : '切换横屏模式'}
                >
                    <RotateCw size={17} aria-hidden="true" />
                    <span>{orientationActive ? '退出横屏' : isLandscape ? '锁定横屏' : '横屏'}</span>
                </button>
                {notice && <div className="qznb-player-orientation-notice" role="status">{notice}</div>}
            </div>
        </>
    );
};

export default PlayerLandscapeExperience;
`;

let existingComponent = '';
try { existingComponent = await read(componentPath); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
if (existingComponent && existingComponent !== componentSource) {
    throw new Error('PlayerLandscapeExperience.tsx already exists with different contents; refusing to overwrite it.');
}
if (!existingComponent) await write(componentPath, componentSource);

const appPath = resolve(root, 'src/App.tsx');
let app = await read(appPath);
const componentImport = "import PlayerLandscapeExperience from './components/app/PlayerLandscapeExperience';";
if (!app.includes(componentImport)) {
    app = replaceOnce(
        app,
        "import AppShell from './components/app/AppShell';",
        "import AppShell from './components/app/AppShell';\n" + componentImport,
        'AppShell import',
    );
}
if (!app.includes('<PlayerLandscapeExperience />')) {
    app = replaceOnce(
        app,
        '            <AppOverlays model={appOverlaysModel} />',
        '            <AppOverlays model={appOverlaysModel} />\n\n            <PlayerLandscapeExperience />',
        'player overlay mount',
    );
}
await write(appPath, app);

const cssPath = resolve(root, 'src/index.css');
let css = await read(cssPath);
const cssMarker = '/* Qianzhi landscape player adaptation */';
if (!css.includes(cssMarker)) {
    css += `

/* Qianzhi landscape player adaptation */
.qznb-player-orientation-control {
    position: fixed;
    z-index: 1201;
    top: max(12px, env(safe-area-inset-top));
    right: max(12px, env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
}

.qznb-player-orientation-control button {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 999px;
    background: rgb(24 24 28 / 0.68);
    color: #fff;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.16);
    backdrop-filter: blur(18px) saturate(1.25);
    -webkit-backdrop-filter: blur(18px) saturate(1.25);
    font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.01em;
    pointer-events: auto;
    cursor: pointer;
    transition: background 180ms ease, border-color 180ms ease, transform 180ms ease;
    touch-action: manipulation;
}

.qznb-player-orientation-control button:active { transform: scale(0.96); }
.qznb-player-orientation-control button:focus-visible { outline: 2px solid rgb(255 255 255 / 0.9); outline-offset: 3px; }
.qznb-player-orientation-control button svg { flex: 0 0 auto; opacity: 0.9; }

.qznb-player-orientation-control[data-daylight='true'] button {
    border-color: rgb(20 20 24 / 0.12);
    background: rgb(255 255 255 / 0.78);
    color: #18181b;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.1);
}

.qznb-player-orientation-notice {
    max-width: min(78vw, 300px);
    padding: 9px 12px;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 12px;
    background: rgb(20 20 24 / 0.82);
    color: #fff;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.18);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    font-size: 12px;
    line-height: 1.5;
    pointer-events: none;
}

.qznb-player-orientation-control[data-daylight='true'] .qznb-player-orientation-notice {
    border-color: rgb(20 20 24 / 0.1);
    background: rgb(255 255 255 / 0.9);
    color: #18181b;
}

.qznb-player-landscape-card {
    position: fixed;
    z-index: 1200;
    top: max(12px, env(safe-area-inset-top));
    left: max(12px, env(safe-area-inset-left));
    display: flex;
    width: min(44vw, 320px);
    min-width: 0;
    align-items: center;
    gap: 11px;
    padding: 8px 12px 8px 8px;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 17px;
    background: rgb(20 20 24 / 0.58);
    color: #fff;
    box-shadow: 0 10px 32px rgb(0 0 0 / 0.13);
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    pointer-events: none;
}

.qznb-player-landscape-card > img,
.qznb-player-landscape-cover-fallback {
    display: flex;
    width: clamp(48px, 13vh, 76px);
    height: clamp(48px, 13vh, 76px);
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 11px;
    background: rgb(255 255 255 / 0.1);
    object-fit: cover;
}

.qznb-player-landscape-cover-fallback { color: rgb(255 255 255 / 0.7); }
.qznb-player-landscape-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; }
.qznb-player-landscape-copy strong,
.qznb-player-landscape-copy > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qznb-player-landscape-copy strong { font-size: clamp(12px, 2.2vh, 15px); font-weight: 650; line-height: 1.35; }
.qznb-player-landscape-copy > span { color: rgb(255 255 255 / 0.68); font-size: clamp(10px, 1.8vh, 12px); line-height: 1.35; }
.qznb-player-landscape-card img { user-select: none; -webkit-user-drag: none; }

@media (orientation: landscape) and (max-height: 600px) {
    .qznb-player-orientation-control { top: max(8px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right)); }
    .qznb-player-orientation-control button { min-height: 36px; padding-inline: 11px; }
    .qznb-player-landscape-card {
        top: max(8px, env(safe-area-inset-top));
        left: max(10px, env(safe-area-inset-left));
        width: min(42vw, 280px);
        gap: 9px;
        padding: 6px 10px 6px 6px;
        border-radius: 14px;
    }
    .qznb-player-landscape-card > img,
    .qznb-player-landscape-cover-fallback {
        width: clamp(42px, 12vh, 64px);
        height: clamp(42px, 12vh, 64px);
        border-radius: 9px;
    }
    .qznb-player-landscape-copy { gap: 3px; }
}

@media (min-width: 1100px) and (pointer: fine) {
    .qznb-player-orientation-control,
    .qznb-player-landscape-card { display: none; }
}

@media (prefers-reduced-motion: reduce) {
    .qznb-player-orientation-control button { transition: none; }
}
`;
    await write(cssPath, css);
}

console.log('Applied Qianzhi landscape player control, safe-area layout and now-playing cover card.');
