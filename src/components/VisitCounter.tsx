import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './VisitCounter.css';

const COUNT_KEY = 'qz_visit_counted_v1';
const PAGE_KEY = 'qianzhi-site';

// 全站打开人数：同一浏览器只计一次（localStorage 标记），数字存 Supabase 的 page_views。
// 登录页和首页都挂它，谁打开网站都能看见；计数失败时什么都不显示，不打扰页面。
export default function VisitCounter({ fixed = false }: { fixed?: boolean }) {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let counted = false;
        try { counted = !!localStorage.getItem(COUNT_KEY); } catch { /* 读不到就按没计过处理 */ }
        // 先落标记再请求，避免登录页和首页同时挂载时重复计数
        if (!counted) { try { localStorage.setItem(COUNT_KEY, '1'); } catch { /* 写不进也不影响显示 */ } }
        const { data, error } = counted
          ? await supabase.rpc('get_page_views', { p_key: PAGE_KEY })
          : await supabase.rpc('bump_page_view', { p_key: PAGE_KEY });
        if (!live || error || typeof data !== 'number') return;
        setN(data);
      } catch { /* 计数失败不打扰页面 */ }
    })();
    return () => { live = false; };
  }, []);

  if (n === null) return null;
  return (
    <p className={fixed ? 'visit-counter visit-counter--fixed' : 'visit-counter'}>
      已有 {n} 人打开过这个网站
    </p>
  );
}
