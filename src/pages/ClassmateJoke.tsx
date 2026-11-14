import { useState } from 'react';
import './ClassmateJoke.css';

const highlights = [
  { icon: '💬', title: '会聊天', detail: '陪你聊天' },
  { icon: '🚪', title: '会敲门', detail: '只敲门' },
  { icon: '🔒', title: '不开锁', detail: '少项技能' },
  { icon: '😇', title: '保证不炸', detail: '善良好娃' },
];

const chat = [
  { side: 'right', text: '现在做活动，可以免费领取' },
  { side: 'right', text: '送货上门' },
  { side: 'left', text: '要助力吗？' },
  { side: 'right', text: '不用，现在领取，全程免费' },
  { side: 'left', text: '链接在哪？这么好' },
  { side: 'right', text: '2:10 上链接，到时候发你' },
  { side: 'left', text: '那这娃有啥厉害的地方不？' },
  { side: 'right', text: '有的，介绍页会写' },
];

const faqs = [
  { q: '这是一个真实活动吗？', a: '不是。这是同学之间聊天时开的玩笑，没有真实商品、领取服务或交易。' },
  { q: '真的有领取链接吗？', a: '没有真实领取入口。“2:10 上链接”只是聊天里的玩笑内容，不需要助力、转发或填写资料。' },
  { q: '页面会收集个人信息吗？', a: '不会。本页面没有报名、领取或资料提交功能。' },
];

export default function ClassmateJoke() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main className="joke-page">
      <header className="joke-nav">
        <a className="joke-brand" href="/home" aria-label="返回堯首页">
          <span className="joke-brand-mark">Q</span><span>堯 · 小剧场</span>
        </a>
        <span className="joke-nav-note">同学限定 / 纯属整活</span>
      </header>

      <section className="joke-hero">
        <div className="joke-hero-heading">
          <span className="joke-eyebrow"><i /> CLASSMATE SPECIAL · 001</span>
          <h1>一场宣传得<br /><em>很认真的玩笑。</em></h1>
          <p>从一句“现在做活动”开始，越说越像真的。于是，我们干脆给它做了个正式介绍页。</p>
          <a className="joke-primary" href="#details">往下看看 <span>↓</span></a>
          <div className="joke-disclaimer">纯属同学间娱乐 · 非真实活动</div>
        </div>
        <figure className="joke-poster-wrap">
          <img
            className="joke-poster-image"
            src="/images/classmate-joke-poster.webp"
            alt="免费领娃主题玩笑海报，暖米色背景与酒红色标题"
            fetchPriority="high"
            decoding="async"
          />
          <figcaption>本期主视觉 · 原创整活海报</figcaption>
        </figure>
      </section>

      <section className="joke-details" id="details">
        <div className="joke-section-head">
          <div><span className="joke-kicker">THE FEATURE LIST</span><h2>活动亮点，主打一个离谱。</h2></div>
          <p>按海报内容整理<br />请勿当成真实服务</p>
        </div>
        <div className="joke-feature-grid">
          {highlights.map((item) => (
            <article className="joke-feature" key={item.title}>
              <span className="joke-feature-icon" aria-hidden="true">{item.icon}</span>
              <span className="joke-feature-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
            </article>
          ))}
        </div>
        <div className="joke-price-row">
          <div className="joke-price"><strong>¥0</strong><span>全程免费</span></div>
          <p>送货上门 · 不用助力</p>
        </div>
        <div className="joke-time-banner">
          <div><strong>今晚 2:10 上链接</strong><span>到时候发你，记得开门</span></div>
          <small>JUST FOR FUN</small>
        </div>
      </section>

      <section className="joke-story">
        <div className="joke-section-head">
          <div><span className="joke-kicker">THE STORY</span><h2>事情是怎么开始的？</h2></div>
          <p>聊天内容节选<br />仅用于还原玩笑语境</p>
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
          <div className="joke-chat-bottom">对话为节选整理，不展示真实头像或身份信息。</div>
        </div>
      </section>

      <section className="joke-reveal">
        <span className="joke-kicker">THE REAL ANSWER</span>
        <h2>所以，到底能领到什么？</h2>
        <strong>一个快乐。</strong>
        <p>没有神秘链接，没有隐藏条件，也没有真正的免费领取。宣传可以很认真，玩笑也要讲清楚。</p>
      </section>

      <section className="joke-faq">
        <div className="joke-section-head">
          <div><span className="joke-kicker">A LITTLE NOTE</span><h2>友情提示</h2></div>
          <p>玩笑归玩笑<br />边界还是要说明白</p>
        </div>
        <div className="joke-faq-list">
          {faqs.map((item, index) => (
            <button className={`joke-faq-item ${openFaq === index ? 'is-open' : ''}`} key={item.q} onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}>
              <span className="joke-faq-number">0{index + 1}</span>
              <span className="joke-faq-content"><strong>{item.q}</strong>{openFaq === index && <small>{item.a}</small>}</span>
              <span className="joke-faq-toggle" aria-hidden="true">{openFaq === index ? '−' : '+'}</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="joke-footer">
        <span className="joke-brand-mark">Q</span>
        <div><strong>本页面仅供同学间娱乐</strong><small>非真实活动 · 非商业推广 · 请勿当真</small></div>
        <a href="/home">返回首页 ↑</a>
      </footer>
    </main>
  );
}
