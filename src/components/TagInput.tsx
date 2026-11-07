import { useState } from 'react';

/** 把存量字符串拆成标签：兼容顿号、逗号、斜杠、分号分隔。 */
export function splitTags(value: string): string[] {
  return value.split(/[、,，/；;]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * 标签输入：输入后按回车（或顿号/逗号）生成一个标签，每个标签带删除叉；
 * 草稿为空时按退格删掉最后一个标签。对外仍是顿号拼接的字符串，存储格式不变。
 */
export default function TagInput({ value, onChange, placeholder, maxTags = 10, maxLen = 12 }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxTags?: number;
  maxLen?: number;
}) {
  const tags = splitTags(value);
  const [draft, setDraft] = useState('');

  function commit(text: string) {
    const t = text.trim();
    setDraft('');
    if (!t) return;
    if (tags.length >= maxTags || tags.includes(t)) return;
    onChange([...tags, t].join('、'));
  }

  function remove(i: number) {
    const next = [...tags];
    next.splice(i, 1);
    onChange(next.join('、'));
  }

  return (
    <div className="tag-input">
      {tags.map((t, i) => (
        <span className="tag-chip" key={`${t}-${i}`}>
          {t}
          <button type="button" aria-label={`删除 ${t}`} onClick={() => remove(i)}>×</button>
        </span>
      ))}
      <input
        className="tag-draft"
        value={draft}
        maxLength={maxLen}
        placeholder={tags.length ? '' : placeholder}
        aria-label="添加标签"
        onChange={e => {
          const v = e.target.value;
          if (/[、,，]/.test(v)) commit(v.replace(/[、,，]/g, ''));
          else setDraft(v);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
          else if (e.key === 'Backspace' && !draft && tags.length) remove(tags.length - 1);
        }}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}
