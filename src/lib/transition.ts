// 共享元素过渡（FLIP）：只用 transform / opacity / border-radius，GPU 加速，60fps。
// 用法：列表页点击卡片时 setShot({img, rect...})；详情页挂载后 takeShot() 并 flyTo(目标元素)。

export type Dir = 'left' | 'right' | 'down';

export type Shot = {
  img: string;          // 照片 URL（无照片时传空字符串，用首字占位飞）
  x: number; y: number; // 视口坐标
  w: number; h: number;
  r: number;            // 起始圆角 px
  key?: string;         // 业务标识（如成员 id），用于返回时定位目标
  dir?: Dir;            // 飞入方向：left / right / down
  label?: string;       // 无照片时的首字占位（如名字）
};

let pending: Shot | null = null;
export function setShot(s: Shot | null) { pending = s; }
export function takeShot(): Shot | null { const s = pending; pending = null; return s; }

export function shotFrom(el: HTMLElement, img: string, label?: string): Shot | null {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  const cs = getComputedStyle(el);
  return { img, x: r.x, y: r.y, w: r.width, h: r.height, r: parseFloat(cs.borderRadius) || 0, label };
}

/** 让一个"幽灵"照片从 shot 位置飞到 target 元素的位置/大小。 */
export function flyTo(shot: Shot, target: HTMLElement, opts?: { duration?: number; onDone?: () => void }) {
  const tr = target.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'fly-clone';
  if (shot.img) {
    const img = document.createElement('img');
    img.src = shot.img;
    img.alt = '';
    ghost.appendChild(img);
  } else {
    // 无照片：用名字首字占位，照样飞
    const fb = document.createElement('div');
    fb.className = 'fly-letter';
    fb.textContent = (shot.label || '?').slice(0, 1).toUpperCase();
    ghost.appendChild(fb);
  }
  ghost.style.left = shot.x + 'px';
  ghost.style.top = shot.y + 'px';
  ghost.style.width = shot.w + 'px';
  ghost.style.height = shot.h + 'px';
  ghost.style.borderRadius = shot.r + 'px';
  document.body.appendChild(ghost);

  const dx = tr.x + tr.width / 2 - (shot.x + shot.w / 2);
  const dy = tr.y + tr.height / 2 - (shot.y + shot.h / 2);
  const sx = tr.width / shot.w;
  const sy = tr.height / shot.h;
  const targetR = getComputedStyle(target).borderRadius || '0px';
  const dur = opts?.duration ?? 620;
  // 方向性中途点：left/right/down 让照片带一点弧线甩入
  const off = shot.dir === 'left' ? [-56, 0] : shot.dir === 'right' ? [56, 0] : [0, 56];
  const mx = dx * 0.55 + off[0], my = dy * 0.55 + off[1];
  const msx = 1 + (sx - 1) * 0.55, msy = 1 + (sy - 1) * 0.55;
  try {
    const anim = ghost.animate(
      [
        { transform: 'translate(0px,0px) scale(1,1)', borderRadius: shot.r + 'px', opacity: 1 },
        { transform: `translate(${mx}px,${my}px) scale(${msx},${msy})`, borderRadius: shot.r + 'px', opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, borderRadius: targetR, opacity: 1 },
      ],
      { duration: dur, easing: 'cubic-bezier(0.32,0.72,0,1)', fill: 'forwards' }
    );
    anim.onfinish = () => { ghost.remove(); opts?.onDone?.(); };
    // 兜底：动画事件没触发也清理
    setTimeout(() => { ghost.remove(); }, dur + 300);
  } catch {
    ghost.remove();
    opts?.onDone?.();
  }
}
