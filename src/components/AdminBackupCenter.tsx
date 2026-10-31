import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { confirmDialog, promptDialog } from '../lib/dialog';

type BucketSummary = {
  bucket_id: string;
  is_public: boolean;
  object_count: number;
  total_bytes: number;
};
type BackupLog = {
  id: number;
  scope: 'database' | 'storage' | 'full' | string;
  status: string;
  note: string | null;
  created_at: string;
  created_by_name: string;
};
type BackupOverview = {
  generated_at: string;
  database_size_bytes: number;
  public_table_count: number;
  storage_buckets: BucketSummary[];
  manual_backup_count: number;
  latest_manual_backup_at: string | null;
  manual_backup_logs: BackupLog[];
};

const panel: React.CSSProperties = {
  background: 'linear-gradient(155deg,rgba(24,34,56,.94),rgba(12,18,33,.98))',
  border: '1px solid rgba(190,210,255,.13)', borderRadius: 18,
  padding: 14, marginBottom: 12, color: '#edf3ff',
};
const muted: React.CSSProperties = { color: '#98a8c5', fontSize: 11.5, lineHeight: 1.65 };

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const scopeNames: Record<string, string> = {
  database: '数据库导出',
  storage: 'Storage 对象导出',
  full: '数据库 + Storage 完整备份',
};

export default function AdminBackupCenter({ setMsg }: { setMsg: (message: string) => void }) {
  const [data, setData] = useState<BackupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: result, error: rpcError } = await supabase.rpc('admin_backup_overview');
    if (rpcError) {
      setError(rpcError.message);
      setData(null);
    } else {
      setData(result as BackupOverview);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function recordBackup(scope: 'database' | 'storage' | 'full') {
    const scopeName = scopeNames[scope];
    const confirmed = await confirmDialog(
      '请确认你已经实际完成「' + scopeName + '」，并检查导出文件存在且可以打开。这里只登记人工核验记录，不会自动生成、下载或验证备份文件。',
      { confirmText: '我已完成并核验' },
    );
    if (!confirmed) return;
    const note = await promptDialog('记录导出文件保存位置及核验方式（8–500 字）。不要填写密码、密钥或验证码。', {
      placeholder: '例如：文件保存在个人离线备份目录，已检查文件大小与可读取性。',
    });
    if (!note || note.trim().length < 8) {
      setMsg('未登记：请填写至少 8 个字的备份位置与核验说明。');
      return;
    }
    setBusy(scope);
    const { data: id, error: rpcError } = await supabase.rpc('admin_record_manual_backup', {
      p_scope: scope,
      p_note: note.trim(),
    });
    setBusy(null);
    if (rpcError) {
      setMsg('备份记录登记失败：' + rpcError.message);
      return;
    }
    setMsg('已登记人工备份核验记录 #' + id + '。这不是系统自动备份。');
    await load();
  }

  const buckets = data?.storage_buckets ?? [];
  const objectCount = buckets.reduce((sum, item) => sum + item.object_count, 0);
  const totalBytes = buckets.reduce((sum, item) => sum + item.total_bytes, 0);

  return <div style={{ display: 'grid', gap: 12 }}>
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 850 }}>备份与灾备中心</div>
          <div style={muted}>数据库、Storage 对象与人工备份记录</div>
        </div>
        <button className="mini" disabled={loading} onClick={() => void load()}>{loading ? '刷新中…' : '刷新'}</button>
      </div>
      <div style={{ marginTop: 12, padding: 11, borderRadius: 12, border: '1px solid #f0b85a55', background: '#f0b85a12' }}>
        <div style={{ color: '#ffd18a', fontSize: 13, fontWeight: 800 }}>当前组织为 Supabase Free 套餐</div>
        <div style={{ ...muted, color: '#d4c5a7', marginTop: 4 }}>本次核查时，Free 套餐不包含每日自动数据库备份。必须自行安排数据库导出，并单独备份 Storage 文件。升级套餐后应重新核对备份能力。</div>
      </div>
      {error && <p style={{ color: '#ff9da7', fontSize: 12.5 }}>读取失败：{error}</p>}
      {data && <div style={{ ...muted, marginTop: 8 }}>数据采样时间：{new Date(data.generated_at).toLocaleString()}</div>}
    </section>

    {loading && !data ? <section style={panel}><p style={muted}>正在检查数据库与存储…</p></section> : null}
    {data && <>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9 }}>
        {[
          ['数据库大小', formatBytes(data.database_size_bytes)],
          ['公开 Schema 表数', data.public_table_count.toLocaleString()],
          ['Storage 对象数', objectCount.toLocaleString()],
          ['Storage 对象元数据总大小', formatBytes(totalBytes)],
          ['人工备份登记数', data.manual_backup_count.toLocaleString()],
          ['最近人工备份', data.latest_manual_backup_at ? new Date(data.latest_manual_backup_at).toLocaleDateString() : '无记录'],
        ].map(([label, value]) => <div key={label} style={{ padding: 12, borderRadius: 13, background: '#ffffff07', border: '1px solid #ffffff10' }}>
          <div style={muted}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, overflowWrap: 'anywhere' }}>{value}</div>
        </div>)}
      </section>

      <section style={panel}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Storage 分桶清单</div>
        {buckets.map(bucket => <div key={bucket.bucket_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 0', borderBottom: '1px solid #ffffff0d' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{bucket.bucket_id}</div>
            <div style={muted}>{bucket.is_public ? '公开桶' : '私有桶'}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 12.5 }}>{bucket.object_count} 个对象</div>
            <div style={muted}>{formatBytes(bucket.total_bytes)}</div>
          </div>
        </div>)}
        <p style={{ ...muted, margin: '9px 0 0' }}>这里只统计对象元数据，不读取文件内容。数据库备份不包含 Storage 对象本身。</p>
      </section>

      <section style={panel}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>人工备份登记</div>
        <p style={muted}>登记前请先在 Supabase 或其他安全环境完成导出，并确认文件存在、大小合理且可读取。登记功能只记录人工确认，不会创建备份。</p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {(['database', 'storage', 'full'] as const).map(scope => <button key={scope} className="mini" disabled={busy !== null} onClick={() => void recordBackup(scope)}>
            {busy === scope ? '登记中…' : '登记' + scopeNames[scope]}
          </button>)}
        </div>
      </section>

      <section style={panel}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>最近备份记录</div>
        {data.manual_backup_logs.length === 0 ? <p style={muted}>目前没有人工备份登记记录。不能据此推断没有外部备份，但本系统没有可验证的备份凭证。</p>
          : data.manual_backup_logs.map(item => <div key={item.id} style={{ padding: '9px 0', borderBottom: '1px solid #ffffff0d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 12.5 }}>{scopeNames[item.scope] || item.scope}</strong>
              <span style={{ fontSize: 10.5, color: '#8de0b7' }}>人工登记</span>
            </div>
            <div style={{ ...muted, marginTop: 3 }}>{new Date(item.created_at).toLocaleString()} · {item.created_by_name}</div>
            {item.note && <div style={{ fontSize: 12, marginTop: 5, overflowWrap: 'anywhere' }}>{item.note}</div>}
          </div>)}
      </section>
    </>}

    <section style={panel}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>备份入口与恢复边界</div>
      <div style={muted}>数据库备份入口：Supabase Dashboard → Database → Backups。Storage 文件需要另外导出，不能只备份数据库元数据。生产恢复可能覆盖新数据并造成停机；当前中心不会提供未经确认的一键恢复。</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <a href="https://supabase.com/dashboard/project/ldypnxxxgscibopgiaso/database/backups/scheduled" target="_blank" rel="noreferrer" style={{ ...muted, color: '#9fc1ff' }}>打开数据库备份页 ↗</a>
        <a href="https://supabase.com/dashboard/project/ldypnxxxgscibopgiaso/storage/buckets" target="_blank" rel="noreferrer" style={{ ...muted, color: '#9fc1ff' }}>打开 Storage 分桶页 ↗</a>
      </div>
    </section>
  </div>;
}
