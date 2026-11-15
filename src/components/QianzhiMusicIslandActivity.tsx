import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Island } from '../lib/island';

type MusicCommand = 'toggle' | 'previous' | 'next' | 'seek';

interface MusicTrack {
  title: string;
  artist: string;
  coverUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  canPrevious: boolean;
  canNext: boolean;
  canToggle: boolean;
}

interface MusicIslandState {
  track: MusicTrack | null;
  connected: boolean;
  sendCommand: (command: MusicCommand, value?: number) => void;
  openMusic: () => void;
  seekDraft: number | null;
  setSeekDraft: (value: number) => void;
  commitSeekDraft: () => void;
  cancelSeekDraft: () => void;
  collapse: () => void;
  isExpanded: () => boolean;
  activityIds: readonly string[];
}

const MusicIslandContext = createContext<MusicIslandState | null>(null);

const useMusicIslandState = (): MusicIslandState => {
  const state = useContext(MusicIslandContext);
  if (!state) throw new Error('Music island content must be rendered inside MusicIslandView.');
  return state;
};

const formatTime = (value: number): string => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const MusicIcon = ({ name, size = 17 }: { name: 'play' | 'pause' | 'previous' | 'next' | 'close' | 'list'; size?: number }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  if (name === 'play') return <svg {...common}><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'pause') return <svg {...common}><path d="M8 5v14M16 5v14" /></svg>;
  if (name === 'previous') return <svg {...common}><path d="M6 5v14M19 5l-11 7 11 7z" /></svg>;
  if (name === 'next') return <svg {...common}><path d="M18 5v14M5 5l11 7-11 7z" /></svg>;
  if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
};

const AlbumArt = ({ size, expanded = false }: { size: number; expanded?: boolean }) => {
  const { track } = useMusicIslandState();
  if (!track) return null;
  const artClass = [
    'qz-island-art',
    expanded && 'qz-island-art-expanded',
    track.isPlaying && 'is-playing',
  ].filter(Boolean).join(' ');
  if (track.coverUrl) {
    return <img className={artClass} src={track.coverUrl} alt="" width={size} height={size} />;
  }
  return (
    <span className={artClass + ' qz-island-art-fallback'} aria-hidden="true">
      ♫
    </span>
  );
};

export const MusicCompactContent = () => {
  const { track } = useMusicIslandState();
  if (!track) return null;
  return (
    <span className={'qz-island-compact' + (track.isPlaying ? '' : ' is-paused')}>
      <AlbumArt size={22} />
      <span className="qz-island-compact-title qz-island-track-label" key={`${track.title}-${track.artist}`}>{track.title}</span>
    </span>
  );
};

export const MusicSpectrumContent = () => {
  const { track } = useMusicIslandState();
  if (!track) return null;
  return (
    <span className={'qz-island-wave' + (track.isPlaying ? ' is-playing' : '')} aria-label={track.isPlaying ? '音乐正在播放' : '音乐已暂停'}>
      <i /><i /><i /><i />
    </span>
  );
};

const MusicExpandedMeta = () => {
  const { track } = useMusicIslandState();
  if (!track) return null;
  return (
    <span className="qz-island-expanded-meta">
      <strong className="qz-island-track-label" key={track.title}>{track.title}</strong>
      <span className="qz-island-track-label" key={track.artist}>{track.artist || '未知歌手'}</span>
      <small>{track.isPlaying ? '正在播放' : '已暂停'}</small>
    </span>
  );
};

const MusicExpandedClose = () => {
  const { collapse } = useMusicIslandState();
  return (
    <button type="button" className="qz-island-close" aria-label="收起灵动岛" onClick={collapse}>
      <MusicIcon name="close" size={15} />
    </button>
  );
};

const MusicExpandedControls = () => {
  const { track, connected, sendCommand, openMusic, seekDraft, setSeekDraft, commitSeekDraft, cancelSeekDraft } = useMusicIslandState();
  const [smoothTime, setSmoothTime] = useState(track ? track.currentTime : 0);
  const anchorRef = useRef({ time: track ? track.currentTime : 0, at: Date.now() });
  // 桥每 700ms 才推一次整秒进度，进度条会一格一格跳；播放时在两次推送之间
  // 本地按 120ms 一格往前补，滑块和时间走得顺滑。拖动时以手指为准，不补。
  useEffect(() => {
    anchorRef.current = { time: track ? track.currentTime : 0, at: Date.now() };
    setSmoothTime(track ? track.currentTime : 0);
  }, [track ? track.currentTime : 0, track ? track.title : '']);
  useEffect(() => {
    if (!track || !track.isPlaying || seekDraft !== null || track.duration <= 0) return;
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - anchorRef.current.at) / 1000;
      setSmoothTime(Math.min(track.duration, anchorRef.current.time + elapsed));
    }, 120);
    return () => window.clearInterval(timer);
  }, [track ? track.isPlaying : false, seekDraft, track ? track.duration : 0]);
  if (!track) return null;
  const duration = Math.max(1, track.duration);
  const shownTime = seekDraft ?? smoothTime;
  const progress = Math.min(track.duration || 0, shownTime);
  const progressPercent = track.duration > 0 ? Math.min(100, Math.max(0, (progress / track.duration) * 100)) : 0;
  return (
    <div className="qz-island-expanded-bottom">
      <div className="qz-island-progress">
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={progress}
          style={{ '--qz-music-progress': progressPercent + '%' } as CSSProperties}
          onChange={event => setSeekDraft(Number(event.target.value))}
          onPointerUp={commitSeekDraft}
          onPointerCancel={cancelSeekDraft}
          onKeyUp={commitSeekDraft}
          onBlur={commitSeekDraft}
          aria-label="歌曲播放进度"
          disabled={!connected || track.duration <= 0}
        />
        <div><span>{formatTime(shownTime)}</span><span>{formatTime(track.duration)}</span></div>
      </div>
      <div className="qz-island-controls">
        <button type="button" onClick={() => sendCommand('previous')} disabled={!connected || !track.canPrevious} aria-label="上一首">
          <MusicIcon name="previous" size={18} />
        </button>
        <button type="button" className="qz-island-play" onClick={() => sendCommand('toggle')} disabled={!connected || !track.canToggle} aria-label={track.isPlaying ? '暂停音乐' : '继续播放音乐'}>
          <MusicIcon name={track.isPlaying ? 'pause' : 'play'} size={18} />
        </button>
        <button type="button" onClick={() => sendCommand('next')} disabled={!connected || !track.canNext} aria-label="下一首">
          <MusicIcon name="next" size={18} />
        </button>
        <button type="button" onClick={openMusic} aria-label="打开音乐空间">
          <MusicIcon name="list" size={17} />
        </button>
      </div>
    </div>
  );
};

/** True when a new live activity has appeared since the island was docked. */
export const hasNewIslandActivity = (
  previous: readonly string[],
  current: readonly string[],
): boolean => current.some(id => !previous.includes(id));

type IslandDockSource = 'island' | 'peek';

type IslandDockGesture = {
  pointerId: number;
  source: IslandDockSource;
  startX: number;
  startY: number;
};

/** Prefer the peek handle; otherwise accept any real interactive target inside the island host. */
export const resolveIslandGestureSource = (
  isPeek: boolean,
  isInsideIslandHost: boolean,
): IslandDockSource | null => isPeek ? 'peek' : isInsideIslandHost ? 'island' : null;

export const resolveIslandDockGesture = (
  source: IslandDockSource,
  deltaX: number,
  deltaY: number,
): 'dock' | 'restore' | null => {
  const mostlyVertical = Math.abs(deltaX) <= Math.max(28, Math.abs(deltaY) * 0.7);
  if (!mostlyVertical) return null;
  if (source === 'island' && deltaY <= -38) return 'dock';
  if (source === 'peek' && deltaY >= 24) return 'restore';
  return null;
};

export const MusicIslandView = ({
  value,
  hostRef,
}: {
  value: MusicIslandState;
  hostRef: RefObject<HTMLDivElement | null>;
}) => {
  const [docked, setDocked] = useState(false);
  const gestureRef = useRef<IslandDockGesture | null>(null);
  const dockTimerRef = useRef<number | null>(null);
  const collapseRef = useRef(value.collapse);
  const isExpandedRef = useRef(value.isExpanded);
  const suppressIslandClickUntilRef = useRef(0);
  const previousActivityIdsRef = useRef(value.activityIds);
  collapseRef.current = value.collapse;
  isExpandedRef.current = value.isExpanded;

  useEffect(() => {
    // Start in the native capture phase so Android touch pointers are recorded before any
    // React press handler or browser gesture handling can change the event target.
    const beginGesture = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const source = resolveIslandGestureSource(
        target.closest('.qz-island-peek') !== null,
        target.closest('.qz-island-host') !== null,
      );
      if (!source) return;

      gestureRef.current = {
        pointerId: event.pointerId,
        source,
        startX: event.clientX,
        startY: event.clientY,
      };
    };

    const finishGesture = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const action = resolveIslandDockGesture(gesture.source, deltaX, deltaY);
      if (action === 'dock') {
        // Prevent the same swipe from becoming a button click (e.g. Hang up or Mute).
        if (event.cancelable) event.preventDefault();
        suppressIslandClickUntilRef.current = Date.now() + 550;
        if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);

        // Finish the island's own collapse morph before translating the whole host off-screen.
        // Compact activities can dock immediately; expanded calls get time to settle first.
        const waitForCollapse = isExpandedRef.current();
        collapseRef.current();
        const dock = () => {
          setDocked(true);
          dockTimerRef.current = null;
        };
        if (waitForCollapse) {
          dockTimerRef.current = window.setTimeout(dock, 460);
        } else {
          dock();
        }
      } else if (action === 'restore') {
        if (event.cancelable) event.preventDefault();
        if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
        dockTimerRef.current = null;
        setDocked(false);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (Math.abs(deltaY) > 9 && Math.abs(deltaY) > Math.abs(deltaX) * 1.1 && event.cancelable) {
        event.preventDefault();
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null;
    };

    const onWindowBlur = () => { gestureRef.current = null; };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') gestureRef.current = null;
    };
    const suppressSwipedButtonClick = (event: MouseEvent) => {
      if (Date.now() > suppressIslandClickUntilRef.current) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.qz-island-host')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressIslandClickUntilRef.current = 0;
    };

    // Capture phase survives nested controls and the pointer leaving the original capsule hit area.
    window.addEventListener('pointerdown', beginGesture, true);
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', finishGesture, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('click', suppressSwipedButtonClick, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', beginGesture, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishGesture, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('click', suppressSwipedButtonClick, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const previous = previousActivityIdsRef.current;
    previousActivityIdsRef.current = value.activityIds;
    if (!docked || !hasNewIslandActivity(previous, value.activityIds)) return;

    // A new call, upload or notification must never remain hidden behind the docked state.
    if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
    dockTimerRef.current = null;
    setDocked(false);
  }, [value.activityIds, docked]);

  const restoreIsland = () => {
    if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
    dockTimerRef.current = null;
    setDocked(false);
  };

  return (
    <MusicIslandContext.Provider value={value}>
      <>
        <div
          ref={hostRef}
          className={'qz-island-host' + (docked ? ' is-docked' : '')}
          data-docked={docked ? 'true' : 'false'}
          aria-hidden={docked || undefined}
        >
          <Island
            placement="viewport"
            label="堯实时活动"
            keyline="off"
            style={{ top: 'max(env(safe-area-inset-top, 0px), 18px)', zIndex: 4001 }}
          />
        </div>
        {docked && (
          <button
            type="button"
            className="qz-island-peek"
            aria-label="恢复灵动岛"
            aria-expanded="false"
            onClick={restoreIsland}
          />
        )}
      </>
    </MusicIslandContext.Provider>
  );
};

export const createMusicIslandActivity = (onPress: () => void) => ({
  id: 'music-playback',
  label: '音乐正在播放',
  priority: 0,
  onPress,
  compact: {
    leading: <MusicCompactContent />,
    trailing: <MusicSpectrumContent />,
  },
  minimal: <MusicCompactContent />,
  expanded: {
    leading: <AlbumArt size={48} expanded />,
    center: <MusicExpandedMeta />,
    trailing: <MusicExpandedClose />,
    bottom: <MusicExpandedControls />,
  },
});
