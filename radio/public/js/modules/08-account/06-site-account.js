// 本站账号 + 网易云跨设备同步（电台前端）。
// 与下载页 radio/public/download.html 的本站会话逻辑保持一致：
// 会话键 qz_site_session_v1、同步同意键 qz_netease_sync_consent_v1、
// 已同步标记 qz_netease_synced_v1、不恢复标记 qz_netease_no_restore_v1
// 四个键名必须一致，才能与下载页在同一设备上互通。
// 全部走同源 /api/dl/*（Worker 先验本站 token），不直连 supabase.co。
// ES5 风格（var / function），与现有模块一致；全局函数拼接加载，无模块系统。
var SITE_SESSION_KEY = 'qz_site_session_v1';
var NETEASE_SYNC_CONSENT_KEY = 'qz_netease_sync_consent_v1';
var NETEASE_SYNCED_KEY = 'qz_netease_synced_v1';
var NETEASE_NO_RESTORE_KEY = 'qz_netease_no_restore_v1';
var siteLinkPromptState = null; // { kind: 'consent' | 'changed', data: {...} }
var siteLinkPromptDismissed = false;
var siteAccountSectionBound = false;
var siteLinkStatusKnownLinked = false;
var siteLinkStatusFetchedAt = 0;

function loadSiteSession() {
  try {
    var raw = localStorage.getItem(SITE_SESSION_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || !s.access_token || !s.refresh_token) return null;
    return s;
  } catch (e) { return null; }
}
function saveSiteSession(s) {
  try { localStorage.setItem(SITE_SESSION_KEY, JSON.stringify(s)); } catch (e) { }
}
function clearSiteSession() {
  try { localStorage.removeItem(SITE_SESSION_KEY); } catch (e) { }
}
function siteTokenExpiredSoon(session) {
  if (!session) return true;
  return (Number(session.expires_at) || 0) - Date.now() < 60000;
}
// 本站会话是否还能用：未过期，或有 refresh_token 可续期。
function siteSessionUsable() {
  var s = loadSiteSession();
  if (!s || !s.access_token) return false;
  if (!siteTokenExpiredSoon(s)) return true;
  return !!s.refresh_token;
}
// token 快过期时用 refresh_token 续期；续不上返回 false（不清除旧会话，由调用方决定）。
function refreshSiteSession() {
  var session = loadSiteSession();
  if (!session || !session.refresh_token) return Promise.resolve(false);
  return fetch('/api/dl/site-refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ refresh_token: session.refresh_token })
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
  .then(function (res) {
    if (!res.ok || !res.d || !res.d.access_token) return false;
    saveSiteSession({
      access_token: res.d.access_token,
      refresh_token: res.d.refresh_token || session.refresh_token,
      expires_at: Date.now() + (Number(res.d.expires_in) || 3600) * 1000,
      user_id: (res.d.user && res.d.user.id) || session.user_id || '',
      label: session.label || ''
    });
    return true;
  }).catch(function () { return false; });
}
function ensureSiteToken() {
  var session = loadSiteSession();
  if (!session) return Promise.resolve(false);
  if (!siteTokenExpiredSoon(session)) return Promise.resolve(true);
  return refreshSiteSession();
}
// 带本站 Bearer 的 /api/dl/* 调用。401 时清本站会话；网络失败返回 null。
// path 形如 '/netease/restore'，opts 可带 method / body / headers。
function apiDlJson(path, opts) {
  opts = opts || {};
  return ensureSiteToken().then(function (ok) {
    if (!ok) return { ok: false, error: 'SITE_LOGIN_REQUIRED' };
    var session = loadSiteSession();
    if (!session || !session.access_token) return { ok: false, error: 'SITE_LOGIN_REQUIRED' };
    var headers = { 'Authorization': 'Bearer ' + session.access_token };
    if (opts.headers) {
      for (var k in opts.headers) headers[k] = opts.headers[k];
    }
    var fetchOpts = { credentials: 'same-origin', headers: headers };
    if (opts.method) fetchOpts.method = opts.method;
    if (opts.body) fetchOpts.body = opts.body;
    return fetch('/api/dl' + path, fetchOpts).then(function (r) {
      return r.json().then(function (d) { return { _status: r.status, _data: d }; });
    }).then(function (res) {
      // 401 不一定是本站凭证失效：link 失败时 Worker 也会用 401 回
      // NETEASE_SESSION_INVALID（网易云会话无效，本站 token 是好的），
      // 这种不要清本站会话；只有本站门禁拒绝时才清。
      if (res._status === 401 && !(res._data && res._data.error === 'NETEASE_SESSION_INVALID')) {
        clearSiteSession();
        return { ok: false, error: 'SITE_LOGIN_REQUIRED', status: 401 };
      }
      var d = res._data || {};
      if (typeof d === 'object') d._status = res._status;
      return d;
    });
  }).catch(function () { return null; });
}
function siteNeteaseSyncedUserId() {
  try { return localStorage.getItem(NETEASE_SYNCED_KEY) || ''; } catch (e) { return ''; }
}
// 本设备启动时恢复：把本站账号绑定的网易云会话种回本设备。
// 成功写 synced 标记并清 no_restore；绑定已过期（EXPIRED）时清 synced 标记，
// 返回 { expired: true }，调用方不弹任何东西，用户之后手动扫码即可。
function restoreNeteaseFromSite() {
  return apiDlJson('/netease/restore', { method: 'POST' }).then(function (d) {
    if (!d) return { ok: false, error: 'NETWORK_ERROR' };
    if (d.reason === 'EXPIRED' || d.error === 'EXPIRED' || d.code === 'EXPIRED' || d.error_code === 'EXPIRED') {
      try { localStorage.removeItem(NETEASE_SYNCED_KEY); } catch (e) { }
      return { expired: true };
    }
    if (d.error || d.ok === false || d.restored !== true) return { ok: false, error: d.error || d.code || d.message || (d.linked === false ? 'NOT_LINKED' : 'RESTORE_FAILED') };
    var session = loadSiteSession();
    try {
      if (session && session.user_id) localStorage.setItem(NETEASE_SYNCED_KEY, String(session.user_id));
      localStorage.removeItem(NETEASE_NO_RESTORE_KEY);
    } catch (e) { }
    return { ok: true, data: d };
  });
}
// 把当前本设备网易云会话绑定到本站账号。409 NETEASE_ACCOUNT_CHANGED 时
// 返回 { changed: true, ... }，由调用方二次确认后再带 confirm 重调。
function linkNeteaseToSite(confirm) {
  return apiDlJson('/netease/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: !!confirm })
  }).then(function (d) {
    if (!d) return { ok: false, error: 'NETWORK_ERROR' };
    if (d.code === 'NETEASE_ACCOUNT_CHANGED' || d.error === 'NETEASE_ACCOUNT_CHANGED' || d.error_code === 'NETEASE_ACCOUNT_CHANGED') {
      return { changed: true, data: d, error: 'NETEASE_ACCOUNT_CHANGED' };
    }
    if (d.error || d.ok === false) return { ok: false, error: d.error || d.code || d.message || 'LINK_FAILED' };
    var session = loadSiteSession();
    try {
      localStorage.setItem(NETEASE_SYNC_CONSENT_KEY, '1');
      if (session && session.user_id) localStorage.setItem(NETEASE_SYNCED_KEY, String(session.user_id));
      localStorage.removeItem(NETEASE_NO_RESTORE_KEY);
    } catch (e) { }
    return { ok: true, data: d };
  });
}
function getNeteaseLinkStatus() {
  return apiDlJson('/netease/status', { method: 'GET' }).then(function (d) {
    if (!d || d.error === 'SITE_LOGIN_REQUIRED') return null;
    return d;
  });
}
// 只退本设备：调服务端清本设备会话，并写 no_restore 标记、清 synced 标记。
// 服务端未部署 / 失败也不阻塞本地退出（不调上游 /api/logout，不删绑定行）。
function logoutNeteaseLocal() {
  return apiDlJson('/netease/logout-local', { method: 'POST' }).then(function (d) {
    try {
      localStorage.setItem(NETEASE_NO_RESTORE_KEY, '1');
      localStorage.removeItem(NETEASE_SYNCED_KEY);
    } catch (e) { }
    return d;
  }).catch(function () {
    try {
      localStorage.setItem(NETEASE_NO_RESTORE_KEY, '1');
      localStorage.removeItem(NETEASE_SYNCED_KEY);
    } catch (e) { }
    return null;
  });
}
// 解绑全部设备：删服务端绑定行，清本地 synced 与 no_restore 标记。
function unlinkNetease() {
  return apiDlJson('/netease/unlink', { method: 'DELETE' }).then(function (d) {
    try {
      localStorage.removeItem(NETEASE_SYNCED_KEY);
      localStorage.removeItem(NETEASE_NO_RESTORE_KEY);
    } catch (e) { }
    siteLinkStatusKnownLinked = false;
    return d;
  }).catch(function () { return null; });
}
function siteLoginErrorText(code, fallback) {
  if (/网络连不上/.test(fallback || '')) return fallback;
  if (/invalid_credential/i.test(code || '')) return '账号或密码不对，请再试一次。';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(fallback || '')) return '邮箱还没验证：请先去邮箱里点验证链接，再回来登录。';
  if (code === 'rate_limited') return '登录太频繁了，请稍后再试。';
  if (/invalid/i.test(fallback || '')) return '账号或密码不对，请再试一次。';
  return '本站登录失败，请检查网络后重试。';
}
// 本站登录（QQ 邮箱或用户名 + 密码），走同源代理 /api/dl/site-login。
function siteLogin(ident, password) {
  return fetch('/api/dl/site-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ident: ident, password: password })
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
  .then(function (res) {
    var d = res.d || {};
    var sess = d.session || d;
    if (!res.ok || !sess.access_token) {
      var code = d.code || d.error_code || '';
      throw new Error(siteLoginErrorText(code, d.msg || d.error_description || d.message || d.error || ''));
    }
    var saved = {
      access_token: sess.access_token,
      refresh_token: sess.refresh_token || '',
      expires_at: Date.now() + (Number(sess.expires_in) || 3600) * 1000,
      user_id: (d.user && d.user.id) || (sess.user && sess.user.id) || '',
      label: ident
    };
    saveSiteSession(saved);
    return { ok: true, session: saved };
  }).catch(function (e) {
    if (e instanceof TypeError) return { ok: false, error: '网络连不上，请检查网络后重试。' };
    return { ok: false, error: (e && e.message) || '本站登录失败，请检查网络后重试。' };
  });
}
// 退出本站：先退本设备网易云（写 no_restore，之后本站再登录也不会悄悄恢复），
// 再清本站会话与 synced 标记。
function siteLogout() {
  return Promise.resolve().then(function () {
    return logoutNeteaseLocal();
  }).then(function () {
    clearSiteSession();
    try {
      localStorage.removeItem(NETEASE_SYNCED_KEY);
      localStorage.removeItem(NETEASE_SYNC_CONSENT_KEY);
    } catch (e) { }
    siteLinkStatusKnownLinked = false;
    siteLinkStatusFetchedAt = 0;
  });
}

// ---- #user-modal 里的“本站账号”区 ----
// 绑定确认不在登录弹窗里弹：登录成功后只在本站账号区留一行提示 + 按钮，
// 用户打开右上角账号弹窗时能看到；同时用 toast 提醒去账号弹窗确认。
function showSiteLinkConsentPrompt() {
  if (siteLinkPromptDismissed) return;
  siteLinkPromptState = { kind: 'consent', data: null };
  if (typeof renderSiteAccountSection === 'function') renderSiteAccountSection(true);
  if (typeof showToast === 'function') showToast('网易云已登录；要同步到本站账号吗？请在账号弹窗里确认');
}
function showSiteLinkChangedPrompt(res) {
  siteLinkPromptState = { kind: 'changed', data: (res && res.data) || res || null };
  if (typeof renderSiteAccountSection === 'function') renderSiteAccountSection(true);
  if (typeof showToast === 'function') showToast('本站绑定的网易云账号和这次登录的不一样，请在账号弹窗里确认');
}
// 网易云刚在本设备登录成功后调用：未登本站时什么都不做（仅本设备登录，
// 与今天行为一致）；已登本站且已同意过同步则直接调 link；未同意则留提示。
function maybeLinkNeteaseAfterLogin() {
  try {
    if (!loadSiteSession()) return;
    if (siteLinkPromptDismissed) return;
    var consent = null;
    try { consent = localStorage.getItem(NETEASE_SYNC_CONSENT_KEY); } catch (e) { }
    // 'declined' 是下载页上用户明确选的“仅这台设备”，电台也不再追问。
    if (consent === 'declined') return;
    if (consent === '1') {
      linkNeteaseToSite(false).then(function (res) {
        if (res && res.changed) showSiteLinkChangedPrompt(res);
        else if (res && res.ok) {
          if (typeof showToast === 'function') showToast('网易云已同步到本站账号');
          if (typeof renderSiteAccountSection === 'function') renderSiteAccountSection(true);
        }
      }).catch(function (e) { console.warn('link netease failed:', e); });
    } else {
      showSiteLinkConsentPrompt();
    }
  } catch (e) { console.warn('maybeLinkNeteaseAfterLogin failed:', e); }
}
function bindSiteAccountSectionOnce() {
  if (siteAccountSectionBound) return;
  siteAccountSectionBound = true;
  var confirmBtn = document.getElementById('site-link-confirm-btn');
  var dismissBtn = document.getElementById('site-link-dismiss-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', function () {
    var kind = siteLinkPromptState && siteLinkPromptState.kind;
    var btn = document.getElementById('site-link-confirm-btn');
    if (btn) btn.disabled = true;
    if (kind === 'changed') {
      linkNeteaseToSite(true).then(function (res) {
        if (btn) btn.disabled = false;
        if (res && res.ok) {
          siteLinkPromptState = null;
          if (typeof showToast === 'function') showToast('已更换绑定，网易云已同步到本站账号');
          renderSiteAccountSection(true);
        } else if (typeof showToast === 'function') {
          showToast('更换绑定失败，请稍后再试');
        }
      });
      return;
    }
    try { localStorage.setItem(NETEASE_SYNC_CONSENT_KEY, '1'); } catch (e) { }
    linkNeteaseToSite(false).then(function (res) {
      if (btn) btn.disabled = false;
      if (res && res.changed) { showSiteLinkChangedPrompt(res); return; }
      if (res && res.ok) {
        siteLinkPromptState = null;
        if (typeof showToast === 'function') showToast('网易云已同步到本站账号');
        renderSiteAccountSection(true);
      } else if (typeof showToast === 'function') {
        showToast('绑定失败，请稍后再试');
      }
    });
  });
  if (dismissBtn) dismissBtn.addEventListener('click', function () {
    siteLinkPromptState = null;
    siteLinkPromptDismissed = true;
    renderSiteAccountSection(true);
  });
}
function renderSiteAccountSection(force) {
  var section = document.getElementById('site-account-section');
  if (!section) return;
  bindSiteAccountSectionOnce();
  var session = loadSiteSession();
  var form = document.getElementById('site-login-form');
  var loggedInBox = document.getElementById('site-logged-in');
  var labelEl = document.getElementById('site-account-label');
  var linkEl = document.getElementById('site-link-status');
  var promptEl = document.getElementById('site-link-prompt');
  var promptText = document.getElementById('site-link-prompt-text');
  var logoutLocalBtn = document.getElementById('site-logout-local-btn');
  var unlinkBtn = document.getElementById('site-unlink-btn');
  if (form) form.style.display = session ? 'none' : '';
  if (loggedInBox) loggedInBox.style.display = session ? '' : 'none';
  if (labelEl && session) labelEl.textContent = session.label || session.user_id || '';
  var neteaseLoggedIn = false;
  try { neteaseLoggedIn = !!(typeof loginStatus !== 'undefined' && loginStatus && loginStatus.loggedIn); } catch (e) { }
  var syncedId = siteNeteaseSyncedUserId();
  if (linkEl) {
    if (!session) linkEl.textContent = '网易云绑定：请先登录本站账号';
    else if (siteLinkStatusKnownLinked) linkEl.textContent = '网易云绑定：已绑定';
    else if (syncedId) linkEl.textContent = '网易云绑定：已绑定（本站账号）';
    else linkEl.textContent = '网易云绑定：未绑定';
  }
  if (logoutLocalBtn) logoutLocalBtn.style.display = neteaseLoggedIn ? '' : 'none';
  if (unlinkBtn) unlinkBtn.style.display = (session && (siteLinkStatusKnownLinked || !!syncedId)) ? '' : 'none';
  if (promptEl) {
    if (session && siteLinkPromptState) {
      promptEl.style.display = '';
      if (promptText) {
        if (siteLinkPromptState.kind === 'changed') {
          var oldName = siteLinkPromptState.data && (siteLinkPromptState.data.old_nickname || siteLinkPromptState.data.oldNickname || siteLinkPromptState.data.existing_nickname || '');
          var newName = siteLinkPromptState.data && (siteLinkPromptState.data.new_nickname || siteLinkPromptState.data.newNickname || siteLinkPromptState.data.current_nickname || '');
          promptText.textContent = '本站账号之前绑定的是另一个网易云账号' + (oldName ? '（' + oldName + '）' : '') + '，这次登录的是' + (newName ? '（' + newName + '）' : '新账号') + '。确认更换绑定吗？换绑后旧账号在其他设备上的同步会失效。';
          var cb = document.getElementById('site-link-confirm-btn');
          if (cb) cb.textContent = '确认更换绑定';
        } else {
          promptText.textContent = '把这次登录的网易云账号同步到本站账号吗？同步后换设备打开电台不用重新扫码，自动恢复登录。';
          var cb2 = document.getElementById('site-link-confirm-btn');
          if (cb2) cb2.textContent = '同意并绑定';
        }
      }
    } else {
      promptEl.style.display = 'none';
    }
  }
  // 已登本站时向服务端取绑定状态（30 秒内不重复取，force 可立即重取）。
  if (session && (force || Date.now() - siteLinkStatusFetchedAt > 30000)) {
    siteLinkStatusFetchedAt = Date.now();
    getNeteaseLinkStatus().then(function (d) {
      if (!d) return;
      var linked = !!(d.linked === true || d.netease_user_id || d.neteaseUserId || d.user_id);
      siteLinkStatusKnownLinked = linked;
      if (linkEl) {
        if (linked) {
          var name = d.nickname || d.netease_nickname || d.netease_user_id || d.neteaseUserId || '';
          linkEl.textContent = '网易云绑定：已绑定' + (name ? '网易云 ' + name : '');
        } else if (!siteNeteaseSyncedUserId()) {
          linkEl.textContent = '网易云绑定：未绑定';
        }
      }
      if (unlinkBtn) unlinkBtn.style.display = linked || !!siteNeteaseSyncedUserId() ? '' : 'none';
    }).catch(function () { /* 绑定状态取不到不影响主流程 */ });
  }
}
function submitSiteLoginFromRadio() {
  var identEl = document.getElementById('site-ident');
  var pwEl = document.getElementById('site-password');
  var errEl = document.getElementById('site-login-error');
  var btn = document.getElementById('site-login-btn');
  var ident = identEl ? (identEl.value || '').trim() : '';
  var pw = pwEl ? (pwEl.value || '') : '';
  if (errEl) errEl.textContent = '';
  if (!ident) { if (errEl) errEl.textContent = '请输入 QQ 邮箱或用户名。'; return; }
  if (!pw) { if (errEl) errEl.textContent = '请输入本站密码。'; return; }
  if (btn) btn.disabled = true;
  if (errEl) errEl.textContent = '正在登录本站账号…';
  siteLogin(ident, pw).then(function (res) {
    if (btn) btn.disabled = false;
    if (!res || !res.ok) {
      if (errEl) errEl.textContent = (res && res.error) || '本站登录失败，请检查网络后重试。';
      return;
    }
    if (pwEl) pwEl.value = '';
    if (typeof showToast === 'function') showToast('已登录本站账号');
    renderSiteAccountSection(true);
  });
}
function submitSiteLogoutFromRadio() {
  siteLogout().then(function () {
    if (typeof showToast === 'function') showToast('已退出本站账号');
    renderSiteAccountSection(true);
    if (typeof renderUserBtn === 'function') renderUserBtn();
  });
}
