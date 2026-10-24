import { Link } from 'react-router-dom';

const groups = [
  { title: '班级', desc: '认识同学，记录共同经历', items: [['成员档案','/members','查看班级成员与个人主页'],['班级时间线','/timeline','回看一起走过的日子'],['班级活动','/events','查看活动与安排']] },
  { title: '互动', desc: '和同学保持联系', items: [['动态广场','/feed','分享近况与照片'],['好友与私聊','/friends','找到好友并发送消息'],['心动信箱','/love-wall','匿名或署名表达心意'],['祝福留言','/greetings','给同学送上祝福']] },
  { title: '回忆', desc: '珍藏属于我们的片段', items: [['时光胶囊','/capsule','把记忆留给未来'],['班级时间线','/timeline','浏览重要时刻'],['祝福与心愿','/wishes','记录愿望与寄语'],['热门特效','/hot','发现趣味互动']] },
  { title: '个人', desc: '管理自己的班级档案', items: [['我的主页','/me','查看个人中心'],['编辑资料','/me/edit','更新个人档案'],['我的收藏','/me/favorites','找回收藏内容'],['通知消息','/me/notifications','查看站内通知'],['账号设置','/me/account','管理账号信息']] },
];
export default function Explore() {
  return <main style={{ maxWidth: 850, margin: '0 auto', padding: '12px 0 28px', color: '#f5f6ff' }}>
    <div style={{ padding: '18px 4px 20px' }}><div style={{ color: '#9daeff', fontSize: 11, letterSpacing: 3 }}>DISCOVER YOUR CLASS</div><h1 style={{ fontSize: 27, margin: '8px 0' }}>探索空间</h1><p style={{ color: '#aeb5cf', fontSize: 13 }}>按分类找到你想去的地方。</p></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,270px),1fr))', gap: 14 }}>
      {groups.map(g => <section key={g.title} style={{ border: '1px solid #ffffff18', borderRadius: 20, padding: 16, background: 'linear-gradient(145deg,#171e33dd,#0d1222dd)' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{g.title}</h2><p style={{ margin: '0 0 12px', color: '#9da6c3', fontSize: 12 }}>{g.desc}</p>
        {g.items.map(([name,to,desc]) => <Link key={to+name} to={to} style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: '12px 2px', borderTop: '1px solid #ffffff0d' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: 700 }}>{name}<span style={{ color: '#a7b5ff' }}>↗</span></div><div style={{ color: '#969fbc', fontSize: 11, marginTop: 4 }}>{desc}</div></Link>)}
      </section>)}
    </div>
  </main>;
}
