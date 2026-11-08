// Mineradio 网页版垫片 (radio.qianzhi.pw):
// 隐藏桌面专属设置区段与未开放入口的残余按钮; 不定义 window.desktopWindow
// (上游调用点均有守卫, 无桌面桥时自动降级), 只做 DOM 层收口。
(function () {
  'use strict';
  window.__MINERADIO_WEB__ = true;

  // radio-web 二期补丁 (问题 5): 背景/首页的 <video> 一旦进入错误态, 立即隐藏该元素,
  // 不让浏览器把媒体错误占位字样 (如 "Unable to play media.") 画到首屏上;
  // 之后若同一元素成功加载 (canplay), 自动恢复显示, 不影响自定义背景视频等正常功能。
  // error 事件不冒泡, 必须用捕获阶段监听; <source> 的错误也要转到其 <video> 父元素。
  document.addEventListener('error', function (e) {
    var t = e && e.target;
    if (!t || !t.tagName) return;
    if (t.tagName === 'SOURCE') t = t.parentElement;
    if (t && t.tagName === 'VIDEO') {
      try { t.pause(); } catch (_) { }
      t.style.setProperty('display', 'none', 'important');
      t.setAttribute('data-radio-video-error', '1');
    }
  }, true);
  document.addEventListener('canplay', function (e) {
    var t = e && e.target;
    if (t && t.tagName === 'VIDEO' && t.getAttribute('data-radio-video-error')) {
      t.removeAttribute('data-radio-video-error');
      t.style.removeProperty('display');
    }
  }, true);

  function hideEl(el) {
    if (el && el.style) el.style.setProperty('display', 'none', 'important');
  }

  // 隐藏某个 .fx-section-label 起、到下一个 .fx-section-label 前的整段设置
  function hideFxSection(labelText) {
    var labels = document.querySelectorAll('.fx-section-label');
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      if ((label.textContent || '').trim().indexOf(labelText) === -1) continue;
      hideEl(label);
      var node = label.nextElementSibling;
      while (node && !node.classList.contains('fx-section-label')) {
        var next = node.nextElementSibling;
        hideEl(node);
        node = next;
      }
    }
  }

  function applyWebShims() {
    // 桌面歌词 / 桌面帧数 / 内存压缩 整段隐藏
    hideFxSection('桌面 / 壁纸');
    hideFxSection('桌面帧数');
    hideFxSection('壁纸帧数');
    hideFxSection('内存压缩');

    // 本地缓存段: 只隐藏标题与面板本体 (后面的粒子滑杆是正常功能)
    var labels = document.querySelectorAll('.fx-section-label');
    for (var i = 0; i < labels.length; i++) {
      if ((labels[i].textContent || '').trim().indexOf('本地缓存') !== -1) hideEl(labels[i]);
    }
    hideEl(document.getElementById('cache-storage-panel'));

    // 队列面板的「+ 新建内置」按钮 (内置歌单依赖桌面文件存储)
    var buttons = document.querySelectorAll('button');
    for (var b = 0; b < buttons.length; b++) {
      var text = (buttons[b].textContent || '').trim();
      if (text.indexOf('新建内置') !== -1) hideEl(buttons[b]);
    }

    // 收藏弹窗里的「新建 Mineradio 内置歌单」一行
    var collectInput = document.getElementById('collect-new-name');
    if (collectInput) {
      var row = collectInput.closest('div');
      if (row) hideEl(row);
    }

    // 账号弹窗提示文案改为网页版口径
    var hint = document.getElementById('account-hint');
    if (hint && hint.textContent.indexOf('QQ') !== -1) {
      hint.textContent = '网页版一期仅开放网易云音乐, 登录后可同步歌单与红心。';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyWebShims);
  } else {
    applyWebShims();
  }

  // 面板内容为动态渲染时补跑几次 (轻量观察, 20 秒后自停)
  var observer = null;
  var stopAt = Date.now() + 20000;
  try {
    observer = new MutationObserver(function () {
      applyWebShims();
      if (Date.now() > stopAt && observer) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { if (observer) observer.disconnect(); }, 21000);
  } catch (e) { /* 观察失败不影响主功能 */ }
})();
