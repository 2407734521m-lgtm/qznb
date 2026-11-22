import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { SPRING_GENTLE } from '../lib/motion';
import { logAppClick, type AppClickApp } from '../lib/appClicks';
import LargeTitleBar from '../components/LargeTitleBar';
import PullToRefresh from '../components/PullToRefresh';
import './Explore.css';
import bloomPhoto from '../assets/discover/card-bloom.jpg';
import inkPhoto from '../assets/discover/card-ink.jpg';
import hotPhoto from '../assets/discover/card-hot.jpg';
import questionsPhoto from '../assets/discover/card-questions.jpg';
import musicPhoto from '../assets/discover/card-music.jpg';
import signaturePhoto from '../assets/discover/card-signature.jpg';

type DiscoverCard = {
  to: string;
  external?: boolean;
  className: string;
  photo: string;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  // 单独软件入口卡才填：点一次记一次 entry_click（软件点击统计）。
  app?: AppClickApp;
};

const sections: {
  title: string;
  description: string;
  cards: DiscoverCard[];
}[] = [
  {
    title: '互动体验',
    description: '可以直接参与的轻量互动与创意体验。',
    cards: [
      {
        to: '/particle-flower',
        className: 'discover-card--bloom',
        photo: bloomPhoto,
        eyebrow: '互动体验',
        title: '指尖生花',
        description: '用手势画出一朵花，看看它如何回应你的动作。',
        action: '试试看',
      },
      {
        to: '/air-ink',
        className: 'discover-card--ink',
        photo: inkPhoto,
        eyebrow: '创作工具',
        title: '空中书写',
        description: '不需要触屏，在空中写下简单的笔画。',
        action: '开始创作',
      },
      {
        to: '/hot',
        className: 'discover-card--hot',
        photo: hotPhoto,
        eyebrow: '精选效果',
        title: '热门特效',
        description: '体验社区精选的网页互动效果。',
        action: '打开特效',
      },
    ],
  },
  {
    title: '创作空间',
    description: '制作作品，或进入独立的音乐空间。',
    cards: [
      {
        to: 'https://qianzhi.pw/signature/',
        external: true,
        className: 'discover-card--signature',
        photo: signaturePhoto,
        eyebrow: '创作工具',
        title: '动态签名',
        description: '逐笔书写中英文名字，切换字体并导出视频。',
        action: '开始写名',
        app: 'signature',
      },
      {
        to: '/music',
        className: 'discover-card--music',
        photo: musicPhoto,
        eyebrow: '独立音乐空间',
        title: '音乐',
        description: '搜索曲目、发现音乐，创建自己的播放体验。',
        action: '进入音乐空间',
        app: 'music',
      },
    ],
  },
];

export default function Explore() {
  const reduce = useReducedMotion();
  const handleRefresh = async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <motion.main
        className="discover-page"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <LargeTitleBar
          title="发现"
          subtitle="探索有趣的互动，发现新的玩法。"
          eyebrow="EXPLORE"
          eyebrowClassName="discover-eyebrow"
          headerClassName="discover-heading"
        />

        <Link to="/questions" className="discover-featured">
          <img src={questionsPhoto} alt="" aria-hidden="true" />
          <span className="discover-featured-shade" />
          <span className="discover-featured-copy">
            <span className="discover-featured-eyebrow">COMMUNITY · ANONYMOUS</span>
            <strong>匿名提问</strong>
            <span className="discover-featured-description">向成员匿名提问，也可以在自己的提问箱里回答。</span>
            <span className="discover-featured-action">进入提问箱 <span aria-hidden="true">↗</span></span>
          </span>
        </Link>

        {sections.map((section, sectionIndex) => (
          <section className="discover-section" key={section.title} aria-label={section.title}>
            <header className="discover-section-heading">
              <div>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </div>
              <span className="discover-section-count">{String(section.cards.length).padStart(2, '0')}</span>
            </header>

            <div className="discover-grid">
              {section.cards.map((card, cardIndex) => {
                const sequence = sectionIndex * 3 + cardIndex;
                const content = (
                  <>
                    <img
                      className="discover-photo"
                      src={card.photo}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      aria-hidden="true"
                    />
                    <span className="discover-card-copy">
                      <span className="discover-card-eyebrow">{card.eyebrow}</span>
                      <strong>{card.title}</strong>
                      <span className="discover-card-description">{card.description}</span>
                      <span className="discover-card-action">
                        {card.action}<span aria-hidden="true">↗</span>
                      </span>
                    </span>
                  </>
                );

                return (
                  <motion.article
                    key={card.to}
                    className={`discover-card ${card.className}`}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.12 }}
                    whileHover={reduce ? undefined : { y: -3 }}
                    whileTap={reduce ? undefined : { scale: 0.985 }}
                    transition={reduce ? { duration: 0.01 } : { ...SPRING_GENTLE, delay: sequence * 0.025 }}
                  >
                    {card.external
                      ? <a href={card.to} target="_blank" rel="noopener noreferrer" className="discover-card-link" onClick={() => { if (card.app) logAppClick(card.app, 'entry_click', 'explore'); }}>{content}</a>
                      : <Link to={card.to} className="discover-card-link" onClick={() => { if (card.app) logAppClick(card.app, 'entry_click', 'explore'); }}>{content}</Link>}
                  </motion.article>
                );
              })}
            </div>
          </section>
        ))}
      </motion.main>
    </PullToRefresh>
  );
}
