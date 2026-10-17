import { SOCIAL_PLATFORMS, parseSocial, buildSocial, type SocialItem } from '../data/social';

// 社交平台选择器：点选平台 → 逐个填写账号
export default function SocialPicker({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const items = parseSocial(value);

  function setItems(next: SocialItem[]) { onChange(buildSocial(next)); }
  function add(p: string) { setItems([...items, { p, a: '' }]); }
  function edit(i: number, a: string) {
    const next = items.slice(); next[i] = { ...next[i], a }; setItems(next);
  }
  function remove(i: number) { setItems(items.filter((_, j) => j !== i)); }

  const rest = SOCIAL_PLATFORMS.filter(s => !items.some(it => it.p === s.name));

  return (
    <div className="socpick">
      {items.map((it, i) => (
        <div key={i} className="socrow ganim" style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}>
          <span className="socp">{it.p || '账号'}</span>
          <input value={it.a} onChange={e => edit(i, e.target.value)} placeholder="填写账号" maxLength={100} />
          <button type="button" className="mini ghost" onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      {rest.length > 0 && (
        <div className="rankgrid">
          {rest.map(s => (
            <button key={s.name} type="button" className="rankchip" onClick={() => add(s.name)}>
              {s.icon} {s.name} ＋
            </button>
          ))}
        </div>
      )}
      {items.length === 0 && rest.length === 0 && null}
    </div>
  );
}
