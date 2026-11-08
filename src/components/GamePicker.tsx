import { useEffect, useMemo, useState } from 'react';
import { GAMES, badgeText, type Game } from '../data/games';
import { supabase } from '../lib/supabase';

export type GameProfile = { game_name: string; game_uid: string | null; rank: string | null; status: string };
export type Origin = { x: number; y: number; w: number; h: number };

// 游戏选择器：从点击的按钮位置展开全屏；搜索游戏 → 填 ID（选填）→ 选段位（选填）→ 提交管理员审核
export default function GamePicker({ initial, origin, onClose, onDone }:
  { initial?: GameProfile | null; origin?: Origin | null; onClose: () => void; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [game, setGame] = useState<Game | null>(() => {
    if (!initial?.game_name) return null;
    return GAMES.find(g => g.name === initial.game_name) ?? null;
  });
  const [uid, setUid] = useState(initial?.game_uid ?? '');
  const [rank, setRank] = useState(initial?.rank ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    return () => cancelAnimationFrame(t);
  }, []);
  function close() { setOpen(false); setTimeout(onClose, 360); }

  const list = useMemo(() => {
    const s = q.trim();
    if (!s) return GAMES;
    return GAMES.filter(g => g.name.includes(s));
  }, [q]);

  async function submit() {
    if (!game) return setErr('请先选择一个游戏');
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('submit_game_profile', {
      gname: game.name, guid: uid.trim() || null, rnk: rank || null,
    });
    setBusy(false);
    if (error) return setErr('提交失败：' + error.message);
    onDone();
  }

  const preview = game && rank ? badgeText(game.name, rank) : null;

  const startStyle: React.CSSProperties = origin
    ? { left: origin.x, top: origin.y, width: origin.w, height: origin.h, borderRadius: 14, opacity: 0.5 }
    : { left: '50%', top: '50%', width: 0, height: 0, borderRadius: 24, opacity: 0 };
  const endStyle: React.CSSProperties = {
    left: 10, top: 10, width: 'calc(100vw - 20px)', height: 'calc(100dvh - 20px)', borderRadius: 20, opacity: 1,
  };

  return (
    <>
      <div className={'gmask' + (open ? ' on' : '')} onClick={close} />
      <div className="gexpand" style={open ? endStyle : startStyle}>
        <div className="gexpand-in">
          <div className={'gpick-head' + (open ? ' ganim' : '')}>
            <b>选择游戏</b>
            <button type="button" className="mini ghost" onClick={close}>✕ 关闭</button>
          </div>
          {!game ? (<>
            <input className={open ? 'ganim' : ''} value={q} onChange={e => setQ(e.target.value)}
              placeholder="搜索游戏，如：王者荣耀" />
            <div className="glist">
              {list.map((g, i) => (
                <button key={g.name} type="button"
                  className={'grow' + (open ? ' ganim' : '')}
                  style={open ? { animationDelay: `${Math.min(i * 28, 280)}ms` } : undefined}
                  onClick={() => { setGame(g); setRank(''); }}>
                  <span className="gn">{g.name}</span>
                  <span className="mut">{g.ranks.length ? g.ranks.length + ' 个段位' : '无段位'}</span>
                </button>
              ))}
              {list.length === 0 && <p className="mut" style={{ textAlign: 'center' }}>没找到这个游戏，换个关键词试试</p>}
            </div>
          </>) : (<>
            <button type="button" className={'grow sel' + (open ? ' ganim' : '')} onClick={() => setGame(null)}>
              <span className="gn">{game.name}</span>
              <span className="mut">换一个 ›</span>
            </button>
            <div className={open ? 'ganim' : ''} style={open ? { animationDelay: '60ms' } : undefined}>
              <label>游戏 ID（选填）</label>
              <input value={uid} onChange={e => setUid(e.target.value)} placeholder="如：游戏内的名字 / UID" maxLength={60} />
            </div>
            <div className={open ? 'ganim' : ''} style={open ? { animationDelay: '120ms' } : undefined}>
              <label>段位（选填）</label>
              {game.ranks.length ? (
                <div className="rankgrid">
                  {game.ranks.map((r, i) => (
                    <button key={r} type="button"
                      className={'rankchip' + (open ? ' ganim' : '') + (rank === r ? ' on' : '')}
                      style={open ? { animationDelay: `${120 + Math.min(i * 24, 240)}ms` } : undefined}
                      onClick={() => setRank(rank === r ? '' : r)}>{r}</button>
                  ))}
                </div>
              ) : <p className="mut" style={{ fontSize: 13 }}>该游戏没有排位段位</p>}
            </div>
            {preview && <div className={'gbadge preview' + (open ? ' ganim' : '')}>{preview}</div>}
            <p className={'mut' + (open ? ' ganim' : '')} style={{ fontSize: 12.5, animationDelay: open ? '200ms' : undefined }}>
              提交后段位需要管理员审核，通过后你的成员卡片会显示上面的标签</p>
            {err && <p className="err">{err}</p>}
            <button className="pri" disabled={busy} onClick={submit}>{busy ? '提交中…' : '提交审核'}</button>
          </>)}
        </div>
      </div>
    </>
  );
}
