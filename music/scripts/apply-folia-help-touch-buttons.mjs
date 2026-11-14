import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
};
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Help touch buttons overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Help touch buttons overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// The touch stand-in for the Help page's keyboard shortcuts: a coarse pointer means there is
// no keyboard to press, so each shortcut becomes a button that sends the very keystroke the
// desktop shortcut would have sent, once the settings window has let go of the keyboard.
const helperPath = resolve(root, 'src/components/modal/settings/pages/helpTouchShortcuts.ts');
const helperSource = `import { isMacPlatform } from '../../../../utils/platform';

// src/components/modal/settings/pages/helpTouchShortcuts.ts
// The Help page's touch stand-in for its keyboard shortcuts.
//
// A coarse pointer means there is no keyboard to press, so the Help page shows a button per
// shortcut instead of its key caps. A button cannot call the shortcut's action directly: the
// actions live in the app's global keydown listeners (the command palette owns Ctrl+K/B/P/J,
// the playback bridge owns Space and the arrows), and the settings window claims the keyboard
// while it is open, so the palette will not open until the window is gone. The button therefore
// closes the settings window first and then sends the very keystroke the desktop shortcut would
// have sent, once the window has unmounted; the listeners answer it exactly like a physical key.
//
// The wait watches the settings window only (data-qz-settings-window, set on SettingsModal by
// this overlay): other windows carry the shared keyboard-window attribute too — a mods home page
// keeps it for as long as it is mounted — and waiting on any of them would stall the key for
// the full second even after settings has closed.
//
// The wait is bounded: if the window is still there after a second (a slow exit, a reopen),
// the key goes out anyway and the listeners' own guards decide whether it lands.

export type HelpTouchStroke = {
    /** The \`key\` the desktop shortcut sends. */
    key: string;
    /** The \`code\` the desktop shortcut sends; the listeners match on this first. */
    code: string;
    /** Held with the platform's primary modifier (Ctrl, Cmd on macOS). */
    withPrimaryModifier?: boolean;
};

/** The attribute the settings window carries; the wait below watches this one only. */
export const SETTINGS_WINDOW_SELECTOR = '[data-qz-settings-window="true"]';

/** How long to wait for the settings window to unmount before sending the key anyway. */
export const HELP_TOUCH_STROKE_WAIT_MS = 1000;

/** The keystroke a touch button sends, spelled the way the global listeners read it. */
export const buildHelpTouchKeyEvent = (stroke: HelpTouchStroke): KeyboardEventInit => ({
    key: stroke.key,
    code: stroke.code,
    ...(stroke.withPrimaryModifier ? (isMacPlatform ? { metaKey: true } : { ctrlKey: true }) : {}),
    bubbles: true,
    cancelable: true,
});

/** The stroke a primary-modifier shortcut (Ctrl+K/B/P/J) sends. */
export const primaryShortcutStroke = (key: string): HelpTouchStroke => ({
    key: key.toLowerCase(),
    code: \`Key\${key.toUpperCase()}\`,
    withPrimaryModifier: true,
});

/** The stroke a player-page key sends: its shown key, translated to a real key/code pair. */
export const playerControlStroke = (key: string, withPrimaryModifier?: boolean): HelpTouchStroke => {
    switch (key) {
        case 'Space': return { key: ' ', code: 'Space' };
        case '←': return { key: 'ArrowLeft', code: 'ArrowLeft', withPrimaryModifier };
        case '→': return { key: 'ArrowRight', code: 'ArrowRight', withPrimaryModifier };
        default: return { key: key.toLowerCase(), code: \`Key\${key.toUpperCase()}\`, withPrimaryModifier };
    }
};

/**
 * Close the settings window, then send the stroke once its keyboard claim is gone.
 * \`closeSettings\` is passed in so this module stays free of the settings store (and its
 * i18n import), which keeps it usable from a plain unit test.
 */
export const fireHelpTouchStroke = (
    stroke: HelpTouchStroke,
    closeSettings: () => void,
): void => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    closeSettings();
    const startedAt = Date.now();
    const tick = (): void => {
        if (!document.querySelector(SETTINGS_WINDOW_SELECTOR) || Date.now() - startedAt >= HELP_TOUCH_STROKE_WAIT_MS) {
            window.dispatchEvent(new KeyboardEvent('keydown', buildHelpTouchKeyEvent(stroke)));
            return;
        }
        window.setTimeout(tick, 50);
    };
    tick();
};
`;
await writeNewFile(helperPath, helperSource, 'help touch shortcuts helper');

// HelpPage: a fine pointer keeps the key caps; a coarse pointer gets a button per shortcut.
const helpPath = resolve(root, 'src/components/modal/settings/pages/HelpPage.tsx');
let help = await read(helpPath);

help = replaceOnce(help,
    "import { PRIMARY_MODIFIER_LABEL } from '../../../../utils/platform';",
    `import { PRIMARY_MODIFIER_LABEL } from '../../../../utils/platform';
import { useSupportsFinePointer } from '../../../../hooks/useSupportsFinePointer';
import { closeSettings } from '../../../../stores/useSettingsModalStore';
import { fireHelpTouchStroke, playerControlStroke, primaryShortcutStroke, type HelpTouchStroke } from './helpTouchShortcuts';`,
    'HelpPage imports');

help = replaceOnce(help,
    "const SHORTCUTS: SettingsGroupDef = { id: 'helpShortcuts', titleKey: 'help.keyboardShortcuts' };",
    `const SHORTCUTS: SettingsGroupDef = { id: 'helpShortcuts', titleKey: 'help.keyboardShortcuts' };
/** The same group on a coarse pointer: its rows are buttons, so the heading says so. */
const TOUCH_SHORTCUTS: SettingsGroupDef = { id: 'helpShortcuts', titleKey: 'help.touchShortcuts' };`,
    'touch shortcuts group def');

help = replaceOnce(help,
    `                    <Keys keys={withPrimaryModifier && index === 0 ? [PRIMARY_MODIFIER_LABEL, key] : [key]} />
                </React.Fragment>
            ))}
        </span>
    </div>
);`,
    `                    <Keys keys={withPrimaryModifier && index === 0 ? [PRIMARY_MODIFIER_LABEL, key] : [key]} />
                </React.Fragment>
            ))}
        </span>
    </div>
);

type TouchRowProps = {
    label: string;
    stroke: HelpTouchStroke;
    testId: string;
};

/**
 * A row that runs a shortcut when tapped: the touch stand-in for a key cap. The whole row is
 * the button, with the same chevron the settings rows use for "tap this to do something".
 */
const TouchRow: React.FC<TouchRowProps> = ({ label, stroke, testId }) => (
    <button
        type="button"
        data-testid={testId}
        onClick={() => fireHelpTouchStroke(stroke, closeSettings)}
        className="relative flex min-h-11 w-full items-center justify-between gap-4 px-4 py-2 text-left text-sm leading-5 text-[color:var(--st-t1)] transition-colors before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-[var(--st-line)] first:before:hidden hover:bg-[color-mix(in_srgb,var(--st-card)_93%,var(--st-t1))] active:scale-[0.99]"
    >
        <span className="min-w-0">{label}</span>
        <ChevronRight size={16} className="shrink-0 text-[color:var(--st-t2)]" />
    </button>
);`,
    'TouchRow component');

help = replaceOnce(help,
    '    const { t } = useTranslation();',
    `    const { t } = useTranslation();
    const supportsFinePointer = useSupportsFinePointer();`,
    'fine pointer check');

const oldGroups = [
    "            <div className={`${COLUMNS_CLASS} mt-2 gap-y-2`}>",
    '                <div>',
    '                    <Group def={SHORTCUTS}>',
    '                        {HELP_TAB_PRIMARY_SHORTCUTS.map(shortcut => (',
    "                            <KeyRow key={shortcut.id} label={t(shortcut.titleKey, shortcut.fallback)} withPrimaryModifier keys={[shortcut.key]} />",
    '                        ))}',
    '                    </Group>',
    '                </div>',
    '                <div>',
    '                    <Group def={PLAYER_KEYS}>',
    '                        {HELP_TAB_PLAYER_CONTROLS.map(control => (',
    '                            <KeyRow',
    '                                key={control.id}',
    "                                label={control.titleKeys.map(titleKey => t(titleKey)).join(' / ')}",
    '                                withPrimaryModifier={control.withPrimaryModifier}',
    '                                keys={control.keys}',
    '                            />',
    '                        ))}',
    '                    </Group>',
    '                </div>',
    '            </div>',
].join('\n');
const newGroups = [
    "            <div className={`${COLUMNS_CLASS} mt-2 gap-y-2`}>",
    '                <div>',
    '                    <Group def={supportsFinePointer ? SHORTCUTS : TOUCH_SHORTCUTS}>',
    '                        {supportsFinePointer',
    '                            ? HELP_TAB_PRIMARY_SHORTCUTS.map(shortcut => (',
    "                                <KeyRow key={shortcut.id} label={t(shortcut.titleKey, shortcut.fallback)} withPrimaryModifier keys={[shortcut.key]} />",
    '                            ))',
    '                            : HELP_TAB_PRIMARY_SHORTCUTS.map(shortcut => (',
    '                                <TouchRow',
    '                                    key={shortcut.id}',
    '                                    label={t(shortcut.titleKey, shortcut.fallback)}',
    '                                    testId={`help-touch-${shortcut.titleKey.split(\'.\').pop()}`}',
    '                                    stroke={primaryShortcutStroke(shortcut.key)}',
    '                                />',
    '                            ))}',
    '                    </Group>',
    '                </div>',
    '                <div>',
    '                    <Group def={PLAYER_KEYS}>',
    '                        {supportsFinePointer',
    '                            ? HELP_TAB_PLAYER_CONTROLS.map(control => (',
    '                                <KeyRow',
    '                                    key={control.id}',
    "                                    label={control.titleKeys.map(titleKey => t(titleKey)).join(' / ')}",
    '                                    withPrimaryModifier={control.withPrimaryModifier}',
    '                                    keys={control.keys}',
    '                                />',
    '                            ))',
    // A paired row is two actions on touch (previous / next, seek back / forward), so it
    // splits into one button per key instead of one row with two key caps.
    '                            : HELP_TAB_PLAYER_CONTROLS.flatMap(control =>',
    '                                control.keys.map((key, index) => (',
    '                                    <TouchRow',
    '                                        key={`${control.id}-${index}`}',
    '                                        label={t(control.titleKeys[index])}',
    '                                        testId={`help-touch-${control.titleKeys[index].split(\'.\').pop() ?? control.id}`}',
    '                                        stroke={playerControlStroke(key, control.withPrimaryModifier)}',
    '                                    />',
    '                                )),',
    '                            )}',
    '                    </Group>',
    '                </div>',
    '            </div>',
].join('\n');
help = replaceOnce(help, oldGroups, newGroups, 'touch shortcut groups');
await write(helpPath, help);

// Mark the settings window itself, so the touch buttons wait for this window to unmount and
// not for any other window that happens to carry the shared keyboard-window attribute.
const settingsModalPath = resolve(root, 'src/components/modal/SettingsModal.tsx');
let settingsModal = await read(settingsModalPath);
settingsModal = replaceOnce(settingsModal,
    `            data-folia-keyboard-window="true"
            data-ponder-page-scope={activeTab === 'help' ? 'help-page' : 'settings-page'}`,
    `            data-folia-keyboard-window="true"
            data-qz-settings-window="true"
            data-ponder-page-scope={activeTab === 'help' ? 'help-page' : 'settings-page'}`,
    'settings window marker');
await write(settingsModalPath, settingsModal);

// The touch group's heading, in every locale (Traditional Chinese is generated from zh-CN).
const localeTitles = [
    ['zh-CN', '"keyboardShortcuts": "键盘快捷键",', '"touchShortcuts": "快捷按键",'],
    ['en', '"keyboardShortcuts": "Keyboard Shortcuts",', '"touchShortcuts": "Quick Buttons",'],
    ['in', '"keyboardShortcuts": "Pintasan Keyboard",', '"touchShortcuts": "Tombol Cepat",'],
    ['vi', '"keyboardShortcuts": "Phím tắt",', '"touchShortcuts": "Nút nhanh",'],
];
for (const [locale, anchor, line] of localeTitles) {
    const localePath = resolve(root, `src/i18n/locales/${locale}.ts`);
    const content = await read(localePath);
    if (!content.includes(line)) {
        await write(localePath, replaceOnce(content, anchor, `${anchor}\n    ${line}`, `touch shortcuts title (${locale})`));
    }
}

// Unit tests for the stroke translation and the wait-for-the-window-to-close dispatch.
const testPath = resolve(root, 'test/unit/components/helpTouchShortcuts.test.ts');
const testSource = `// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
    buildHelpTouchKeyEvent,
    fireHelpTouchStroke,
    HELP_TOUCH_STROKE_WAIT_MS,
    playerControlStroke,
    primaryShortcutStroke,
} from '../../../src/components/modal/settings/pages/helpTouchShortcuts';

// test/unit/components/helpTouchShortcuts.test.ts
// The Help page's touch buttons stand in for keyboard shortcuts by sending the keystroke the
// desktop shortcut would have sent. The translation (shown key -> key/code/modifier) and the
// wait for the settings window to let go of the keyboard are the parts a reader cannot see.

describe('primaryShortcutStroke', () => {
    it('holds the primary modifier and spells the code from the shown key', () => {
        expect(buildHelpTouchKeyEvent(primaryShortcutStroke('K'))).toEqual({
            key: 'k',
            code: 'KeyK',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
    });
});

describe('playerControlStroke', () => {
    it('translates the player-page keys to real key/code pairs', () => {
        expect(playerControlStroke('Space')).toEqual({ key: ' ', code: 'Space' });
        expect(playerControlStroke('←')).toEqual({ key: 'ArrowLeft', code: 'ArrowLeft' });
        expect(playerControlStroke('→')).toEqual({ key: 'ArrowRight', code: 'ArrowRight' });
        expect(playerControlStroke('P')).toEqual({ key: 'p', code: 'KeyP' });
    });

    it('carries the primary modifier onto the previous/next arrows', () => {
        expect(buildHelpTouchKeyEvent(playerControlStroke('←', true))).toMatchObject({
            key: 'ArrowLeft',
            code: 'ArrowLeft',
            ctrlKey: true,
        });
        expect(buildHelpTouchKeyEvent(playerControlStroke('→'))).not.toHaveProperty('ctrlKey');
    });
});

describe('fireHelpTouchStroke', () => {
    const collectKeys = () => {
        const seen: KeyboardEvent[] = [];
        const record = (event: KeyboardEvent) => { seen.push(event); };
        window.addEventListener('keydown', record);
        return { seen, stop: () => window.removeEventListener('keydown', record) };
    };

    const keyboardWindow = () => {
        const blocker = document.createElement('div');
        blocker.setAttribute('data-qz-settings-window', 'true');
        document.body.append(blocker);
        return blocker;
    };

    it('closes settings and sends the key right away when no keyboard window is open', () => {
        const closeSettings = vi.fn();
        const { seen, stop } = collectKeys();
        try {
            fireHelpTouchStroke({ key: 'k', code: 'KeyK', withPrimaryModifier: true }, closeSettings);
            expect(closeSettings).toHaveBeenCalledTimes(1);
            expect(seen).toHaveLength(1);
            expect(seen[0]?.key).toBe('k');
            expect(seen[0]?.code).toBe('KeyK');
            expect(seen[0]?.ctrlKey).toBe(true);
        } finally {
            stop();
        }
    });

    it('waits for the keyboard window to unmount before sending the key', async () => {
        const closeSettings = vi.fn();
        const { seen, stop } = collectKeys();
        const blocker = keyboardWindow();
        vi.useFakeTimers();
        try {
            fireHelpTouchStroke({ key: ' ', code: 'Space' }, closeSettings);
            expect(seen).toHaveLength(0);
            blocker.remove();
            await vi.advanceTimersByTimeAsync(60);
            expect(seen).toHaveLength(1);
            expect(seen[0]?.key).toBe(' ');
            expect(seen[0]?.code).toBe('Space');
        } finally {
            vi.useRealTimers();
            blocker.remove();
            stop();
        }
    });

    it('sends the key anyway when the window never unmounts', async () => {
        const closeSettings = vi.fn();
        const { seen, stop } = collectKeys();
        const blocker = keyboardWindow();
        vi.useFakeTimers();
        try {
            fireHelpTouchStroke({ key: 'p', code: 'KeyP' }, closeSettings);
            await vi.advanceTimersByTimeAsync(HELP_TOUCH_STROKE_WAIT_MS + 60);
            expect(seen).toHaveLength(1);
            expect(seen[0]?.key).toBe('p');
        } finally {
            vi.useRealTimers();
            blocker.remove();
            stop();
        }
    });
});
`;
await writeNewFile(testPath, testSource, 'help touch shortcuts unit test');

// Component tests: on a coarse pointer the Help page shows buttons, and tapping one sends the
// keystroke the desktop shortcut would have sent.
const specPath = resolve(root, 'test/component/settingsHelpActions.spec.ts');
let spec = await read(specPath);
const specAnchor = `test('版本更新按钮打开当前 release notes，并可关闭返回 Help', async ({ page }) => {`;
const specBlock = `test.describe('粗指针下帮助页的快捷键是可点按钮', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test('不显示键盘键帽，显示快捷按键按钮', async ({ page }) => {
        await expect(page.locator('kbd')).toHaveCount(0);
        await expect(page.getByTestId('help-touch-quickActions')).toBeVisible();
        await expect(page.getByTestId('help-touch-playPause')).toBeVisible();
        await expect(page.getByTestId('help-touch-seekBackward')).toBeVisible();
        await expect(page.getByText('Quick Buttons')).toBeVisible();
    });

    test('点一下快捷操作，窗口收到 Ctrl+K 那一下按键', async ({ page }) => {
        await page.evaluate(() => {
            (window as unknown as { __keys: Array<Record<string, unknown>> }).__keys = [];
            window.addEventListener('keydown', event => {
                (window as unknown as { __keys: Array<Record<string, unknown>> }).__keys.push({
                    key: event.key,
                    code: event.code,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                });
            });
        });
        await page.getByTestId('help-touch-quickActions').click();
        await expect.poll(async () => page.evaluate(
            () => (window as unknown as { __keys: Array<unknown> }).__keys.length,
        )).toBe(1);
        const keys = await page.evaluate(
            () => (window as unknown as { __keys: Array<Record<string, unknown>> }).__keys,
        );
        expect(keys[0]).toEqual({ key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false });
    });
});

`;
if (!spec.includes('粗指针下帮助页的快捷键是可点按钮')) {
    spec = replaceOnce(spec, specAnchor, specBlock + specAnchor, 'coarse pointer help tests');
    await write(specPath, spec);
}

console.log('Applied Help touch buttons: desktop keeps key caps, coarse pointer gets tappable buttons.');
