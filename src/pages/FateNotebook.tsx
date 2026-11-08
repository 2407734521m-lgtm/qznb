import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import './FateNotebook.css';

const FORTUNES = [
  '未来三天，你的好运值悄悄上升，排队时总能遇到刚刚好的空位。',
  '你将解锁隐藏技能：总能在最后一秒找到自己放下的东西。',
  '接下来的一周，某个小小的愿望会以意想不到的方式实现。',
  '今日关键词：准时下课、好天气，以及一首循环播放的歌。',
  '你会遇到一件值得开心的小事，记得把它收藏进回忆里。',
  '未来 24 小时，惊喜概率上升，奶茶也许会刚好少冰。',
  '你将获得「灵感突然上线」体验卡，有效期：今天。',
  '今天适合整理桌面，说不定会发现一件以为已经丢失的小物。',
  '你的下一次选择可能带来新发现，保持一点好奇心吧。',
  '隐藏成就已触发：在忙碌的一天里，也记得给自己一点休息时间。',
  '近期幸运提示：随机打开一本书，可能刚好读到喜欢的一句话。',
  '你将收到一份来自日常的小礼物：一个好消息、一阵风，或一段好音乐。',
];

type DrawResult = {
  name: string;
  fortune: string;
  id: number;
};

export default function FateNotebook() {
  const reduce = useReducedMotion();
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [sequence, setSequence] = useState(0);

  function drawFortune(): DrawResult | null {
    const value = name.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!value || !confirmed) return null;
    const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    const nextSequence = sequence + 1;
    setSequence(nextSequence);
    const next = { name: value, fortune, id: nextSequence };
    setResult(next);
    return next;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    drawFortune();
  }

  function drawAgain() {
    if (!result) return;
    const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    const nextSequence = sequence + 1;
    setSequence(nextSequence);
    setResult({ ...result, fortune, id: nextSequence });
  }

  return (
    <motion.main
      className="fate-page"
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="fate-page-heading">
        <Link to="/explore" className="fate-back-link" aria-label="返回发现">
          <span aria-hidden="true">←</span> 返回发现
        </Link>
        <span className="fate-heading-mark" aria-hidden="true">✳</span>
      </header>

      <section className="fate-book" aria-labelledby="fate-title">
        <div className="fate-book-spine" aria-hidden="true" />
        <div className="fate-book-topline">
          <span>THE FATE NOTE</span>
          <span>NO. 001</span>
        </div>
        <div className="fate-book-emblem" aria-hidden="true">
          <svg viewBox="0 0 72 72" width="58" height="58" fill="none">
            <path d="M12 18c10-4 18-3 24 1v38c-7-4-15-5-24-1V18Z" stroke="currentColor" strokeWidth="1.6" />
            <path d="M60 18c-10-4-18-3-24 1v38c7-4 15-5 24-1V18Z" stroke="currentColor" strokeWidth="1.6" />
            <path d="M36 19v38M19 27c5-2 9-1 12 1m-12 7c5-2 9-1 12 1m22-9c-5-2-9-1-12 1m12 7c-5-2-9-1-12 1" stroke="currentColor" strokeOpacity=".64" strokeLinecap="round" />
            <path d="m36 5 2.5 7.5L46 15l-7.5 2.5L36 25l-2.5-7.5L26 15l7.5-2.5L36 5Z" fill="currentColor" fillOpacity=".68" />
          </svg>
        </div>
        <div className="fate-book-title-wrap">
          <span className="fate-book-kicker">A LITTLE GAME OF DESTINY</span>
          <h1 id="fate-title">命运笔记</h1>
          <p>写下一个名字，翻开一页随机的命运小剧场。</p>
        </div>
        <div className="fate-book-rule" />
        <form className="fate-form" onSubmit={handleSubmit}>
          <label htmlFor="fate-name">写下一个虚构角色名或游戏昵称</label>
          <input
            id="fate-name"
            name="fate-name"
            type="text"
            value={name}
            onChange={event => { setName(event.target.value); setResult(null); }}
            maxLength={24}
            autoComplete="off"
            placeholder="例如：月球上的小猫"
            aria-describedby="fate-privacy-note"
          />
          <p className="fate-privacy-note" id="fate-privacy-note">
            请不要填写真实同学、老师或其他现实人物的姓名。输入内容只在当前页面临时使用，不会上传或保存。
          </p>
          <label className="fate-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
            />
            <span>我确认这是虚构角色或自设昵称，仅用于娱乐抽签。</span>
          </label>
          <button className="fate-draw-button" type="submit" disabled={!name.trim() || !confirmed}>
            <span aria-hidden="true">✦</span> 翻开命运判词
          </button>
        </form>
        {result && (
          <motion.section
            key={result.id}
            className="fate-result"
            aria-live="polite"
            initial={reduce ? false : { opacity: 0, y: 10, scale: .985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reduce ? 0 : .32 }}
          >
            <div className="fate-result-label">A FICTIONAL FORTUNE</div>
            <div className="fate-result-name">{result.name}</div>
            <p>{result.fortune}</p>
            <div className="fate-result-foot">纯属随机娱乐 · 不代表现实</div>
            <button type="button" className="fate-again-button" onClick={drawAgain}>
              再抽一次
            </button>
          </motion.section>
        )}
        <footer className="fate-book-footer">
          <span>FICTION ONLY</span>
          <span>FOR FUN · NOT REAL</span>
        </footer>
      </section>
      <p className="fate-page-footnote">这是一个虚构的随机小游戏，不会对任何人产生影响。</p>
    </motion.main>
  );
}
