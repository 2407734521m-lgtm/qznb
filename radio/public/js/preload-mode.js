try {
  if (localStorage.getItem('mineradio-startup-fast-skip-v1') === '1') {
    document.documentElement.classList.add('startup-fast-skip-preload');
  }
  // radio-web 二期补丁: 网页版默认 DIY 玩家模式——视觉控制台 (#fx-fab) 与 3D 歌单架
  // 入口都挂在 DIY 模式下, 简约模式会把它们整组隐藏。只有用户明确存过 '0' 才进简约模式。
  document.documentElement.classList.add(localStorage.getItem('mineradio-diy-player-mode-v1') === '0' ? 'simple-mode-preload' : 'diy-mode-preload');
} catch (e) {
  document.documentElement.classList.add('diy-mode-preload');
}
