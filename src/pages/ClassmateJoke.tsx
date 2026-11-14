import { useState } from 'react';
import './ClassmateJoke.css';

const chat = [
  { side: 'right', text: '现在做活动，可以免费领取' },
  { side: 'right', text: '送货上门？' },
  { side: 'left', text: '要助力吗' },
  { side: 'right', text: '不用，现在领取，全程免费' },
  { side: 'left', text: '链接在哪？这么好' },
  { side: 'right', text: '2:10 上链接，到时候发你' },
  { side: 'left', text: '那这娃有啥厉害的地方不？' },
  { side: 'right', text: '有的，到时候介绍页会写' },
];

const faqs = [
  { q: '这是一个真实活动吗？', a: '不是。这是同学之间聊天时临时编出来的玩笑页面，没有商品、奖品或领取入口。' },
  { q: '真的需要助力、转发或填写资料吗？', a: '完全不需要。页面不会收集助力、转发、联系方式或任何个人资料。' },
  { q: '海报什么时候出现？', a: '海报位置先保留着，等补上正式图片后，这里会显示完整的整活海报。' },
];

export default function ClassmateJoke() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main className="joke-page">
      <header className="joke-nav">
        <a className="joke-brand" href="/home"><span className="joke-brand-mark">Q</span><span>堯 · 小剧场</span></a>
        <span className="joke-nav-note">同学限定 / 纯属整活</span>
      </header>

      <section className="joke-hero">
        <div className="joke-hero-copy">
          <span className="joke-eyebrow"><i /> 本期特别企划 · 001</span>
          <h1>免费<br /><em>领娃</em></h1>
          <p>会聊天 · 只敲门，不开锁。全程免费，不用助力。</p>
          <a className="joke-primary" href="#story">看看活动详情 <span>↘</span></a>
          <div className="joke-meta"><span>CLASSMATE SPECIAL</span><span>JUST FOR FUN</span></div>
        </div>
        <div className="joke-poster-wrap">
          <div className="joke-poster-tag">活动主视觉 / 海报</div>
          <div className="joke-poster-placeholder">
            <div className="joke-poster-cross">✳</div>
            <div className="joke-poster-frame">
              <span className="joke-poster-small">LIMITED-TIME NONSENSE</span>
              <strong>免费<br /><b>领娃</b></strong>
              <span className="joke-poster-line" />
              <span className="joke-poster-sub">会聊天 · 只敲门，不开锁</span>
              <span className="joke-poster-foot">今晚 2:10 上链接，到时候发你</span>
            </div>
            <span className="joke-poster-stamp">JUST<br />FUN</span>
          </div>
          <p className="joke-poster-caption">海报主图已收到，后续会替换为完整海报。</p>
        </div>
        <span className="joke-hero-index">01 — 03</span>
      </section>

      <section className="joke-strip" aria-label="活动说明">
        <span>免费领取？</span><b>×</b><span>送货上门？</span><b>×</b><span>还要开门？</span><b>×</b><span>全是玩笑。</span>
      </section>

      <section className="joke-story" id="story">
        <div className="joke-section-head">
          <div><span className="joke-kicker">THE STORY</span><h2>事情是这样的。</h2></div>
          <p>聊天记录精选 · 经过整理<br />不代表真实商品或服务</p>
        </div>
        <div className="joke-chat-card">
          <div className="joke-chat-top"><span className="joke-chat-dot" /><span>同学聊天记录 · 节选</span><span className="joke-chat-lock">仅供娱乐</span></div>
          <div className="joke-chat-body">
            {chat.map((item, index) => (
              <div className={`joke-message joke-message--${item.side}`} key={index}>
                {item.side === 'left' && <span className="joke-avatar">同</span>}
                <span className="joke-bubble">{item.text}</span>
                {item.side === 'right' && <span className="joke-avatar joke-avatar--right">我</span>}
              </div>
            ))}
          </div>
          <div className="joke-chat-bottom">对话内容经过节选排版，人物头像与真实身份均不展示。</div>
        </div>
      </section>

      <section className="joke-explain">
        <div className="joke-explain-title"><span className="joke-kicker">THE BIG QUESTION</span><h2>所以，到底能领到什么？</h2></div>
        <div className="joke-answer"><span>答案揭晓</span><strong>一个快乐。</strong><p>没有神秘链接，没有隐藏条件，也没有真正的免费领取。主打一个气氛先到，东西暂时没有。</p></div>
      </section>

      <section className="joke-faq">
        <div className="joke-section-head"><div><span className="joke-kicker">A LITTLE NOTE</span><h2>友情提示</h2></div><p>玩笑归玩笑<br />边界还是要说明白</p></div>
        <div className="joke-faq-list">
          {faqs.map((item, index) => (
            <button className={`joke-faq-item ${openFaq === index ? 'is-open' : ''}`} key={item.q} onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}>
              <span className="joke-faq-number">0{index + 1}</span><span className="joke-faq-content"><strong>{item.q}</strong>{openFaq === index && <small>{item.a}</small>}</span><span className="joke-faq-toggle">{openFaq === index ? '−' : '+'}</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="joke-footer"><span className="joke-brand-mark">Q</span><div><strong>本页面仅供同学间娱乐</strong><small>非真实活动 · 非商业推广 · 请勿当真</small></div><a href="/home">返回首页 ↑</a></footer>
    </main>
  );
}
