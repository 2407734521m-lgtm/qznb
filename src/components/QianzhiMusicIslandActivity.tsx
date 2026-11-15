import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
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
    <span className="qz-island-compact">
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
  if (!track) return null;
  const duration = Math.max(1, track.duration);
  const progress = Math.min(track.duration || 0, seekDraft ?? track.currentTime);
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
        <div><span>{formatTime(track.currentTime)}</span><span>{formatTime(track.duration)}</span></div>
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

type IslandDockGesture = {
  pointerId: number;
  source: 'island' | 'peek';
  startX: number;
  startY: number;
};

export const resolveIslandDockGesture = (
  source: IslandDockGesture['source'],
  deltaX: number,
  deltaY: number,
): 'dock' | 'restore' | null => {
  const mostlyVertical = Math.abs(deltaX) <= Math.max(36, Math.abs(deltaY) * 0.65);
  if (!mostlyVertical) return null;
  if (source === 'island' && deltaY <= -44) return 'dock';
  if (source === 'peek' && deltaY >= 28) return 'restore';
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
  collapseRef.current = value.collapse;

  useEffect(() => {
    const finishGesture = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const action = resolveIslandDockGesture(gesture.source, deltaX, deltaY);
      if (action === 'dock') {
        if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
        // Collapse the full activity first so an expanded panel never gets clipped at the top.
        collapseRef.current();
        dockTimerRef.current = window.setTimeout(() => {
          setDocked(true);
          dockTimerRef.current = null;
        }, 260);
      } else if (action === 'restore') {
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
      if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX) * 1.1 && event.cancelable) {
        event.preventDefault();
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null;
    };

    // Window listeners keep the gesture alive after the finger leaves the small island hit area.
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finishGesture, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishGesture, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
    };
  }, []);

  const beginIslandGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-islandcn-hit="pill"], [data-islandcn-hit="bubble"]')) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      source: 'island',
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const beginPeekGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      source: 'peek',
      startX: event.clientX,
      startY: event.clientY,
    };
  };

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
          onPointerDownCapture={beginIslandGesture}
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
            onPointerDown={beginPeekGesture}
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
