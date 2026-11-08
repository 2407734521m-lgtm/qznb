/* 真实世界 REALWORLD · VISION ENGINE
   本地推理：MediaPipe ObjectDetector (EfficientDet-Lite0, COCO 80 类)
   距离为单目估算：按类别典型尺寸 + 画面框大小反推，仅供参考。 */
import { FilesetResolver, ObjectDetector } from "./vision_bundle.js";

const $ = (id) => document.getElementById(id);
const video = $("cam"), photo = $("photo"), canvas = $("hud");
const ctx = canvas.getContext("2d");

/* ---------- COCO 80 类中文名 + 典型真实尺寸（米） ---------- */
/* h: 典型高度（按框高反推距离） w: 典型长度（框更宽时按框宽反推） */
const CLS = {
  "person":{n:"人物",h:1.70,w:0.45},"bicycle":{n:"自行车",h:1.05,w:1.75},
  "car":{n:"汽车",h:1.50,w:4.40},"motorcycle":{n:"摩托车",h:1.15,w:2.05},
  "airplane":{n:"飞机",h:4.0,w:30},"bus":{n:"公交车",h:3.0,w:10.5},
  "train":{n:"火车",h:3.5,w:25},"truck":{n:"卡车",h:3.0,w:8.0},
  "boat":{n:"船",h:2.0,w:6.0},"traffic light":{n:"交通信号灯",h:1.0,w:0.35},
  "fire hydrant":{n:"消防栓",h:0.7,w:0.3},"stop sign":{n:"停车标志",h:0.9,w:0.75},
  "parking meter":{n:"停车计时器",h:1.1,w:0.25},"bench":{n:"长椅",h:0.85,w:1.8},
  "bird":{n:"鸟",h:0.3,w:0.35},"cat":{n:"猫",h:0.3,w:0.45},
  "dog":{n:"狗",h:0.55,w:0.6},"horse":{n:"马",h:1.7,w:2.2},
  "sheep":{n:"羊",h:0.9,w:1.1},"cow":{n:"牛",h:1.5,w:2.1},
  "elephant":{n:"大象",h:3.0,w:5.0},"bear":{n:"熊",h:1.2,w:1.8},
  "zebra":{n:"斑马",h:1.5,w:2.1},"giraffe":{n:"长颈鹿",h:4.5,w:3.0},
  "backpack":{n:"背包",h:0.5,w:0.35},"umbrella":{n:"雨伞",h:0.85,w:0.9},
  "handbag":{n:"手提包",h:0.35,w:0.35},"tie":{n:"领带",h:0.45,w:0.1},
  "suitcase":{n:"行李箱",h:0.65,w:0.45},"frisbee":{n:"飞盘",h:0.05,w:0.27},
  "skis":{n:"滑雪板",h:0.1,w:1.7},"snowboard":{n:"单板",h:0.1,w:1.5},
  "sports ball":{n:"球",h:0.22,w:0.22},"kite":{n:"风筝",h:0.6,w:0.8},
  "baseball bat":{n:"球棒",h:0.08,w:0.85},"baseball glove":{n:"棒球手套",h:0.3,w:0.28},
  "skateboard":{n:"滑板",h:0.12,w:0.8},"surfboard":{n:"冲浪板",h:0.15,w:1.9},
  "tennis racket":{n:"网球拍",h:0.68,w:0.27},"bottle":{n:"瓶子",h:0.24,w:0.07},
  "wine glass":{n:"酒杯",h:0.2,w:0.08},"cup":{n:"杯子",h:0.1,w:0.09},
  "fork":{n:"叉子",h:0.2,w:0.03},"knife":{n:"刀",h:0.22,w:0.03},
  "spoon":{n:"勺子",h:0.19,w:0.04},"bowl":{n:"碗",h:0.08,w:0.15},
  "banana":{n:"香蕉",h:0.05,w:0.19},"apple":{n:"苹果",h:0.08,w:0.08},
  "sandwich":{n:"三明治",h:0.07,w:0.13},"orange":{n:"橙子",h:0.08,w:0.08},
  "broccoli":{n:"西兰花",h:0.12,w:0.13},"carrot":{n:"胡萝卜",h:0.04,w:0.2},
  "hot dog":{n:"热狗",h:0.06,w:0.18},"pizza":{n:"披萨",h:0.04,w:0.35},
  "donut":{n:"甜甜圈",h:0.04,w:0.12},"cake":{n:"蛋糕",h:0.12,w:0.25},
  "chair":{n:"椅子",h:0.9,w:0.5},"couch":{n:"沙发",h:0.9,w:2.0},
  "potted plant":{n:"盆栽",h:0.5,w:0.4},"bed":{n:"床",h:0.6,w:2.0},
  "dining table":{n:"餐桌",h:0.75,w:1.5},"toilet":{n:"马桶",h:0.7,w:0.45},
  "tv":{n:"电视",h:0.6,w:1.1},"laptop":{n:"笔记本电脑",h:0.25,w:0.35},
  "mouse":{n:"鼠标",h:0.04,w:0.1},"remote":{n:"遥控器",h:0.03,w:0.16},
  "keyboard":{n:"键盘",h:0.03,w:0.45},"cell phone":{n:"手机",h:0.16,w:0.075},
  "microwave":{n:"微波炉",h:0.3,w:0.5},"oven":{n:"烤箱",h:0.6,w:0.6},
  "toaster":{n:"烤面包机",h:0.19,w:0.27},"sink":{n:"水槽",h:0.2,w:0.6},
  "refrigerator":{n:"冰箱",h:1.8,w:0.8},"book":{n:"书",h:0.24,w:0.17},
  "clock":{n:"时钟",h:0.3,w:0.3},"vase":{n:"花瓶",h:0.3,w:0.15},
  "scissors":{n:"剪刀",h:0.2,w:0.06},"teddy bear":{n:"泰迪熊",h:0.5,w:0.35},
  "hair drier":{n:"吹风机",h:0.25,w:0.25},"toothbrush":{n:"牙刷",h:0.18,w:0.025}
};
const VFOV = 55 * Math.PI / 180; // 手机主摄竖直视场角（估算用）

/* ---------- 状态 ---------- */
const S = {
  mode: "live",            // live | photo
  running: false,          // 实时检测开关
  threshold: 0.40,
  showDist: true,
  showStream: true,
  detectorVideo: null,
  detectorImage: null,
  tracks: [],              // {id, key, box, score, lastSeen, locked}
  nextId: 1,
  focusId: null,           // 中心追踪目标
  lastDetAt: 0,
  detCount: 0, hz: 0, fps: 0,
  stream: null,
};

/* ---------- 画布尺寸 ---------- */
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}
addEventListener("resize", fitCanvas); fitCanvas();

/* ---------- 时钟 ---------- */
setInterval(() => {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  $("clock").textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}, 500);
if (navigator.getBattery) navigator.getBattery().then((b) => {
  const upd = () => { $("batt").textContent = `电量 ${Math.round(b.level * 100)}% · LOCAL · NO CLOUD`; };
  upd(); b.addEventListener("levelchange", upd);
}).catch(() => {});

/* ---------- 站内弹层（不用原生弹窗） ---------- */
function openSheet(html) { $("sheet").innerHTML = html; $("sheet").style.display = "block"; $("sheetmask").style.display = "block"; }
function closeSheet() { $("sheet").style.display = "none"; $("sheetmask").style.display = "none"; }
$("sheetmask").addEventListener("click", closeSheet);
function showMsg(title, text) {
  openSheet(`<h3>${title}</h3><div id="msgtext">${text}</div>
    <button class="bigbtn" id="msgok">知道了</button>`);
  $("msgok").addEventListener("click", closeSheet);
}

/* ---------- 模型加载 ---------- */
async function makeDetector(runningMode) {
  const fileset = await FilesetResolver.forVisionTasks("./wasm");
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: "./efficientdet_lite0.tflite", delegate },
    runningMode, maxResults: 12, scoreThreshold: S.threshold,
  });
  try { return await ObjectDetector.createFromOptions(fileset, opts("GPU")); }
  catch (e) { return await ObjectDetector.createFromOptions(fileset, opts("CPU")); }
}

/* ---------- 开机流程 ---------- */
const bootSteps = [
  [18, "正在唤醒视觉核心…"],
  [38, "正在载入物体特征库（80 类）…"],
  [58, "正在校准单目测距…"],
  [78, "正在建立目标追踪…"],
  [100, "系统就绪 · SYSTEM READY"],
];
async function boot() {
  const bar = $("bootbar"), msg = $("bootmsg");
  for (const [pct, text] of bootSteps.slice(0, 2)) { bar.style.width = pct + "%"; msg.textContent = text; await new Promise(r => setTimeout(r, 220)); }
  try {
    S.detectorVideo = await makeDetector("VIDEO");
  } catch (e) {
    msg.textContent = "模型加载失败，请检查网络后刷新重试";
    return;
  }
  for (const [pct, text] of bootSteps.slice(2)) { bar.style.width = pct + "%"; msg.textContent = text; await new Promise(r => setTimeout(r, 200)); }
  $("startbtn").style.display = "block";
}
$("startbtn").addEventListener("click", async () => {
  $("boot").style.display = "none";
  await startCamera();
  S.running = true;
  requestAnimationFrame(loop);
});
boot();

/* ---------- 摄像头 ---------- */
async function startCamera() {
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = S.stream;
    await video.play().catch(() => {});
  } catch (e) {
    showMsg("摄像头打不开", "没有拿到摄像头权限。\n\n· 浏览器里打开：请在地址栏旁的权限设置里允许摄像头，并用 https 地址打开本页\n· 应用里打开：去系统设置给「真实世界」开摄像头权限\n\n开好后点下面按钮重试。");
    const b = document.createElement("button");
    b.className = "bigbtn"; b.textContent = "重试打开摄像头";
    b.addEventListener("click", () => { closeSheet(); startCamera(); });
    $("sheet").appendChild(b);
  }
}

/* ---------- 坐标映射（视频 cover / 照片 contain） ---------- */
function mapper(srcW, srcH, mode) {
  const vw = innerWidth, vh = innerHeight;
  const s = mode === "cover" ? Math.max(vw / srcW, vh / srcH) : Math.min(vw / srcW, vh / srcH);
  return { s, ox: (vw - srcW * s) / 2, oy: (vh - srcH * s) / 2,
           map: (b) => ({ x: b.originX * s + (vw - srcW * s) / 2, y: b.originY * s + (vh - srcH * s) / 2,
                          w: b.width * s, h: b.height * s }) };
}

/* ---------- 单目测距（估算） ---------- */
function estimate(box, srcH, cls) {
  const meta = CLS[cls];
  if (!meta) return null;
  const f = (srcH / 2) / Math.tan(VFOV / 2);
  let dist, sizeW, sizeH;
  if (box.width > box.height && meta.w > meta.h * 1.6) {
    dist = f * meta.w / box.width;                    // 宽框：按长度反推
    sizeW = meta.w; sizeH = meta.w * box.height / box.width;
  } else {
    dist = f * meta.h / box.height;                   // 一般：按高度反推
    sizeH = meta.h; sizeW = meta.h * box.width / box.height;
  }
  if (!isFinite(dist) || dist <= 0 || dist > 900) return null;
  return { dist, sizeW, sizeH };
}

/* ---------- 追踪（最近质心匹配，给每个目标一个稳定编号） ---------- */
function updateTracks(dets, srcW, srcH, now) {
  const used = new Set();
  for (const d of dets) {
    const cx = d.box.originX + d.box.width / 2, cy = d.box.originY + d.box.height / 2;
    let best = null, bestDist = Math.hypot(srcW, srcH) * 0.18;
    for (const t of S.tracks) {
      if (used.has(t.id) || t.key !== d.key) continue;
      const dist = Math.hypot(t.cx - cx, t.cy - cy);
      if (dist < bestDist) { bestDist = dist; best = t; }
    }
    if (best) {
      best.box = d.box; best.score = d.score; best.cx = cx; best.cy = cy;
      best.lastSeen = now; best.est = d.est; used.add(best.id);
    } else {
      const t = { id: S.nextId++, key: d.key, box: d.box, score: d.score,
                  cx, cy, lastSeen: now, est: d.est };
      S.tracks.push(t); used.add(t.id);
    }
  }
  S.tracks = S.tracks.filter(t => now - t.lastSeen < 1600);
  if (S.focusId && !S.tracks.some(t => t.id === S.focusId && now - t.lastSeen < 300)) {
    if (!S.tracks.some(t => t.id === S.focusId)) S.focusId = null;
  }
}

/* ---------- 绘制 ---------- */
function drawBox(m, t, now) {
  const b = m.map(t.box);
  const fresh = now - t.lastSeen < 350;
  const col = fresh ? "#3dff6e" : "rgba(61,255,110,.4)";
  const L = Math.max(14, Math.min(b.w, b.h) * 0.18);
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
  const corners = [
    [b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1],
    [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.moveTo(x + L * dx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + L * dy);
  }
  ctx.stroke();
  ctx.strokeStyle = fresh ? "rgba(61,255,110,.28)" : "rgba(61,255,110,.12)";
  ctx.lineWidth = 1; ctx.strokeRect(b.x, b.y, b.w, b.h);

  const meta = CLS[t.key] || { n: t.key };
  const idStr = "#" + String(t.id).padStart(4, "0");
  ctx.font = "600 12px Consolas,monospace";
  const label = `${idStr} ${meta.n}`;
  const lw = ctx.measureText(label).width + 12;
  const ly = Math.max(0, b.y - 22);
  ctx.fillStyle = "rgba(3,20,9,.82)"; ctx.fillRect(b.x, ly, lw, 20);
  ctx.fillStyle = "#3dff6e"; ctx.fillText(label, b.x + 6, ly + 14);
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = "11px Consolas,monospace";
  ctx.fillText(t.key.toUpperCase(), b.x + 6, b.y + b.h + 15);
  if (S.showDist && t.est) {
    ctx.fillStyle = "#3dff6e";
    ctx.fillText(`距离 ${t.est.dist.toFixed(1)} m · ≒${t.est.sizeW.toFixed(2)}×${t.est.sizeH.toFixed(2)} m`, b.x + 6, b.y + b.h + 30);
  }
  ctx.fillStyle = "rgba(234,255,239,.85)";
  ctx.fillText(`CONF ${(t.score * 100).toFixed(0)}%`, b.x + 6, ly - 5 < 10 ? b.y + 14 : ly - 5);
  return b;
}
function drawReticle(focusBox) {
  const cx = focusBox ? focusBox.x + focusBox.w / 2 : innerWidth / 2;
  const cy = focusBox ? focusBox.y + focusBox.h / 2 : innerHeight * 0.44;
  const R = 34;
  ctx.strokeStyle = "rgba(234,255,239,.75)"; ctx.lineWidth = 1.4; ctx.beginPath();
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.moveTo(cx + dx * R, cy + dy * R - dy * 12);
    ctx.lineTo(cx + dx * R, cy + dy * R);
    ctx.lineTo(cx + dx * R - dx * 12, cy + dy * R);
  }
  ctx.stroke();
  ctx.fillStyle = "#ff3b30";
  ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, Math.PI * 2); ctx.fill();
}

/* ---------- HUD 面板刷新 ---------- */
function refreshPanels(now, focus) {
  const alive = S.tracks;
  $("objcount").textContent = `OBJECTS ${alive.filter(t => now - t.lastSeen < 350).length}`;
  // 目标锁定：置信度最高的两个
  const top = [...alive].sort((a, b) => b.score - a.score).slice(0, 2);
  $("locklist").innerHTML = top.map(t => {
    const meta = CLS[t.key] || { n: t.key };
    const d = (S.showDist && t.est) ? `距离 ${t.est.dist.toFixed(1)} 公尺 · ≒${t.est.sizeW.toFixed(2)}×${t.est.sizeH.toFixed(2)} m` : `CONF ${(t.score * 100).toFixed(0)}%`;
    return `<div class="lockitem"><div class="nm">#${String(t.id).padStart(4, "0")} ${meta.n}</div><div class="dt">${d}</div></div>`;
  }).join("");
  // 右侧目标流
  if (S.showStream) {
    $("stream").style.display = "flex";
    $("streamlist").innerHTML = [...alive].sort((a, b) => a.id - b.id).slice(-9).map(t => {
      const meta = CLS[t.key] || { n: t.key };
      const age = now - t.lastSeen;
      const cls = age > 700 ? "lost" : (t.score < 0.55 ? "weak" : "");
      const st = age > 700 ? "信号丢失" : (t.score < 0.55 ? "弱信号" : "在线 · 追踪中");
      return `<div class="sitem ${cls}"><div class="id">#${String(t.id).padStart(4, "0")}</div><div class="cls">${meta.n}</div><div class="st">${st}</div></div>`;
    }).join("");
  } else $("stream").style.display = "none";
  // 中心标注
  if (focus) {
    const meta = CLS[focus.key] || { n: focus.key };
    $("ct1").textContent = `正在追踪 · 目标 #${String(focus.id).padStart(4, "0")}`;
    $("ct2").textContent = (S.showDist && focus.est) ? `${meta.n} · 距离 ${focus.est.dist.toFixed(1)} m（估算）` : meta.n;
  } else { $("ct1").textContent = ""; $("ct2").textContent = ""; }
}

/* ---------- 主循环 ---------- */
let frames = 0, statAt = performance.now(), lastVideoTime = -1;
async function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  frames++;
  if (now - statAt >= 1000) {
    S.fps = frames; frames = 0; statAt = now;
    $("st_fps").textContent = `${S.fps} FPS`;
    $("st_hz").textContent = `${S.hz.toFixed(1)} Hz`;
    S.hz = 0;
    if (video.videoWidth) $("st_res").textContent = `${video.videoWidth} × ${video.videoHeight}`;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.save(); ctx.scale(dpr, dpr);

  if (S.mode === "live") {
    if (S.running && S.detectorVideo && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - S.lastDetAt >= 85) {
      lastVideoTime = video.currentTime; S.lastDetAt = now;
      try {
        const res = S.detectorVideo.detectForVideo(video, now);
        S.hz++;
        const dets = (res.detections || []).map(d => {
          const c = d.categories[0];
          return { key: c.categoryName, score: c.score, box: d.boundingBox,
                   est: estimate(d.boundingBox, video.videoHeight, c.categoryName) };
        });
        updateTracks(dets, video.videoWidth, video.videoHeight, now);
      } catch (e) { /* 单帧失败忽略 */ }
    }
    if (video.videoWidth) {
      const m = mapper(video.videoWidth, video.videoHeight, "cover");
      let focus = null, bestArea = -1;
      for (const t of S.tracks) {
        const b = drawBox(m, t, now);
        const area = t.box.width * t.box.height;
        if (S.focusId === t.id) focus = { t, b };
        else if (area > bestArea) { bestArea = area; focus = { t, b }; }
      }
      drawReticle(focus ? focus.b : null);
      refreshPanels(now, focus ? focus.t : null);
    }
  } else if (S.mode === "photo" && photo.naturalWidth) {
    const m = mapper(photo.naturalWidth, photo.naturalHeight, "contain");
    let focus = null;
    for (const t of S.tracks) { const b = drawBox(m, t, now); if (!focus) focus = { t, b }; }
    refreshPanels(now, focus ? focus.t : null);
  }
  ctx.restore();
}

/* ---------- 点按画面锁定目标 ---------- */
addEventListener("pointerdown", (e) => {
  if (e.target.closest("#navbar,#sheet,#sheetmask,#boot")) return;
  const src = S.mode === "live" ? video : photo;
  const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
  if (!sw) return;
  const m = mapper(sw, sh, S.mode === "live" ? "cover" : "contain");
  let best = null, bd = 1e9;
  for (const t of S.tracks) {
    const b = m.map(t.box);
    const d = Math.hypot(b.x + b.w / 2 - e.clientX, b.y + b.h / 2 - e.clientY);
    if (d < bd) { bd = d; best = t; }
  }
  if (best && bd < 190) { S.focusId = best.id; }
});

/* ---------- 底部按钮 ---------- */
$("btn_live").addEventListener("click", async () => {
  if (S.mode === "photo") {
    S.mode = "live"; photo.style.display = "none"; video.style.display = "block";
    S.tracks = []; S.focusId = null;
    $("btn_live_txt").textContent = "实时拍摄";
    $("btn_live").classList.add("on");
    if (!S.stream) await startCamera();
    S.running = true;
    return;
  }
  S.running = !S.running;
  $("btn_live").classList.toggle("on", S.running);
  $("btn_live_txt").textContent = S.running ? "实时拍摄" : "已暂停";
});

$("btn_gallery").addEventListener("click", () => $("filepick").click());
$("filepick").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  const url = URL.createObjectURL(file);
  photo.onload = async () => {
    S.mode = "photo"; S.tracks = []; S.focusId = null;
    video.style.display = "none"; photo.style.display = "block";
    $("btn_live").classList.remove("on"); $("btn_live_txt").textContent = "返回实时";
    try {
      if (!S.detectorImage) S.detectorImage = await makeDetector("IMAGE");
      else S.detectorImage.setOptions({ scoreThreshold: S.threshold });
      const res = S.detectorImage.detect(photo);
      const now = performance.now();
      S.tracks = (res.detections || []).map(d => {
        const c = d.categories[0];
        return { id: S.nextId++, key: c.categoryName, score: c.score, box: d.boundingBox,
                 cx: d.boundingBox.originX + d.boundingBox.width / 2,
                 cy: d.boundingBox.originY + d.boundingBox.height / 2,
                 lastSeen: now, est: estimate(d.boundingBox, photo.naturalHeight, c.categoryName) };
      });
      if (!S.tracks.length) showMsg("识别完成", "这张照片里没有识别到 80 类里的物体，换一张试试，或者在设置里把置信度阈值调低一点。");
    } catch (err) {
      showMsg("识别失败", "这张照片没能完成识别，换一张再试。");
    }
  };
  photo.src = url;
});

/* ---------- 设置 ---------- */
$("btn_settings").addEventListener("click", () => {
  openSheet(`
    <h3>设置 · SETTINGS</h3>
    <div class="srow"><div><div class="lab">置信度阈值</div><div class="hint">越低认得越多，也越容易误认（当前 <span id="thv">${S.threshold.toFixed(2)}</span>）</div></div>
      <input type="range" id="th" min="0.2" max="0.8" step="0.05" value="${S.threshold}"></div>
    <div class="srow"><div><div class="lab">距离与尺寸估算</div><div class="hint">单目估算，按类别典型尺寸反推，不准但能参考</div></div>
      <div class="switch ${S.showDist ? "on" : ""}" id="swdist"></div></div>
    <div class="srow"><div><div class="lab">右侧目标流</div><div class="hint">LIVE OBJECT STREAM 列表</div></div>
      <div class="switch ${S.showStream ? "on" : ""}" id="swstream"></div></div>
    <div class="note">识别在本机完成（EfficientDet-Lite0 · COCO 80 类），画面不上传任何服务器。距离数字是估算值：远处小目标误差会很大，别拿它当测距仪用。</div>
    <button class="bigbtn" id="setdone">完成</button>`);
  $("th").addEventListener("input", (ev) => {
    S.threshold = parseFloat(ev.target.value);
    $("thv").textContent = S.threshold.toFixed(2);
    if (S.detectorVideo) S.detectorVideo.setOptions({ scoreThreshold: S.threshold });
  });
  $("swdist").addEventListener("click", (ev) => { S.showDist = !S.showDist; ev.target.classList.toggle("on", S.showDist); });
  $("swstream").addEventListener("click", (ev) => { S.showStream = !S.showStream; ev.target.classList.toggle("on", S.showStream); });
  $("setdone").addEventListener("click", closeSheet);
});
