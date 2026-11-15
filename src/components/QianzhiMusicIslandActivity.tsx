import { createContext, useContext, type CSSProperties, type RefObject } from 'react';
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
  if (track.coverUrl) {
    return <img className={expanded ? 'qz-island-art qz-island-art-expanded' : 'qz-island-art'} src={track.coverUrl} alt="" width={size} height={size} />;
  }
  return (
    <span className={expanded ? 'qz-island-art qz-island-art-expanded qz-island-art-fallback' : 'qz-island-art qz-island-art-fallback'} aria-hidden="true">
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
      <span className="qz-island-compact-title">{track.title}</span>
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
      <strong>{track.title}</strong>
      <span>{track.artist || '未知歌手'}</span>
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

export const MusicIslandView = ({
  value,
  hostRef,
}: {
  value: MusicIslandState;
  hostRef: RefObject<HTMLDivElement | null>;
}) => (
  <MusicIslandContext.Provider value={value}>
    <div ref={hostRef} className="qz-island-host">
      <Island
        placement="viewport"
        label="堯实时活动"
        keyline="off"
        style={{ top: 'max(env(safe-area-inset-top, 0px), 18px)', zIndex: 1201 }}
      />
    </div>
  </MusicIslandContext.Provider>
);

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
