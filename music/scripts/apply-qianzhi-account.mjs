import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const foliaDir = path.resolve(scriptDir, "../folia");

const accountService = String.raw\`import { createClient, type Session, type User } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
const supabaseUrl = (env.VITE_QZNB_SUPABASE_URL || '').trim().replace(/\\/$/, '');
const anonKey = (env.VITE_QZNB_SUPABASE_ANON_KEY || '').trim();

export const isQianzhiAccountConfigured = Boolean(supabaseUrl && anonKey);

const client = isQianzhiAccountConfigured
    ? createClient(supabaseUrl, anonKey, {
        auth: {
            storageKey: 'qznb-music-auth-v1',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
        },
    })
    : null;

export type QianzhiLoginMethod = 'email' | 'username';

export function resolveQianzhiLoginMethod(identifier: string): QianzhiLoginMethod | null {
    const value = identifier.trim();
    if (!value) return null;
    return value.includes('@') ? 'email' : 'username';
}

function authError(code: string): Error {
    return new Error('qznb-auth:' + code);
}

function mapSupabaseError(error: { message?: string; status?: number } | null): Error {
    const message = String(error?.message || '').toLowerCase();
    if (error?.status === 429 || message.includes('rate limit') || message.includes('too many')) {
        return authError('rate_limited');
    }
    if (message.includes('invalid login') || message.includes('invalid credentials')
        || message.includes('email not confirmed') || message.includes('password')) {
        return authError(message.includes('email not confirmed') ? 'email_not_confirmed' : 'invalid_credentials');
    }
    return authError('unavailable');
}

export async function signInWithQianzhiAccount(identifier: string, password: string): Promise<Session> {
    if (!client) throw authError('not_configured');
    const value = identifier.trim();
    const method = resolveQianzhiLoginMethod(value);
    if (!method || !password) throw authError('invalid_credentials');

    if (method === 'email') {
        const { data, error } = await client.auth.signInWithPassword({ email: value, password });
        if (error || !data.session) throw mapSupabaseError(error);
        return data.session;
    }

    let response: Response;
    try {
        response = await fetch(supabaseUrl + '/functions/v1/username-login', {
            method: 'POST',
            headers: {
                apikey: anonKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: value, password }),
            cache: 'no-store',
            credentials: 'omit',
        });
    } catch {
        throw authError('network');
    }

    let payload: { ok?: boolean; code?: string; session?: { access_token?: string; refresh_token?: string } };
    try {
        payload = await response.json() as typeof payload;
    } catch {
        throw authError('unavailable');
    }

    if (!response.ok || payload.ok !== true || !payload.session?.access_token || !payload.session?.refresh_token) {
        throw authError(payload.code || (response.status === 429 ? 'rate_limited' : 'invalid_credentials'));
    }

    const { data, error } = await client.auth.setSession({
        access_token: payload.session.access_token,
        refresh_token: payload.session.refresh_token,
    });
    if (error || !data.session) throw mapSupabaseError(error);
    return data.session;
}

export async function getQianzhiSession(): Promise<Session | null> {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw mapSupabaseError(error);
    return data.session;
}

export function subscribeQianzhiAuth(listener: (session: Session | null) => void): () => void {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((_event, session) => listener(session));
    return () => data.subscription.unsubscribe();
}

export async function signOutQianzhiAccount(): Promise<void> {
    if (!client) return;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw mapSupabaseError(error);
}

export type QianzhiAccountUser = User;
\`;

const accountRow = String.raw\`import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session } from '@supabase/supabase-js';
import { Button, Row } from '../kit';
import {
    getQianzhiSession,
    isQianzhiAccountConfigured,
    signInWithQianzhiAccount,
    signOutQianzhiAccount,
    subscribeQianzhiAuth,
} from '../../../../services/qianzhiAccount';
import { openOutsideLink } from '../../../../utils/system/outsideLink';

const COPY = {
    zh: {
        label: '堯账号',
        description: '使用主站已有账号登录；账号数据与主站共用，音乐站会话独立保存。',
        identifier: '邮箱或用户名',
        password: '密码',
        signIn: '登录堯账号',
        signingIn: '正在登录…',
        signOut: '退出音乐站账号',
        register: '还没有账号？前往堯主站',
        connected: '已连接',
        notConfigured: '账号登录尚未配置。完成音乐站部署配置后即可使用。',
        invalid_credentials: '账号或密码不正确。',
        email_not_confirmed: '该邮箱尚未完成验证，请先在主站完成验证。',
        rate_limited: '尝试次数过多，请稍后再试。',
        unavailable: '登录服务暂时不可用，请稍后重试。',
        network: '网络连接失败，请检查网络后重试。',
        not_configured: '账号登录尚未配置。',
        failed: '登录失败，请稍后重试。',
    },
    en: {
        label: 'Qianzhi account',
        description: 'Sign in with your existing main-site account. Music keeps a separate local session.',
        identifier: 'Email or username',
        password: 'Password',
        signIn: 'Sign in',
        signingIn: 'Signing in…',
        signOut: 'Sign out on this music site',
        register: 'Need an account? Visit Qianzhi',
        connected: 'Connected',
        notConfigured: 'Account sign-in is not configured for this deployment yet.',
        invalid_credentials: 'The account name or password is incorrect.',
        email_not_confirmed: 'Please verify this email on the main site first.',
        rate_limited: 'Too many attempts. Please try again later.',
        unavailable: 'The sign-in service is temporarily unavailable.',
        network: 'Network error. Check your connection and try again.',
        not_configured: 'Account sign-in is not configured.',
        failed: 'Sign-in failed. Please try again.',
    },
} as const;

const QianzhiAccountRow: React.FC = () => {
    const { i18n } = useTranslation();
    const copy = i18n.resolvedLanguage?.startsWith('zh') ? COPY.zh : COPY.en;
    const [session, setSession] = useState<Session | null>(null);
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        void getQianzhiSession()
            .then(value => { if (alive) setSession(value); })
            .catch(() => { if (alive) setError(copy.unavailable); });
        const unsubscribe = subscribeQianzhiAuth(value => {
            if (alive) setSession(value);
        });
        return () => {
            alive = false;
            unsubscribe();
        };
    }, []);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || !isQianzhiAccountConfigured) return;
        setBusy(true);
        setError('');
        try {
            const value = await signInWithQianzhiAccount(identifier, password);
            setSession(value);
            setPassword('');
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : '';
            const code = message.startsWith('qznb-auth:') ? message.slice('qznb-auth:'.length) : 'failed';
            setError(COPY.zh[code as keyof typeof COPY.zh] ? copy[code as keyof typeof copy] : copy.failed);
        } finally {
            setBusy(false);
        }
    };

    const signOut = async () => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            await signOutQianzhiAccount();
            setSession(null);
        } catch {
            setError(copy.failed);
        } finally {
            setBusy(false);
        }
    };

    const userLabel = session?.user.email || copy.connected;

    return (
        <Row label={copy.label} note={copy.description}>
            <div className="w-full min-w-0 space-y-2">
                {!isQianzhiAccountConfigured ? (
                    <p className="text-xs leading-5 text-[color:var(--st-t2)]">{copy.notConfigured}</p>
                ) : session ? (
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                        <span className="min-w-0 break-all text-xs text-[color:var(--st-t2)]">{userLabel}</span>
                        <Button variant="quiet" onClick={() => void signOut()} disabled={busy}>
                            {copy.signOut}
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={submit} className="w-full space-y-2">
                        <input
                            value={identifier}
                            onChange={event => setIdentifier(event.target.value)}
                            type="text"
                            autoComplete="username"
                            autoCapitalize="none"
                            spellCheck={false}
                            aria-label={copy.identifier}
                            placeholder={copy.identifier}
                            className="w-full min-w-0 rounded-lg border border-[var(--st-line)] bg-[var(--st-card)] px-3 py-2 text-sm text-[color:var(--st-t1)] outline-none placeholder:text-[color:var(--st-t3)] focus:border-[color:var(--st-t2)]"
                        />
                        <input
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            type="password"
                            autoComplete="current-password"
                            aria-label={copy.password}
                            placeholder={copy.password}
                            className="w-full min-w-0 rounded-lg border border-[var(--st-line)] bg-[var(--st-card)] px-3 py-2 text-sm text-[color:var(--st-t1)] outline-none placeholder:text-[color:var(--st-t3)] focus:border-[color:var(--st-t2)]"
                        />
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button variant="quiet" onClick={() => openOutsideLink('https://qianzhi.pw')}>
                                {copy.register}
                            </Button>
                            <Button submit disabled={busy || !identifier.trim() || !password}>
                                {busy ? copy.signingIn : copy.signIn}
                            </Button>
                        </div>
                        {error && <p role="alert" className="text-xs leading-5 text-red-500">{error}</p>}
                    </form>
                )}
                {session && error && <p role="alert" className="text-xs leading-5 text-red-500">{error}</p>}
            </div>
        </Row>
    );
};

export default QianzhiAccountRow;
\`;

const testSource = String.raw\`import { describe, expect, it } from 'vitest';
import { resolveQianzhiLoginMethod } from '../../../src/services/qianzhiAccount';

describe('Qianzhi account login method', () => {
    it('treats email identifiers as Supabase email login', () => {
        expect(resolveQianzhiLoginMethod(' member@example.com ')).toBe('email');
    });

    it('treats non-email identifiers as main-site username login', () => {
        expect(resolveQianzhiLoginMethod('student_name')).toBe('username');
    });

    it('rejects an empty identifier', () => {
        expect(resolveQianzhiLoginMethod('   ')).toBeNull();
    });
});
\`;

async function writeFile(relativePath, content) {
    const target = path.join(foliaDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    let current = null;
    try { current = await fs.readFile(target, 'utf8'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (current === content) return;
    if (current !== null) {
        throw new Error('Refusing to overwrite an existing Folia overlay file with different contents: ' + relativePath);
    }
    await fs.writeFile(target, content, 'utf8');
}

const helpPath = path.join(foliaDir, 'src/components/modal/settings/pages/HelpPage.tsx');
let help = await fs.readFile(helpPath, 'utf8');
const importLine = "import QianzhiAccountRow from './QianzhiAccountRow';";
if (!help.includes(importLine)) {
    const anchor = "import { iconLabel } from './iconLabel';";
    const index = help.indexOf(anchor);
    if (index < 0 || help.indexOf(anchor, index + anchor.length) >= 0) {
        throw new Error('Could not safely locate HelpPage import anchor.');
    }
    help = help.slice(0, index + anchor.length) + '\n' + importLine + help.slice(index + anchor.length);
}

const groupAnchor = '<Group def={ABOUT} bare>';
if (!help.includes('<QianzhiAccountRow />')) {
    const index = help.indexOf(groupAnchor);
    if (index < 0 || help.indexOf(groupAnchor, index + groupAnchor.length) >= 0) {
        throw new Error('Could not safely locate HelpPage About group anchor.');
    }
    const insertAt = index + groupAnchor.length;
    help = help.slice(0, insertAt) + '\n                <QianzhiAccountRow />' + help.slice(insertAt);
}
await fs.writeFile(helpPath, help, 'utf8');

await writeFile('src/services/qianzhiAccount.ts', accountService);
await writeFile('src/components/modal/settings/pages/QianzhiAccountRow.tsx', accountRow);
await writeFile('test/unit/qianzhiAccount/loginMethod.test.ts', testSource);

console.log('Applied optional shared Qianzhi Supabase account login to Folia Help > About.');
