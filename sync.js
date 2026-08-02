import { GitHubFile, commitMessage, isConfigured, loadSettings, loadToken } from './github.js';
import { merge3 } from './merge.js';

const BASE_KEY = 'taskSyncBase';

// The merge base: the exact text and sha this device last agreed on with
// GitHub. Kept in localStorage so it survives a reload.
function loadBase() {
    try {
        const raw = localStorage.getItem(BASE_KEY);
        return raw ? JSON.parse(raw) : { text: null, sha: null };
    } catch (e) {
        return { text: null, sha: null };
    }
}

function saveBase(base) {
    localStorage.setItem(BASE_KEY, JSON.stringify(base));
}

export function clearBase() {
    localStorage.removeItem(BASE_KEY);
}

export class Sync {
    // getText   -> current markdown for the local tree
    // applyText -> replace the local tree from markdown, returns true on success
    // onStatus  -> (state, message) for the indicator
    // onConflict-> (mergedTextWithMarkers) when a merge needs a human
    constructor({ getText, applyText, onStatus, onConflict, onAuthError, debounceMs = 5000 }) {
        this.getText = getText;
        this.applyText = applyText;
        this.onStatus = onStatus || (() => {});
        this.onConflict = onConflict || (() => {});
        this.onAuthError = onAuthError || (() => {});
        this.debounceMs = debounceMs;
        this.base = loadBase();
        this.timer = null;
        this.running = null;
        this.dirty = false;
    }

    file() {
        return new GitHubFile(loadSettings(), loadToken());
    }

    configured() {
        return isConfigured();
    }

    status(state, message) {
        this.onStatus(state, message);
    }

    // Edits never wait on the network; they just mark the working copy dirty.
    schedulePush() {
        if (!this.configured()) return;
        this.dirty = true;
        this.status('pending', 'Unsaved changes');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.push(), this.debounceMs);
    }

    // Serialise operations so a debounced push can't overlap a pull.
    queue(fn) {
        const run = () => fn().catch((e) => this.report(e));
        this.running = this.running ? this.running.then(run, run) : run();
        return this.running;
    }

    report(e) {
        if (e && e.kind === 'network') {
            this.status('offline', 'Offline — changes are saved locally');
        } else if (e && e.kind === 'auth') {
            // A rejected token is not something to report and move on from;
            // sync stays broken until a new one is entered.
            this.status('error', e.message);
            this.onAuthError(e.message);
        } else {
            this.status('error', e && e.message ? e.message : String(e));
        }
        return null;
    }

    async pull() {
        if (!this.configured()) return this.status('off', 'Sync not set up');
        return this.queue(async () => {
            this.status('syncing', 'Checking GitHub…');
            const remote = await this.file().read();

            if (remote.missing) {
                this.status('missing', 'No file on GitHub yet');
                return { missing: true };
            }

            const local = this.getText();

            // First sync on this device, or the file matches what we last saw.
            if (this.base.text === null) {
                if (local === remote.text) {
                    this.setBase(remote.text, remote.sha);
                    return this.settled();
                }
                // No shared history to merge against; treat GitHub as the truth
                // and let the user push over it deliberately if they disagree.
                this.applyText(remote.text);
                this.setBase(remote.text, remote.sha);
                return this.settled();
            }

            if (remote.text === this.base.text) {
                // Nothing new remotely. Push if this device has moved on.
                if (local !== this.base.text) return this.pushNow(remote.sha);
                return this.settled();
            }

            if (local === this.base.text) {
                // Only GitHub moved: fast-forward.
                this.applyText(remote.text);
                this.setBase(remote.text, remote.sha);
                return this.settled();
            }

            return this.mergeWith(remote);
        });
    }

    async mergeWith(remote) {
        const local = this.getText();
        const result = merge3(this.base.text, local, remote.text);

        if (!result.clean) {
            // Adopt their sha as the base so that once the user resolves the
            // markers by hand, the next push lands instead of conflicting again.
            this.setBase(remote.text, remote.sha);
            this.status('conflict', `${result.conflicts} conflict${result.conflicts === 1 ? '' : 's'} to resolve`);
            this.onConflict(result.text);
            return { conflict: true };
        }

        if (!this.applyText(result.text)) {
            this.status('error', 'Merged file did not parse. Nothing was changed.');
            return { error: true };
        }
        this.setBase(remote.text, remote.sha);
        return this.pushNow(remote.sha, 'Merged with GitHub');
    }

    async push() {
        if (!this.configured()) return this.status('off', 'Sync not set up');
        return this.queue(() => this.pushNow(this.base.sha));
    }

    async pushNow(sha, doneMessage) {
        const text = this.getText();
        if (this.base.text !== null && text === this.base.text) return this.settled(doneMessage);

        this.status('syncing', 'Saving to GitHub…');
        try {
            const written = await this.file().write(text, sha || this.base.sha, commitMessage());
            this.setBase(text, written.sha);
            return this.settled(doneMessage);
        } catch (e) {
            if (e.kind !== 'conflict') throw e;
            // Someone else wrote first. Re-read and merge, then try once more.
            const remote = await this.file().read();
            if (remote.missing) throw e;
            return this.mergeWith(remote);
        }
    }

    // Create the file for the first time.
    async createRemote() {
        return this.queue(async () => {
            const text = this.getText();
            this.status('syncing', 'Creating file on GitHub…');
            const written = await this.file().write(text, null, commitMessage());
            this.setBase(text, written.sha);
            return this.settled();
        });
    }

    setBase(text, sha) {
        this.base = { text, sha };
        saveBase(this.base);
    }

    settled(message) {
        this.dirty = false;
        clearTimeout(this.timer);
        this.status('synced', message || 'Synced');
        return { ok: true, merged: Boolean(message) };
    }
}
