// Direct browser-to-GitHub sync. No server: the app talks to the REST contents
// API with a fine-grained token the user supplies.

const SETTINGS_KEY = 'taskSyncSettings';
const TOKEN_KEY = 'taskSyncToken';

export const DEFAULT_SETTINGS = { owner: '', repo: '', path: 'tasks.md', branch: 'main', expiry: '' };

// How long before a token lapses we start saying so.
export const EXPIRY_WARN_DAYS = 14;

export function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        owner: settings.owner.trim(),
        repo: settings.repo.trim(),
        path: settings.path.trim() || DEFAULT_SETTINGS.path,
        branch: settings.branch.trim() || DEFAULT_SETTINGS.branch,
        expiry: (settings.expiry || '').trim(),
    }));
}

// GitHub shows the expiry date once, at creation, and never warns later. The
// date is recorded here so the app can, since a lapsed token just starts
// failing otherwise.
export function tokenExpiry(settings = loadSettings(), now = new Date()) {
    if (!settings.expiry) return null;
    const end = Date.parse(`${settings.expiry}T23:59:59Z`);
    if (Number.isNaN(end)) return null;
    const days = Math.floor((end - now.getTime()) / 86400000);
    if (days < 0) return { level: 'expired', days, text: 'Token has expired' };
    if (days <= EXPIRY_WARN_DAYS) {
        return { level: 'soon', days, text: `Token expires in ${days} day${days === 1 ? '' : 's'}` };
    }
    return { level: 'ok', days, text: `Token expires in ${days} days` };
}

export const loadToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token.trim());
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export function isConfigured(settings = loadSettings()) {
    return Boolean(settings.owner && settings.repo && settings.path && loadToken());
}

// btoa works on bytes, not characters, so anything non-ASCII has to be encoded
// to UTF-8 first or it throws.
export function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function decodeBase64(b64) {
    const binary = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export class SyncError extends Error {
    constructor(message, kind, status) {
        super(message);
        this.kind = kind; // 'auth' | 'notfound' | 'conflict' | 'network' | 'http'
        this.status = status;
    }
}

export class GitHubFile {
    constructor(settings, token) {
        this.settings = settings;
        this.token = token;
    }

    get url() {
        const { owner, repo, path } = this.settings;
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');
        return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
    }

    async request(url, options = {}) {
        let response;
        try {
            response = await fetch(url, {
                ...options,
                headers: {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${this.token}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                },
            });
        } catch (e) {
            throw new SyncError('Could not reach GitHub. Check your connection.', 'network');
        }

        let body = null;
        try {
            body = await response.json();
        } catch (e) {
            body = null;
        }

        if (response.ok) return body;

        const detail = body && body.message ? body.message : response.statusText;
        if (response.status === 401) {
            throw new SyncError('GitHub rejected the token. It may have expired or been revoked.', 'auth', 401);
        }
        if (response.status === 403) {
            throw new SyncError(`GitHub refused the request: ${detail}. Check the token has Contents read and write on this repo.`, 'auth', 403);
        }
        if (response.status === 404) {
            throw new SyncError('Not found. Either the file does not exist yet, or the token cannot see this repo.', 'notfound', 404);
        }
        if (response.status === 409 || response.status === 422) {
            throw new SyncError('The file changed on GitHub since this device last read it.', 'conflict', response.status);
        }
        throw new SyncError(`GitHub returned ${response.status}: ${detail}`, 'http', response.status);
    }

    // Resolves to { text, sha } or { missing: true } when the file is not there yet.
    async read() {
        const url = `${this.url}?ref=${encodeURIComponent(this.settings.branch)}`;
        try {
            const body = await this.request(url);
            if (body.encoding !== 'base64' || typeof body.content !== 'string') {
                throw new SyncError('That path is too large to sync through the contents API.', 'http');
            }
            return { text: decodeBase64(body.content), sha: body.sha };
        } catch (e) {
            if (e.kind === 'notfound') return { missing: true };
            throw e;
        }
    }

    // sha must be the sha this device last read, or null when creating the file.
    async write(text, sha, message) {
        const body = await this.request(this.url, {
            method: 'PUT',
            body: JSON.stringify({
                message,
                content: encodeBase64(text),
                branch: this.settings.branch,
                ...(sha ? { sha } : {}),
            }),
        });
        return { sha: body.content.sha };
    }
}

export function commitMessage(now = new Date()) {
    return `tasks: update from app ${now.toISOString().replace('T', ' ').slice(0, 19)}Z`;
}
