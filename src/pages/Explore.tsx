import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { SPRING_GENTLE } from '../lib/motion';
import './Explore.css';
import bloomPhoto from '../assets/discover/card-bloom.jpg';
import inkPhoto from '../assets/discover/card-ink.jpg';
import hotPhoto from '../assets/discover/card-hot.jpg';
import lovePhoto from '../assets/discover/card-love.jpg';
import questionsPhoto from '../assets/discover/card-questions.jpg';
import musicPhoto from '../assets/discover/card-music.jpg';
import radioPhoto from '../assets/discover/card-radio.jpg';
import fatePhoto from '../assets/discover/card-fate.jpg';

const cards = [
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
    eyebrow: '社区话题',
    title: '热门话题',
    description: '最近大家关注的话题，都在这里。',
    action: '查看话题',
  },
  {
    to: '/love-wall',
    className: 'discover-card--love',
    art: 'love',
    photo: lovePhoto,
    eyebrow: '表白墙',
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
  {
    to: 'https://music.qianzhi.pw',
    external: true,
    className: 'discover-card--music',
    art: 'music',
    photo: musicPhoto,
    eyebrow: '独立音乐空间',
    title: '音乐',
    description: '发现音乐、搜索曲目，创建属于自己的播放体验。',
    action: '进入音乐空间',
  },
  {
    to: 'https://radio.qianzhi.pw',
    external: true,
    className: 'discover-card--radio',
    art: 'radio',
    photo: radioPhoto,
    eyebrow: '沉浸式电台',
    title: '3D 电台',
    description: '在视觉舞台与 3D 唱片架之间听歌，建议横屏打开。',
    action: '进入电台',
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
];

export default function Explore() {
  const reduce = useReducedMotion();

  return (
    <motion.main
      className="discover-page"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="discover-heading">
        <div>
          <span className="discover-eyebrow">探索</span>
          <h1>发现</h1>
          <p>一些可以体验、参与和分享的内容。</p>
        </div>
        
      </header>

      <section className="discover-bento" aria-label="探索体验">
        {cards.map((card, index) => (
          <motion.article
            key={card.to}
            className={`discover-card ${card.className}`}
            initial={reduce ? false : { opacity: 0, y: 20, scale: 0.985 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.18 }}
            whileHover={reduce ? undefined : { y: -5, scale: 1.006 }}
            whileTap={reduce ? undefined : { scale: 0.985 }}
            transition={reduce
              ? { duration: 0.01 }
              : { ...SPRING_GENTLE, delay: index * 0.045 }}
          >
            {(() => {
              const content = (
                <>
                  <div className="discover-card-copy">
                    <span className="discover-card-eyebrow">{card.eyebrow}</span>
                    <h2>{card.title}</h2>
                    <p>{card.description}</p>
                    <span className="discover-card-action">{card.action}<span aria-hidden="true">↗</span></span>
                  </div>
                  <img
                    className={`discover-photo discover-photo--${card.art}`}
                    src={card.photo}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    aria-hidden="true"
                  />
                </>
              );
              return card.to.startsWith('https://')
                ? <a href={card.to} target="_blank" rel="noopener noreferrer" className="discover-card-link">{content}</a>
                : <Link to={card.to} className="discover-card-link">{content}</Link>;
            })()}
          </motion.article>
        ))}
      </section>
    </motion.main>
  );
}
