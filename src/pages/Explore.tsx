import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import './Explore.css';

const cards = [
  {
    to: '/particle-flower',
    className: 'discover-card--bloom',
    eyebrow: '互动体验',
    title: '指尖生花',
    description: '用手势画出一朵花，看看它如何回应你的动作。',
    action: '试试看',
  },
  {
    to: '/air-ink',
    className: 'discover-card--ink',
    eyebrow: '创作工具',
    title: '空中书写',
    description: '不需要触屏，在空中写下简单的笔画。',
    action: '开始创作',
  },
  {
    to: '/hot',
    className: 'discover-card--hot',
    eyebrow: '社区话题',
    title: '热门话题',
    description: '最近大家关注的话题，都在这里。',
    action: '查看话题',
  },
  {
    to: '/love-wall',
    className: 'discover-card--love',
    eyebrow: '表白墙',
    title: '表白墙',
    description: '把喜欢、感谢和没来得及说的话，认真地留在这里。',
    action: '写下心意',
  },
  {
    to: '/fate-notebook',
    className: 'discover-card--fate',
    eyebrow: '趣味玩法',
    title: '命运笔记',
    description: '写下虚构角色的名字，看看会抽到什么有趣结果。',
    action: '翻开笔记',
  },
];

function BloomArtwork() {
  return (
    <svg className="discover-art discover-art--bloom" viewBox="0 0 360 260" fill="none" aria-hidden="true">
      <path d="M180 230C178 179 190 139 221 101" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M188 170C142 162 112 135 104 98C143 101 173 123 188 170Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeOpacity=".52" strokeWidth="1.4" />
      <path d="M199 143C222 105 255 91 291 102C271 133 240 151 199 143Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeOpacity=".48" strokeWidth="1.4" />
      <path d="M214 112C197 84 197 54 217 29C238 53 239 85 214 112Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.4" />
      <path d="M199 113C169 101 153 78 158 49C187 59 204 81 199 113Z" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.4" />
      <path d="M226 118C237 83 261 65 292 70C279 99 256 117 226 118Z" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.4" />
      <path d="M75 58l5 12 12 5-12 5-5 12-5-12-12-5 12-5 5-12ZM302 164l4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Z" fill="currentColor" fillOpacity=".55" />
      <path d="M122 205c14-8 24-9 38-3M268 42l8-8m-4 17 12-2" stroke="currentColor" strokeOpacity=".44" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InkArtwork() {
  return (
    <svg className="discover-art discover-art--ink" viewBox="0 0 280 190" fill="none" aria-hidden="true">
      <path d="M20 128C48 78 56 75 78 111S111 158 131 90 166 27 180 75 213 141 258 48" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 151C57 124 71 128 92 142S130 162 156 123 201 90 245 105" stroke="currentColor" strokeOpacity=".38" strokeWidth="2" strokeLinecap="round" />
      <path d="M37 48l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8ZM224 19l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="currentColor" fillOpacity=".58" />
      <circle cx="190" cy="153" r="4" fill="currentColor" fillOpacity=".4" />
    </svg>
  );
}

function LoveArtwork() {
  return (
    <svg className="discover-art discover-art--love" viewBox="0 0 300 190" fill="none" aria-hidden="true">
      <path d="M150 151 68 78c-24-22-22-59 5-72 26-13 57-1 77 23 20-24 51-36 77-23 27 13 29 50 5 72l-82 73Z"
        fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeOpacity=".74" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M150 128 87 72c-15-13-15-34 1-43 17-9 36-1 48 14m28 29c12-15 31-23 48-14"
        stroke="currentColor" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m45 35 4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Zm211 87 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"
        fill="currentColor" fillOpacity=".62" />
      <path d="M90 157c17 7 33 10 51 10m73-18c-12 7-24 11-37 13"
        stroke="currentColor" strokeOpacity=".42" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FateArtwork() {
  return (
    <svg className="discover-art discover-art--fate" viewBox="0 0 300 190" fill="none" aria-hidden="true">
      <path d="M150 49c-34-17-67-17-99-5v101c32-12 65-12 99 5V49Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeOpacity=".72" strokeWidth="2" />
      <path d="M150 49c34-17 67-17 99-5v101c-32-12-65-12-99 5V49Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeOpacity=".72" strokeWidth="2" />
      <path d="M150 49v101M72 73c21-6 42-5 61 2m-61 18c21-6 42-5 61 2m45-20c19-7 40-8 61-2m-61 20c19-7 40-8 61-2" stroke="currentColor" strokeOpacity=".48" strokeWidth="2" strokeLinecap="round" />
      <path d="m43 32 4 9 10 4-10 4-4 10-4-10-10-4 10-4 4-9Zm215 105 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" fill="currentColor" fillOpacity=".64" />
    </svg>
  );
}

function HotArtwork() {
  return (
    <svg className="discover-art discover-art--hot" viewBox="0 0 300 190" fill="none" aria-hidden="true">
      <path d="M42 45h122a15 15 0 0 1 15 15v42a15 15 0 0 1-15 15H91l-25 18v-18h-9a15 15 0 0 1-15-15V60a15 15 0 0 1 15-15Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeOpacity=".36" strokeWidth="1.5" />
      <path d="M88 88h50M88 70h30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeOpacity=".56" />
      <path d="M142 92h98a13 13 0 0 1 13 13v30a13 13 0 0 1-13 13h-10v15l-21-15h-67a13 13 0 0 1-13-13v-30a13 13 0 0 1 13-13Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeOpacity=".46" strokeWidth="1.5" />
      <path d="M163 119h50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeOpacity=".6" />
      <path d="m226 26 5 11 11 5-11 5-5 11-5-11-11-5 11-5 5-11Z" fill="currentColor" fillOpacity=".58" />
    </svg>
  );
}

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
            whileHover={reduce ? undefined : { y: -4 }}
            whileTap={reduce ? undefined : { scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link to={card.to} className="discover-card-link">
              <div className="discover-card-copy">
                <span className="discover-card-eyebrow">{card.eyebrow}</span>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
                <span className="discover-card-action">{card.action}<span aria-hidden="true">↗</span></span>
              </div>
              {index === 0 && <BloomArtwork />}
              {index === 1 && <InkArtwork />}
              {index === 2 && <HotArtwork />}
              {card.to === '/love-wall' && <LoveArtwork />}
              {card.to === '/fate-notebook' && <FateArtwork />}
            </Link>
          </motion.article>
        ))}
      </section>
    </motion.main>
  );
}
