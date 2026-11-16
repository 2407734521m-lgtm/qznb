import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { SPRING_GENTLE } from '../lib/motion';
import { useTiltCard } from '../components/fx/TiltCard';
import './Explore.css';
import bloomPhoto from '../assets/discover/card-bloom.jpg';
import inkPhoto from '../assets/discover/card-ink.jpg';
import hotPhoto from '../assets/discover/card-hot.jpg';
import lovePhoto from '../assets/discover/card-love.jpg';
import questionsPhoto from '../assets/discover/card-questions.jpg';
import musicPhoto from '../assets/discover/card-music.jpg';
import signaturePhoto from '../assets/discover/card-signature.jpg';
import fatePhoto from '../assets/discover/card-fate.jpg';

type DiscoverCard = {
  to: string;
  external?: boolean;
  className: string;
  art: string;
  photo: string;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
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
        art: 'bloom',
        photo: bloomPhoto,
        eyebrow: '互动体验',
        title: '指尖生花',
        description: '用手势画出一朵花，看看它如何回应你的动作。',
        action: '试试看',
      },
      {
        to: '/air-ink',
        className: 'discover-card--ink',
        art: 'ink',
        photo: inkPhoto,
        eyebrow: '创作工具',
        title: '空中书写',
        description: '不需要触屏，在空中写下简单的笔画。',
        action: '开始创作',
      },
      {
        to: '/hot',
        className: 'discover-card--hot',
        art: 'hot',
        photo: hotPhoto,
        eyebrow: '精选效果',
        title: '热门特效',
        description: '体验社区精选的网页互动效果。',
        action: '打开特效',
      },
    ],
  },
  {
    title: '社区互动',
    description: '浏览话题、表达心意，也可以匿名交流。',
    cards: [
      {
        to: '/topics',
        className: 'discover-card--topics',
        art: 'topics',
        photo: questionsPhoto,
        eyebrow: '社区话题',
        title: '话题广场',
        description: '从成员动态里的标签，发现大家正在聊什么。',
        action: '探索话题',
      },
      {
        to: '/love-wall',
        className: 'discover-card--love',
        art: 'love',
        photo: lovePhoto,
        eyebrow: '社区互动',
        title: '表白墙',
        description: '把喜欢、感谢和没来得及说的话，认真地留在这里。',
        action: '写下心意',
      },
      {
        to: '/questions',
        className: 'discover-card--questions',
        art: 'questions',
        photo: questionsPhoto,
        eyebrow: '匿名互动',
        title: '匿名提问',
        description: '向成员匿名提问，也可以在自己的提问箱里回答。',
        action: '打开提问箱',
      },
    ],
  },
  {
    title: '创作与娱乐',
    description: '制作一点作品，或进入独立的音乐空间。',
    cards: [
      {
        to: 'https://qianzhi.pw/signature/',
        external: true,
        className: 'discover-card--signature',
        art: 'signature',
        photo: signaturePhoto,
        eyebrow: '创作工具',
        title: '动态签名',
        description: '中文、英文都能逐笔写出，可切换字体并导出视频。',
        action: '开始写名',
      },
      {
        to: '/music',
        className: 'discover-card--music',
        art: 'music',
        photo: musicPhoto,
        eyebrow: '独立音乐空间',
        title: '音乐',
        description: '搜索曲目、发现音乐，创建自己的播放体验。',
        action: '进入音乐空间',
      },
      {
        to: '/fate-notebook',
        className: 'discover-card--fate',
        art: 'fate',
        photo: fatePhoto,
        eyebrow: '趣味玩法',
        title: '命运笔记',
        description: '写下虚构角色的名字，看看会抽到什么有趣结果。',
        action: '翻开笔记',
      },
    ],
  },
];

export default function Explore() {
  const reduce = useReducedMotion();
  // 只给第一张卡保留轻量倾斜反馈；触摸设备和减少动态效果时自动关闭。
  const tilt = useTiltCard();

  return (
    <motion.main
      className="discover-page"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="discover-heading">
        <span className="discover-eyebrow">EXPLORE</span>
        <h1>发现</h1>
        <p>一些可以体验、参与和分享的内容。</p>
      </header>

      {sections.map((section, sectionIndex) => (
        <section className="discover-section" key={section.title} aria-label={section.title}>
          <header className="discover-section-heading">
            <span className="discover-section-index">{String(sectionIndex + 1).padStart(2, '0')}</span>
            <div>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
          </header>

          <div className="discover-grid">
            {section.cards.map((card, cardIndex) => {
              const sequence = sectionIndex * 3 + cardIndex;
              const content = (
                <>
                  <img
                    className={`discover-photo discover-photo--${card.art}`}
                    src={card.photo}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    aria-hidden="true"
                  />
                  <div className="discover-card-copy">
                    <span className="discover-card-eyebrow">{card.eyebrow}</span>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                    <span className="discover-card-action">
                      {card.action}
                      <span aria-hidden="true">↗</span>
                    </span>
                  </div>
                </>
              );

              return (
                <motion.article
                  key={card.to}
                  className={`discover-card ${card.className}`}
                  style={sequence === 0 ? tilt.tiltStyle : undefined}
                  onPointerMove={sequence === 0 && tilt.enabled ? tilt.onPointerMove : undefined}
                  onPointerLeave={sequence === 0 && tilt.enabled ? tilt.onPointerLeave : undefined}
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.16 }}
                  whileHover={reduce ? undefined : { y: -4 }}
                  whileTap={reduce ? undefined : { scale: 0.985 }}
                  transition={reduce
                    ? { duration: 0.01 }
                    : { ...SPRING_GENTLE, delay: sequence * 0.035 }}
                >
                  {card.external
                    ? <a href={card.to} target="_blank" rel="noopener noreferrer" className="discover-card-link">{content}</a>
                    : <Link to={card.to} className="discover-card-link">{content}</Link>}
                </motion.article>
              );
            })}
          </div>
        </section>
      ))}
    </motion.main>
  );
}
