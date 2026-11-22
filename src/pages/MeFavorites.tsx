import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { fetchMembersByIds } from '../lib/memberDirectory';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';
import SwipeToDelete, { showUndoToast } from '../components/SwipeToDelete';
import { RowSkeleton, useDelayedLoading } from '../components/fx/Skeleton';

/** 把条目插回原位（撤销用），下标夹在合法范围内。 */
function insertAt<T>(list: T[], item: T, index: number): T[] {
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

/** 我的收藏：收藏的同学档案 + 动态 / 日常帖子 */
export default function MeFavorites() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [tab, setTab] = useState<'member' | 'post'>('member');
  const [postSection, setPostSection] = useState<'feed' | 'daily'>('feed');
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  // 首屏骨架只显示一次：切分类会重复拉取，那时列表留在原地不闪骨架。
  const [initialLoading, setInitialLoading] = useState(true);
  const showSkeleton = useDelayedLoading(initialLoading);
  // 撤销/提交发生在 toast 的 5 秒窗口里，那时用户可能已切了分类；
  // 用 ref 记当前分类，只在还在同一分类下才动当前列表。
  const tabRef = useRef(tab);
  const postSectionRef = useRef(postSection);
  useEffect(() => {
    tabRef.current = tab;
    postSectionRef.current = postSection;
  }, [tab, postSection]);

  async function load(t: 'member' | 'post') {
    const { data } = await supabase.from('favorites')
      .select('target_id, created_at').eq('profile_id', me).eq('target_type', t)
      .order('created_at', { ascending: false });
    const rows = data ?? [];
    if (!rows.length) { setItems([]); setInitialLoading(false); return; }
    if (t === 'member') {
      // R1：普通成员直读他人 profiles 行会被 RLS 静默过滤，收藏的同学会整条消失，改走 member_directory RPC。
      const found = await fetchMembersByIds(rows.map(r => r.target_id));
      const m: Record<string, any> = {};
      Object.values(found).forEach((p) => { m[p.id] = p; });
      setItems(rows.map(r => ({ ...r, info: m[r.target_id] })).filter(r => r.info));
    } else {
      const { data: ps } = await supabase.from('posts').select('id, content, author_id, created_at, section').in('id', rows.map(r => Number(r.target_id))).eq('section', postSection).is('deleted_at', null);
      const m: Record<string, any> = {};
      (ps ?? []).forEach((p: any) => { m[String(p.id)] = p; });
      setItems(rows.map(r => ({ ...r, info: m[r.target_id] ?? null })));
    }
    setInitialLoading(false);
  }
  useEffect(() => { load(tab); }, [tab, postSection]);

  async function unFav(targetId: string) {
    const { error } = await supabase.from('favorites').delete()
      .eq('profile_id', me).eq('target_type', tab).eq('target_id', targetId);
    if (!error) load(tab); else setMsg('取消失败：' + error.message);
  }

  /** 左滑取消收藏的真正提交：删 favorites 行。只在 5 秒撤销窗口过去后调用。 */
  async function commitUnfav(r: any, capturedTab: 'member' | 'post', capturedSection: 'feed' | 'daily', index: number) {
    const { error } = await supabase.from('favorites').delete()
      .eq('profile_id', me).eq('target_type', capturedTab).eq('target_id', r.target_id);
    const sameView = tabRef.current === capturedTab
      && (capturedTab === 'member' || postSectionRef.current === capturedSection);
    if (error) {
      // 提交失败：还在同一分类就把条目放回原位，别让用户以为取消了其实还在。
      if (sameView) setItems(prev => insertAt(prev, r, index));
      setMsg('取消失败：' + error.message);
      return;
    }
    // 5 秒内用户可能切走又切回来、load 已把条目重新拉回列表，提交后要再拿掉它。
    if (sameView) setItems(prev => prev.filter(item => item.target_id !== r.target_id));
  }

  /**
   * 左滑取消收藏（延迟提交）：先只在界面上拿掉；
   * 5 秒内点 toast 上的“撤销”就放回原位，不点才真正删 favorites 行。
   */
  function swipeUnfav(r: any, index: number) {
    const capturedTab = tab;
    const capturedSection = postSection;
    setItems(prev => prev.filter(item => item.target_id !== r.target_id));
    showUndoToast({
      message: '已取消收藏',
      onUndo: () => {
        // 已切到别的分类就不原地恢复：那行还在库里，切回来时 load 会重新拉出。
        if (tabRef.current !== capturedTab) return;
        if (capturedTab === 'post' && postSectionRef.current !== capturedSection) return;
        setItems(prev => insertAt(prev, r, index));
      },
      onCommit: () => {
        void commitUnfav(r, capturedTab, capturedSection, index);
      },
    });
  }

  return (
    <div className="page" style={{ paddingBottom: 16 }}>
      <BackButton fallback="/me" />
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>我的收藏</h2>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {([['member', '同学档案'], ['post', '帖子收藏']] as const).map(([k, l]) => (
          <button key={k} className={'mini' + (tab === k ? '' : ' ghost')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'post' && <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className={'mini' + (postSection === 'feed' ? '' : ' ghost')} onClick={() => setPostSection('feed')}>动态</button>
        <button className={'mini' + (postSection === 'daily' ? '' : ' ghost')} onClick={() => setPostSection('daily')}>日常</button>
      </div>}
      {msg && <p className="priv-note">{msg}</p>}
      {showSkeleton && <RowSkeleton count={3} />}
      {!initialLoading && items.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>还没有收藏</div>}
      <MotionConfig reducedMotion="user">
        {items.map((r, index) => (
          <motion.div key={r.target_id} layout initial={false} transition={{ duration: 0.25, ease: 'easeOut' }}>
            <SwipeToDelete onSwipeDelete={() => swipeUnfav(r, index)}>
              <div className="card">
                {tab === 'member' ? (
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                      onClick={() => nav(`/members/${r.target_id}`)}>
                      {r.info.display_name || r.info.username}
                    </span>
                    <button className="mini ghost" onClick={() => unFav(r.target_id)}>取消收藏</button>
                  </div>
                ) : (
                  <>
                    {r.info ? <>
                      <div style={{ fontSize: 11.5, color: 'var(--mut)', marginBottom: 4 }}>{r.info.section === 'daily' ? '日常' : '动态'}</div>
                      <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{(r.info.content || '').slice(0, 120)}</div>
                      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>{(r.info.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="mini ghost" onClick={() => nav(r.info.section === 'daily' ? '/daily' : '/feed', { state: { searchQuery: String(r.info.content || '').slice(0, 32) } })}>查看原帖</button>
                          <button className="mini ghost" onClick={() => unFav(r.target_id)}>取消收藏</button>
                        </div>
                      </div>
                    </> : <>
                      <p style={{ fontSize: 13, color: 'var(--mut)', margin: '0 0 8px' }}>原帖已删除、设为不可见或当前无权查看。</p>
                      <button className="mini ghost" onClick={() => unFav(r.target_id)}>移除失效收藏</button>
                    </>}
                  </>
                )}
              </div>
            </SwipeToDelete>
          </motion.div>
        ))}
      </MotionConfig>
    </div>
  );
}
