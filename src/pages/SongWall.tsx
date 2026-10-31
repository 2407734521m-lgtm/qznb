import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';
import type { ProfileLabel as Profile } from '../types/profile';
import type { SongWallPost as Song } from '../types/song';


function SongCard({ song, mine, author }: { song: Song; mine: boolean; author?: Profile }) {
  const url = useSignedUrl('song-audio', song.audio_path);
  return <article style={{ border: '1px solid #e9ebf0', background: '#fff', borderRadius: 14, padding: 13 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{song.title}</div>
        <div style={{ color: '#606673', fontSize: 11, marginTop: 4 }}>{mine ? '我的投稿' : (author?.display_name || author?.username || '班级同学')} · {new Date(song.created_at).toLocaleDateString()}</div>
      </div>
      {mine && <span style={{ flexShrink: 0, fontSize: 10, borderRadius: 999, padding: '4px 7px', background: song.status === 'published' ? '#e6f4ea' : '#f1f3f6', color: song.status === 'published' ? '#1a7a4a' : '#606673' }}>{song.status === 'pending' ? '审核中' : song.status === 'published' ? '已发布' : song.status === 'rejected' ? '未通过' : '已隐藏'}</span>}
    </div>
    {song.description && <p style={{ color: '#333946', fontSize: 12, lineHeight: 1.7, margin: '9px 0' }}>{song.description}</p>}
    {url ? <audio controls preload="none" src={url} style={{ width: '100%', height: 36, marginTop: 8 }} /> : <div style={{ color: '#606673', fontSize: 11, marginTop: 10 }}>音频链接加载中…</div>}
  </article>;
}

export default function SongWall() {
  const { session } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [mine, setMine] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    const { data, error } = await supabase.from('song_posts').select('id,author_id,title,description,audio_path,status,duration_seconds,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) { setNotice('歌声墙数据库尚未启用。需要先执行项目中的 010_song_wall.sql 迁移。'); return; }
    const rows = data ?? [];
    setSongs(rows);
    const ids = [...new Set(rows.map(s => s.author_id))];
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id,display_name,username').in('id', ids);
      setProfiles(Object.fromEntries((people || []).map(p => [p.id, p])));
    }
  }
  useEffect(() => { void load(); }, []);

  async function publish() {
    if (!session) return;
    const cleanTitle = title.trim();
    if (cleanTitle.length < 1 || cleanTitle.length > 80) { setNotice('歌名请填写 1–80 个字。'); return; }
    if (!file) { setNotice('请先选择一段音频文件。'); return; }
    if (file.size > 20 * 1024 * 1024) { setNotice('音频不能超过 20 MB。'); return; }
    if (!(file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|webm)$/i.test(file.name))) { setNotice('请选择 MP3、M4A、AAC、OGG、WAV 或 WebM 音频。'); return; }
    setBusy(true); setNotice('');
    try {
      const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
      const path = `${session.user.id}/songs/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('song-audio').upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from('song_posts').insert({
        author_id: session.user.id, title: cleanTitle, description: description.trim().slice(0, 300) || null,
        audio_path: path, status: 'pending'
      });
      if (error) throw error;
      setTitle(''); setDescription(''); setFile(null);
      const picker = document.getElementById('song-audio-picker') as HTMLInputElement | null;
      if (picker) picker.value = '';
      setNotice('投稿已提交，管理员审核通过后会出现在歌声墙。');
      await load();
    } catch (e: any) {
      setNotice('提交失败：请确认 010_song_wall.sql 已执行，且 song-audio 存储策略已启用。');
    } finally { setBusy(false); }
  }

  const visible = songs.filter(s => mine ? s.author_id === session?.user.id : s.status === 'published');
  return <main style={{ maxWidth: 720, margin: '0 auto', padding: '12px 0 30px', color: '#202124' }}>
    <header style={{ padding: '10px 2px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: '#737b89' }}>PINGCHANG · VOICE STAGE</div>
      <h1 style={{ fontSize: 21, margin: '7px 0 5px' }}>歌声墙</h1>
      <p style={{ color: '#606673', fontSize: 12, lineHeight: 1.7, margin: 0 }}>把自己的歌声留在校园里。只上传自己录制或拥有发布授权的音频。</p>
    </header>
    <section style={{ border: '1px solid #e9ebf0', background: '#fff', borderRadius: 16, padding: 14, marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>发布一段歌声</h2>
      <label style={label}>歌名</label>
      <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="给你的作品起个名字" style={field} />
      <label style={label}>作品介绍（选填）</label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={300} rows={2} placeholder="写几句关于这首歌的话" style={{ ...field, resize: 'vertical' }} />
      <label style={label}>音频文件（最大 20 MB）</label>
      <input id="song-audio-picker" type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav,.webm" onChange={e => setFile(e.target.files?.[0] || null)} style={{ width: '100%', color: '#333946', fontSize: 12, margin: '4px 0 12px' }} />
      {file && <p style={{ fontSize: 11, color: '#606673', margin: '0 0 10px' }}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      <button onClick={() => void publish()} disabled={busy} style={primary}>{busy ? '上传中…' : '提交审核'}</button>
      {notice && <p role="status" style={{ color: '#333946', fontSize: 11, lineHeight: 1.6, marginBottom: 0 }}>{notice}</p>}
    </section>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
      <h2 style={{ fontSize: 15, margin: 0 }}>{mine ? '我的投稿' : '大家的歌声'}</h2>
      <button onClick={() => setMine(v => !v)} style={ghost}>{mine ? '返回歌声墙' : '我的投稿'}</button>
    </div>
    <div style={{ display: 'grid', gap: 10 }}>
      {visible.map(song => <SongCard key={song.id} song={song} mine={song.author_id === session?.user.id} author={profiles[song.author_id]} />)}
      {!visible.length && <div style={{ textAlign: 'center', padding: 24, border: '1px dashed #dfe3ea', borderRadius: 14, color: '#606673', fontSize: 12 }}>{mine ? '你还没有投稿。' : '还没有公开作品，来发布第一段歌声吧。'}</div>}
    </div>
  </main>;
}

const label: React.CSSProperties = { display: 'block', color: '#606673', fontSize: 11, margin: '10px 0 5px' };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #dfe3ea', background: '#fff', color: '#202124', padding: '9px 10px', borderRadius: 10, font: 'inherit', fontSize: 12 };
const primary: React.CSSProperties = { border: 0, borderRadius: 999, padding: '9px 15px', background: '#202632', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const ghost: React.CSSProperties = { border: '1px solid #dfe3ea', borderRadius: 999, padding: '7px 10px', background: '#fff', color: '#333946', cursor: 'pointer', fontSize: 11 };
