import { useMemo, useState } from 'react';
import { GAMES, badgeText, type Game } from '../data/games';
import { supabase } from '../lib/supabase';

export type GameProfile = { game_name: string; game_uid: string | null; rank: string | null; status: string };

// 游戏选择器：搜索游戏 → 填 ID（选填）→ 选段位（选填）→ 提交管理员审核
export default function GamePicker({ initial, onClose, onDone }:
  { initial?: GameProfile | null; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [game, setGame] = useState<Game | null>(() => {
    if (!initial?.game_name) return null;
    return GAMES.find(g => g.name === initial.game_name) ?? null;
  });
  const [uid, setUid] = useState(initial?.game_uid ?? '');
  const [rank, setRank] = useState(initial?.rank ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

  return (
    <div className="crop-mask" onClick={onClose}>
      <div className="gpick" onClick={e => e.stopPropagation()}>
        <div className="gpick-head">
          <b>🎮 选择游戏</b>
          <button className="mini ghost" onClick={onClose}>✕ 关闭</button>
        </div>
        {!game ? (<>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 搜索游戏，如：王者荣耀" />
          <div className="glist">
            {list.map(g => (
              <button key={g.name} type="button" className="grow" onClick={() => { setGame(g); setRank(''); }}>
                <span className="gi">{g.icon}</span>
                <span className="gn">{g.name}</span>
                <span className="mut">{g.ranks.length ? g.ranks.length + ' 个段位' : '无段位'}</span>
              </button>
            ))}
            {list.length === 0 && <p className="mut" style={{ textAlign: 'center' }}>没找到这个游戏，换个关键词试试</p>}
          </div>
        </>) : (<>
          <button type="button" className="grow sel" onClick={() => setGame(null)}>
            <span className="gi">{game.icon}</span>
            <span className="gn">{game.name}</span>
            <span className="mut">换一个 ›</span>
          </button>
          <label>游戏 ID（选填）</label>
          <input value={uid} onChange={e => setUid(e.target.value)} placeholder="如：游戏内的名字 / UID" maxLength={60} />
          <label>段位（选填）</label>
          {game.ranks.length ? (
            <div className="rankgrid">
              {game.ranks.map(r => (
                <button key={r} type="button" className={'rankchip' + (rank === r ? ' on' : '')}
                  onClick={() => setRank(rank === r ? '' : r)}>{r}</button>
              ))}
            </div>
          ) : <p className="mut" style={{ fontSize: 13 }}>该游戏没有排位段位</p>}
          {preview && <div className="gbadge preview">{preview}</div>}
          <p className="mut" style={{ fontSize: 12.5 }}>提交后段位需要管理员审核，通过后你的成员卡片会显示上面的标签</p>
          {err && <p className="err">{err}</p>}
          <button className="pri" disabled={busy} onClick={submit}>{busy ? '提交中…' : '提交审核'}</button>
        </>)}
      </div>
    </div>
  );
}
