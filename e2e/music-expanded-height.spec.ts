import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// 展开的音乐卡：按真实结构与度量（src/lib/island/layer.tsx ExpandedGrid +
// src/lib/island/metrics.ts expanded padding/rowGap + qianzhi-metrics.ts
// maxHeight 248）搭一个夹具，量自然高度。音量行在卡片最底下：如果
// 自然高度 + 上下 padding 逼近上限，真机上（Android Chrome 滑块、系统字体
// 与台式机量出来的总有几 px 出入）就会被截断，音量条被切掉一半
// （用户 2026-11-28 截图）。上限留 16px 余量。
test('Android Chrome: expanded music card fits its volume row within maxHeight', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chrome', 'Android Chrome viewport regression only');

  const islandCss = await readFile(path.join(process.cwd(), 'src/components/MusicIsland.css'), 'utf8');

  await page.setContent(`
    <head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #f5f7fb; }
      ${islandCss}
    </style>
    <div id="slot" data-slot="expanded" style="position:relative;left:50%;top:14px;transform:translateX(-50%);width:384.34px;box-sizing:border-box;padding:18.18px 17.81px 18.35px 18.5px;border-radius:47.9px;background:#050506;--qz-music-cover:linear-gradient(135deg,#1d5c38,#0b3d24);--qz-music-shade:linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.42));">
      <div id="inner" style="display:grid;grid-template-columns:max-content minmax(0,1fr) max-content;grid-template-areas:'leading center trailing' 'bottom bottom bottom';column-gap:10px;row-gap:8px;align-items:start;">
        <div style="grid-area:leading;min-width:0"><div style="width:max-content;max-width:100%">
          <span class="qz-island-expanded-head">
            <span class="qz-island-expanded-art-wrap"><span class="qz-island-art qz-island-art-expanded" style="display:block;width:52px;height:52px;background:#2e7d4f"></span></span>
            <span class="qz-island-expanded-meta"><strong>崂山道士 (Live)</strong><span>马思唯</span><small>正在播放</small></span>
          </span>
        </div></div>
        <div style="grid-area:center;position:relative;padding-top:20px;display:flex;justify-content:center;text-align:center"><div style="width:max-content;max-width:100%">
          <span class="qz-island-wave qz-island-wave-expanded is-playing"><i></i><i></i><i></i><i></i></span>
        </div></div>
        <div style="grid-area:trailing;justify-self:end"><div style="width:max-content;max-width:100%">
          <span class="qz-island-expanded-trailing">
            <button type="button" class="qz-island-close" aria-label="打开音乐空间">↗</button>
            <button type="button" class="qz-island-close" aria-label="收起灵动岛">✕</button>
          </span>
        </div></div>
        <div style="grid-area:bottom;padding-inline:0;contain:inline-size">
          <div class="qz-island-expanded-bottom">
            <div class="qz-island-progress">
              <span>0:11</span>
              <input type="range" min="0" max="285" step="1" value="11" style="--qz-music-progress:4%" aria-label="歌曲播放进度" />
              <span>4:45</span>
            </div>
            <div class="qz-island-controls">
              <button type="button" aria-label="后退 10 秒">↺10</button>
              <button type="button" aria-label="上一首">|◀</button>
              <button type="button" class="qz-island-play" aria-label="暂停音乐">❚❚</button>
              <button type="button" aria-label="下一首">▶|</button>
              <button type="button" aria-label="前进 10 秒">10↻</button>
            </div>
            <div class="qz-island-volume">
              <button type="button" aria-label="静音">🔊</button>
              <input type="range" min="0" max="100" step="1" value="100" style="--qz-music-volume:100%" aria-label="音量" />
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);

  const m = await page.evaluate(() => {
    const slot = document.querySelector('#slot') as HTMLElement;
    const inner = document.querySelector('#inner') as HTMLElement;
    const volume = document.querySelector('.qz-island-volume') as HTMLElement;
    const slotRect = slot.getBoundingClientRect();
    const volumeRect = volume.getBoundingClientRect();
    const cs = getComputedStyle(slot);
    return {
      gridHeight: Number.parseFloat(getComputedStyle(inner).height),
      slotHeight: slotRect.height,
      paddingTop: Number.parseFloat(cs.paddingTop),
      paddingBottom: Number.parseFloat(cs.paddingBottom),
      volumeBottom: volumeRect.bottom,
      slotContentBottom: slotRect.bottom - Number.parseFloat(cs.paddingBottom),
      slotBorderBottom: slotRect.bottom,
    };
  });

  // 真机高度 = 自然内容高 + 上下 padding，超过上限就会被截断。
  // 留 16px 给真机与台式机量测之间的出入。
  const naturalTotal = m.gridHeight + m.paddingTop + m.paddingBottom;
  expect(naturalTotal).toBeLessThanOrEqual(232);
  // 音量行整行必须落在内容区以内（不是被卡片底边切掉一半）。
  expect(m.volumeBottom).toBeLessThanOrEqual(m.slotContentBottom + 0.5);

  await page.locator('#slot').screenshot({ path: 'test-results/music-expanded-fixture.png' });
});
