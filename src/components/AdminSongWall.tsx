import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';

type Song = { id: string; author_id: string; title: string; description: string | null; audio_path: string; status: string; created_at: string };
function ReviewSong({ song, onStatus, busy }: { song: Song; onStatus: (id: string, status: string) => void; busy: string | null }) {
  const url = useSignedUrl('song-audio', song.audio_path);
  return <article style={{ border: '1px solid #ffffff18', borderRadius: 13, padding: 12, background: '#11182b' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><b>{song.title}</b><span style={{ color: '#aab4d0' }}>{song.status}</span></div>
    {song.description && <p style={{ color: '#b8bfd7', fontSize: 11, lineHeight: 1.6 }}>{song.description}</p>}
    <p style={{ color: '#929dbb', fontSize: 10, overflowWrap: 'anywhere' }}>投稿账号：{song.author_id}</p>
    {url && <audio controls preload="none" src={url} style={{ width: '100%', height: 36 }} />}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
      {song.status !== 'published' && <button disabled={busy === song.id} onClick={() => onStatus(song.id, 'published')} style={action}>审核通过</button>}
      {song.status !== 'hidden' && <button disabled={busy === song.id} onClick={() => onStatus(song.id, 'hidden')} style={action}>隐藏</button>}
      {song.status !== 'rejected' && <button disabled={busy === song.id} onClick={() => onStatus(song.id, 'rejected')} style={action}>拒绝</button>}
      {song.status !== 'pending' && <button disabled={busy === song.id} onClick={() => onStatus(song.id, 'pending')} style={action}>退回待审核</button>}
    </div>
  </article>;
}
export default function AdminSongWall({ setMsg }: { setMsg: (s: string) => void }) {
  const [rows, setRows] = useState<Song[]>([]);
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState<string | null>(null);
  async function load() {
    const { data, error } = await supabase.from('song_posts').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { setMsg('歌声墙管理不可用：请先执行 010_song_wall.sql 数据库迁移。'); return; }
    setRows((data || []) as Song[]);
  }
  useEffect(() => { void load(); }, []);
  async function setStatus(id: string, status: string) {
    setBusy(id); setMsg('');
    const { error } = await supabase.from('song_posts').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setBusy(null);
    if (error) { setMsg('更新失败，请检查管理员权限与数据库迁移。'); return; }
    setMsg('歌声投稿状态已更新。');
    await load();
  }
  const shown = filter === 'all' ? rows : rows.filter(r => r.status === filter);
  return <section>
    <div style={{ background: 'linear-gradient(145deg,#171e33,#0d1222)', border: '1px solid #ffffff18', borderRadius: 14, padding: 13, marginBottom: 10 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>歌声墙审核</h2>
      <p style={{ color: '#9da6c3', fontSize: 11, lineHeight: 1.6 }}>先试听再审核。仅审核通过的作品会对其他成员公开。</p>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{[['pending','待审核'],['published','已发布'],['hidden','已隐藏'],['rejected','未通过'],['all','全部']].map(([v,l]) => <button key={v} onClick={() => setFilter(v)} style={{ border: 0, borderRadius: 999, padding: '7px 10px', fontSize: 11, background: filter===v?'#687cff':'#ffffff12', color: '#fff' }}>{l} {v==='all'?rows.length:rows.filter(p=>p.status===v).length}</button>)}</div>
    </div>
    <div style={{ display: 'grid', gap: 9 }}>{shown.map(song => <ReviewSong key={song.id} song={song} busy={busy} onStatus={(id,status) => void setStatus(id,status)} />)}</div>
    {!shown.length && <p style={{ color: '#9da6c3', textAlign: 'center', padding: 22, fontSize: 12 }}>这个分类暂时没有投稿。</p>}
  </section>;
}
const action: React.CSSProperties = { border: '1px solid #ffffff20', borderRadius: 999, padding: '7px 10px', background: '#ffffff0d', color: '#eef0ff', fontSize: 11, cursor: 'pointer' };
