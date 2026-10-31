// 市面上主流游戏库：段位按从低到高排列；ranks 为空表示该游戏无排位段位
export type Game = { name: string; icon: string; ranks: string[] };

export const GAMES: Game[] = [
  { name: '王者荣耀', icon: '👑', ranks: ['倔强青铜', '秩序白银', '荣耀黄金', '尊贵铂金', '永恒钻石', '至圣星耀', '最强王者', '荣耀王者'] },
  { name: '和平精英', icon: '🎯', ranks: ['青铜', '白银', '黄金', '铂金', '星钻', '皇冠', '王牌', '战神'] },
  { name: '英雄联盟', icon: '⚔️', ranks: ['黑铁', '青铜', '白银', '黄金', '铂金', '翡翠', '钻石', '大师', '宗师', '王者'] },
  { name: '英雄联盟手游', icon: '📱', ranks: ['黑铁', '青铜', '白银', '黄金', '铂金', '翡翠', '钻石', '大师', '宗师', '王者'] },
  { name: '无畏契约', icon: '🔫', ranks: ['黑铁', '青铜', '白银', '黄金', '铂金', '钻石', '超凡', '神话'] },
  { name: '三角洲行动', icon: '🪖', ranks: ['青铜', '白银', '黄金', '铂金', '钻石', '大师', '宗师', '战神'] },
  { name: '暗区突围', icon: '🎒', ranks: ['新锐', '尖锐', '资深', '精英', '专家', '大师', '宗师', '传奇'] },
  { name: '穿越火线', icon: '💥', ranks: ['新锐', '精英', '专家', '大师', '宗师', '传奇', '枪王', '荣耀枪王'] },
  { name: '穿越火线：枪战王者', icon: '🔥', ranks: ['新锐', '精英', '专家', '大师', '宗师', '传奇', '枪王', '荣耀枪王'] },
  { name: '使命召唤手游', icon: '🎖️', ranks: ['新秀', '精英', '专家', '大师', '宗师', '传奇'] },
  { name: '金铲铲之战', icon: '♟️', ranks: ['黑铁', '青铜', '白银', '黄金', '铂金', '翡翠', '钻石', '大师', '宗师', '王者'] },
  { name: '第五人格', icon: '🎭', ranks: ['一阶', '二阶', '三阶', '四阶', '五阶', '六阶', '七阶', '巅峰七阶'] },
  { name: '蛋仔派对', icon: '🥚', ranks: ['鹌鹑蛋', '鸽子蛋', '鸡蛋', '鹅蛋', '鸵鸟蛋', '恐龙蛋', '凤凰蛋'] },
  { name: '元梦之星', icon: '🌟', ranks: ['青铜', '白银', '黄金', '铂金', '钻石', '星耀', '王者'] },
  { name: 'QQ飞车', icon: '🏎️', ranks: ['青铜', '白银', '黄金', '铂金', '钻石', '星耀', '车神'] },
  { name: 'QQ飞车手游', icon: '🚗', ranks: ['青铜', '白银', '黄金', '铂金', '钻石', '星耀', '车神'] },
  { name: '火影忍者手游', icon: '🍥', ranks: ['下忍', '中忍', '上忍', '暗部', '影'] },
  { name: '荒野乱斗', icon: '🤠', ranks: ['青铜', '白银', '黄金', '钻石', '神话', '传奇', '大师'] },
  { name: 'CS2', icon: '💣', ranks: ['白银', '黄金新星', '大师精英', '传奇之鹰', '全球精英'] },
  { name: 'Apex英雄', icon: '🪂', ranks: ['青铜', '白银', '黄金', '铂金', '钻石', '大师', '猎杀者'] },
  { name: 'PUBG', icon: '🍗', ranks: ['青铜', '白银', '黄金', '铂金', '钻石', '大师', '生存者'] },
  { name: '堡垒之夜', icon: '🏗️', ranks: ['青铜', '白银', '黄金', '铂金', '钻石', '精英', '冠军', '虚幻'] },
  { name: '实况足球', icon: '⚽', ranks: ['新秀', '职业', '世界级', '传奇'] },
  { name: '原神', icon: '🌌', ranks: [] },
  { name: '崩坏：星穹铁道', icon: '🚂', ranks: [] },
  { name: '绝区零', icon: '🎧', ranks: [] },
  { name: '鸣潮', icon: '🌊', ranks: [] },
  { name: '明日方舟', icon: '🏝️', ranks: [] },
  { name: '光·遇', icon: '🕯️', ranks: [] },
  { name: '恋与深空', icon: '💕', ranks: [] },
];

export function gameByName(name: string): Game | undefined {
  return GAMES.find(g => g.name === name);
}

// 根据段位强度给夸奖称号：段位越高称号越强
export function praiseFor(game: Game, rank: string): { title: string; emoji: string } {
  const i = game.ranks.indexOf(rank);
  if (i < 0 || game.ranks.length < 2) return { title: '玩家', emoji: '🎮' };
  const r = i / (game.ranks.length - 1);
  if (r >= 0.8) return { title: '大神', emoji: '👑' };
  if (r >= 0.55) return { title: '高手', emoji: '⚔️' };
  if (r >= 0.3) return { title: '达人', emoji: '🌟' };
  return { title: '新星', emoji: '🌱' };
}

// 成员卡片上的标签，如：王者荣耀的大神！
export function badgeText(gameName: string, rank: string): string {
  const g = gameByName(gameName);
  if (!g) return `${gameName}玩家！`;
  const p = praiseFor(g, rank);
  return `${gameName}的${p.title}！`;
}
