import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// 网易云 fee=8 是 VIP 付费曲：上游 neteaseFailure.ts 的 NO_RIGHT_CASES 只列了
// fee 1（要会员）与 fee 4（要购买），fee 8 走 entitlement-required 兜底，
// 界面只会说「无权限」，没点名是 VIP 付费曲。构建期 overlay 补上 fee 8，
// 与上游文件本身无关（见 music/FOLIA_UPSTREAM.md：上游仓不动，改动走 overlay）。
const failurePath = resolve('music/folia/src/services/onlineMusic/netease/neteaseFailure.ts');
const source = await readFile(failurePath, 'utf8');
let current = source;

const originalMap = "const NO_RIGHT_CASES: Record<number, 'subscription-required' | 'purchase-required'> = { 1: 'subscription-required', 4: 'purchase-required' };";
const patchedMap = "const NO_RIGHT_CASES: Record<number, 'subscription-required' | 'purchase-required'> = { 1: 'subscription-required', 4: 'purchase-required', 8: 'subscription-required' };";
const originalComment = '// -110：账号没有这首歌的播放权限。fee 1 是要会员，4 是要购买（第三方整理的样本，可能），别的 fee 只知道没有权限。';
const patchedComment = '// -110：账号没有这首歌的播放权限。fee 1 是要会员，4 是要购买，8 是 VIP 付费曲也要会员（第三方整理的样本，可能），别的 fee 只知道没有权限。';

for (const [original, patched, label] of [
    [originalMap, patchedMap, 'NO_RIGHT_CASES'],
    [originalComment, patchedComment, 'NO_RIGHT_CASES comment'],
]) {
    if (current.includes(patched)) {
        console.log(`NetEase fee 8 ${label} already applied.`);
        continue;
    }
    const occurrences = current.split(original).length - 1;
    if (occurrences !== 1) {
        throw new Error(`Expected exactly one NetEase fee 8 ${label}; found ${occurrences}.`);
    }
    current = current.replace(original, patched);
    console.log(`Added NetEase fee 8 to ${label} (VIP paid song needs membership).`);
}
await writeFile(failurePath, current, 'utf8');
