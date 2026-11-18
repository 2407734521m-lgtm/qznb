// 海外视频播放分流 + 授权展示的共用逻辑（后台 AdminOverseasVideos 与前台 OverseasVideos 共用）。
// 不引入任何播放器依赖：mp4 / webm 直链用原生 <video>，YouTube 与其他嵌入源用 <iframe>，
// .mov / HLS / 未知格式一律只给提示 + 原链接，不做特殊处理。

export type OverseasPlaybackKind =
  | 'native-video'
  | 'unsupported'
  | 'youtube-iframe'
  | 'embed-iframe'
  | 'none';

export type OverseasPlayback = {
  kind: OverseasPlaybackKind;
  /** native-video / iframe 的播放地址；unsupported / none 时为空串。 */
  src: string;
};

export type OverseasVideoLike = {
  platform: string;
  external_video_id: string;
  embed_url?: string | null;
  file_url?: string | null;
  playback_status?: string | null;
};

/** 去掉 ? 查询串与 # 锚点后的小写文件后缀（无后缀返回 ''）。 */
export function fileExt(url: string | null | undefined): string {
  if (!url) return '';
  const clean = url.split('?')[0].split('#')[0].trim().toLowerCase();
  const m = /\.([a-z0-9]+)$/.exec(clean);
  return m ? m[1] : '';
}

/**
 * 按格式分流，决定一张视频卡片该怎么播：
 * - file_url 是 .mp4 / .webm → 原生 <video>
 * - file_url 是 .mov / .m3u8（HLS）/ 其他浏览器播不了的后缀，或 playback_status 是 unsupported → 只提示 + 原链接
 * - YouTube → youtube-nocookie <iframe>
 * - 其他有 embed_url 的源（如 Archive.org）→ 保留原有 <iframe>
 * - 都没有 → none（只给原链接）
 */
export function getOverseasPlayback(v: OverseasVideoLike): OverseasPlayback {
  const fileUrl = (v.file_url || '').trim();
  if (fileUrl) {
    const ext = fileExt(fileUrl);
    if (ext === 'mp4' || ext === 'webm') return { kind: 'native-video', src: fileUrl };
    return { kind: 'unsupported', src: '' };
  }
  if ((v.playback_status || '') === 'unsupported') return { kind: 'unsupported', src: '' };
  if (v.platform === 'youtube' && v.external_video_id) {
    return { kind: 'youtube-iframe', src: `https://www.youtube-nocookie.com/embed/${v.external_video_id}` };
  }
  const embedUrl = (v.embed_url || '').trim();
  if (embedUrl) return { kind: 'embed-iframe', src: embedUrl };
  return { kind: 'none', src: '' };
}

const LICENSE_LABEL: Record<string, string> = {
  unknown: '授权未知',
  embed_allowed: '仅官方嵌入，无转载许可',
  youtube_embed: '仅官方嵌入，无转载许可',
  cc0: 'CC0（公共领域，可自由使用）',
  cc_by: 'CC BY（署名后可使用）',
  cc_by_sa: 'CC BY-SA（署名-相同方式共享）',
  pexels: 'Pexels 授权（免费使用，需遵守 Pexels 条款）',
  pixabay: 'Pixabay 授权（免费使用，需遵守 Pixabay 条款）',
  licensed: '已获授权',
  public_domain: '公共领域',
  nasa_public_domain: 'NASA 公共领域（美国联邦政府作品，需署名 NASA）',
  rejected: '授权被拒',
};

/**
 * 授权名称：优先用采集器写回的 license_name（若迁移里有该列），
 * 否则用 license_type 的中文说明。注意：历史 YouTube 视频的
 * 'embed_allowed' 只是“可官方嵌入”的意思，绝不能显示成“可转载”。
 */
export function licenseLabel(licenseType: string | null | undefined, licenseName?: string | null): string {
  const name = (licenseName || '').trim();
  if (name) return name;
  const t = (licenseType || '').trim();
  if (!t) return '授权未知';
  return LICENSE_LABEL[t] || t;
}

export const PLAYBACK_STATUS_LABEL: Record<string, string> = {
  unchecked: '未检测',
  playable: '可播放',
  failed: '检测失败',
  unsupported: '格式不支持',
};

export function playbackStatusLabel(s: string | null | undefined): string {
  return PLAYBACK_STATUS_LABEL[(s || '').trim()] || '未检测';
}

export type LicenseBlock = { blocked: boolean; reason: string };

/**
 * 授权不明确的视频不能点发布。判断条件（与任务书一致）：
 * status 是 license_pending，或 copyright_status 是 unknown 且 license_url 为空。
 */
export function licenseBlock(v: {
  status?: string | null;
  copyright_status?: string | null;
  license_url?: string | null;
}): LicenseBlock {
  if ((v.status || '') === 'license_pending') {
    return { blocked: true, reason: '授权待确认，暂不能发布' };
  }
  if ((v.copyright_status || '') === 'unknown' && !(v.license_url || '').trim()) {
    return { blocked: true, reason: '授权不明且无授权链接，暂不能发布' };
  }
  return { blocked: false, reason: '' };
}

/**
 * 「确认授权有效」的白名单：只有真正允许转载的许可才能确认有效。
 * 明确排除：unknown（授权未知）、youtube_embed / embed_allowed（仅官方嵌入，
 * 无转载许可）、rejected（授权被拒）。pexels / pixabay / licensed 是平台自有授权，
 * 由平台条款兜底，同样需要 license_url 与 verified 才能通过。
 */
export const LICENSE_CONFIRM_WHITELIST: readonly string[] = [
  'cc0', 'public_domain', 'cc_by', 'cc_by_sa', 'nasa_public_domain',
  'licensed', 'pexels', 'pixabay',
];

export type LicenseConfirmCheck = { ok: boolean; reasons: string[] };

/**
 * 「确认授权有效」的三项校验，缺一不可：
 * 1. license_type 在白名单里；2. license_url 非空；3. copyright_status 为 verified。
 * 返回不通过的原因列表（中文），供面板内展示；校验不通过时不得写审核记录、不得改状态。
 * 注意：这层校验目前只能做在前端（后台直连 Supabase，没有服务端函数兜底）。
 */
export function checkLicenseConfirm(
  licenseType: string | null | undefined,
  licenseUrl: string | null | undefined,
  copyrightStatus: string | null | undefined,
): LicenseConfirmCheck {
  const reasons: string[] = [];
  const t = (licenseType || '').trim();
  if (!LICENSE_CONFIRM_WHITELIST.includes(t)) {
    reasons.push(`授权类型为“${licenseLabel(t)}”，不能确认有效`);
  }
  if (!(licenseUrl || '').trim()) {
    reasons.push('缺少授权链接，请先填写真实的许可证链接');
  }
  if ((copyrightStatus || '') !== 'verified') {
    reasons.push('版权状态不是“已核实有效”，请先在面板里选为“已核实有效”');
  }
  return { ok: reasons.length === 0, reasons };
}
