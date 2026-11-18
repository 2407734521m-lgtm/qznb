import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { alog } from '../pages/admin/shared';
import {
  ADMIN_WALLPAPER_KEY,
  ADMIN_WALLPAPER_PRESETS,
  parseAdminWallpaper,
  type AdminWallpaper,
} from '../lib/adminWallpaper';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export default function AdminWallpaperSettings({ setMsg }: { setMsg: (message: string) => void }) {
  const [current, setCurrent] = useState<AdminWallpaper>({ type: 'none' });
  const [draft, setDraft] = useState<AdminWallpaper>({ type: 'none' });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', ADMIN_WALLPAPER_KEY)
        .maybeSingle();
      if (!alive) return;
      if (!error && data?.value) {
        const value = parseAdminWallpaper(data.value);
        setCurrent(value);
        setDraft(value);
      }
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function choosePreset(id: 'warm-light' | 'soft-gray' | 'ivory') {
    setFile(null);
    setDraft({ type: 'preset', id });
  }

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (!ALLOWED_IMAGE_TYPES[nextFile.type]) {
      setMsg('图片格式不支持，请使用 JPG、PNG、WebP 或 AVIF。');
      return;
    }
    if (nextFile.size > MAX_IMAGE_BYTES) {
      setMsg('壁纸图片不能超过 5 MB。');
      return;
    }
    setFile(nextFile);
    setDraft({ type: 'image', url: '', path: '' });
  }

  async function saveWallpaper() {
    setSaving(true);
    try {
      let next = draft;
      if (draft.type === 'image' && file) {
        const extension = ALLOWED_IMAGE_TYPES[file.type];
        const path = `admin-wallpapers/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('site-assets')
          .upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) throw new Error('壁纸上传失败：' + uploadError.message);
        const { data } = supabase.storage.from('site-assets').getPublicUrl(path);
        next = parseAdminWallpaper({ type: 'image', url: data.publicUrl, path });
      }

      const { error } = await supabase.from('site_settings').upsert(
        { key: ADMIN_WALLPAPER_KEY, value: JSON.stringify(next) },
        { onConflict: 'key' },
      );
      if (error) throw new Error('壁纸设置保存失败：' + error.message);

      setCurrent(next);
      setDraft(next);
      setFile(null);
      window.dispatchEvent(new CustomEvent('qz:admin-wallpaper-changed', { detail: next }));
      try {
        await alog('admin_wallpaper_changed', {
          type: next.type,
          preset: next.type === 'preset' ? next.id : undefined,
          path: next.type === 'image' ? next.path : undefined,
        });
      } catch { /* The wallpaper is already saved; audit logging must not undo it. */ }
      setMsg(next.type === 'none' ? '已恢复默认后台背景。' : '管理员后台壁纸已保存并应用。');
    } catch (error) {
      setMsg(error instanceof Error ? error.message : '后台壁纸保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  }

  const isDirty = JSON.stringify(current) !== JSON.stringify(draft) || file !== null;
  const previewBackground = draft.type === 'preset'
    ? ADMIN_WALLPAPER_PRESETS.find(item => item.id === draft.id)?.background
    : draft.type === 'image'
      ? previewUrl
        ? `linear-gradient(rgba(255,255,255,.28),rgba(255,255,255,.38)), url("${previewUrl}")`
        : draft.url
          ? `linear-gradient(rgba(255,255,255,.28),rgba(255,255,255,.38)), url("${draft.url}")`
          : undefined
      : undefined;

  return (
    <section className="admin-wallpaper-settings" aria-labelledby="admin-wallpaper-title">
      <div className="admin-wallpaper-heading">
        <div>
          <h3 id="admin-wallpaper-title">后台壁纸</h3>
          <p>为所有管理员统一设置后台背景。只影响管理员控制台，不会改变普通用户页面。</p>
        </div>
        <span className="admin-wallpaper-shared-label">管理员共享</span>
      </div>

      <div className="admin-wallpaper-preview-wrap">
        <div
          className={['admin-wallpaper-preview', previewBackground ? 'has-preview' : ''].join(' ')}
          style={previewBackground ? { backgroundImage: previewBackground } : undefined}
        >
          <div className="admin-wallpaper-preview-top">
            <span className="admin-wallpaper-preview-mark">Q</span>
            <span>管理控制台</span>
            <span className="admin-wallpaper-preview-pill">预览</span>
          </div>
          <div className="admin-wallpaper-preview-content">
            <div className="admin-wallpaper-preview-card">
              <small>运营概览</small>
              <strong>欢迎回来，管理员</strong>
              <span>清晰 · 简洁 · 轻量</span>
            </div>
            <div className="admin-wallpaper-preview-stats">
              <i /><i /><i />
            </div>
          </div>
        </div>
        <p className="admin-wallpaper-preview-note">预览仅展示壁纸与面板的叠加效果；上传后会自动降低图片亮度，确保文字和数据卡片清晰可读。</p>
      </div>

      <div className="admin-wallpaper-options">
        <div className="admin-wallpaper-option-group">
          <div className="admin-wallpaper-section-label">预设背景</div>
          <div className="admin-wallpaper-presets">
            {ADMIN_WALLPAPER_PRESETS.map(preset => (
              <button
                type="button"
                key={preset.id}
                className={['admin-wallpaper-preset', draft.type === 'preset' && draft.id === preset.id ? 'is-selected' : ''].join(' ')}
                onClick={() => choosePreset(preset.id)}
                aria-pressed={draft.type === 'preset' && draft.id === preset.id}
              >
                <span className="admin-wallpaper-preset-swatch" style={{ backgroundImage: preset.background }} />
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="admin-wallpaper-upload-row">
          <div>
            <strong>使用自己的图片</strong>
            <p>支持 JPG、PNG、WebP、AVIF，最大 5 MB。图片上传到现有 site-assets 存储桶。</p>
          </div>
          <label className="admin-wallpaper-upload-button">
            选择图片
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={event => chooseFile(event.target.files?.[0])}
              disabled={saving}
            />
          </label>
        </div>

        {file && <div className="admin-wallpaper-file-name">已选择：{file.name}</div>}
        {draft.type === 'image' && !file && current.type === 'image' && <div className="admin-wallpaper-file-name">当前图片壁纸已选中。</div>}

        <div className="admin-wallpaper-actions">
          <button type="button" className="admin-wallpaper-reset" disabled={saving || (draft.type === 'none' && !file)} onClick={() => { setFile(null); setDraft({ type: 'none' }); }}>
            恢复默认背景
          </button>
          <button type="button" className="admin-wallpaper-save" disabled={loading || saving || !isDirty} onClick={() => void saveWallpaper()}>
            {saving ? '正在保存…' : '保存并应用'}
          </button>
        </div>
        {loading && <p className="admin-wallpaper-status">正在读取当前后台壁纸…</p>}
      </div>
    </section>
  );
}
