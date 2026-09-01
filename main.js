import { TaskTree } from './state.js';
import { View } from './view.js';
import { exportToMarkdown, importFromMarkdown } from './markdown.js';
import { Sync } from './sync.js';
import {
    DEFAULT_SETTINGS, clearToken, isConfigured, loadSettings, loadToken,
    saveSettings, saveToken, tokenExpiry,
} from './github.js';

const state = new TaskTree();
state.load();
const view = new View(state);

// Initial render
view.render();

// Details Pane Events
document.getElementById('task-name').addEventListener('input', (e) => {
    if (view.selectedNodeId) {
        state.updateNode(view.selectedNodeId, { name: e.target.value });
        view.render();
    }
});

document.getElementById('task-notes').addEventListener('input', (e) => {
    view.sizeNotesField();
    if (view.selectedNodeId) {
        state.updateNode(view.selectedNodeId, { notes: e.target.value });
        view.render();
    }
});

// A change of width moves where lines wrap, which changes the room the field needs.
window.addEventListener('resize', () => {
    view.sizeNotesField();
});

document.getElementById('task-complete').addEventListener('change', (e) => {
    if (view.selectedNodeId) {
        state.updateNode(view.selectedNodeId, { complete: e.target.checked });
        view.render();
    }
});

document.getElementById('task-private').addEventListener('change', (e) => {
    if (view.selectedNodeId) {
        state.updateNode(view.selectedNodeId, { private: e.target.checked });
        view.selectNode(view.selectedNodeId);
    }
});

document.getElementById('close-pane').addEventListener('click', () => {
    view.deselect();
});

// Action Buttons
document.getElementById('btn-up').addEventListener('click', () => {
    if (view.selectedNodeId && state.moveUp(view.selectedNodeId)) {
        view.selectNode(view.selectedNodeId);
    }
});

document.getElementById('btn-down').addEventListener('click', () => {
    if (view.selectedNodeId && state.moveDown(view.selectedNodeId)) {
        view.selectNode(view.selectedNodeId);
    }
});

document.getElementById('btn-add-child').addEventListener('click', () => {
    if (view.selectedNodeId) {
        const newNode = state.addChild(view.selectedNodeId);
        view.selectNode(newNode.id);
        document.getElementById('task-name').focus();
    }
});

document.getElementById('btn-add-sibling').addEventListener('click', () => {
    if (view.selectedNodeId) {
        const newNode = state.addSibling(view.selectedNodeId);
        if (newNode) {
            view.selectNode(newNode.id);
            document.getElementById('task-name').focus();
        }
    }
});

document.getElementById('btn-delete').addEventListener('click', () => {
    if (view.selectedNodeId) {
        const idToDelete = view.selectedNodeId;
        view.deselect();
        state.deleteNode(idToDelete);
        view.render();
    }
});

document.getElementById('btn-clear').addEventListener('click', () => {
    if (view.selectedNodeId) {
        state.updateNode(view.selectedNodeId, { name: "", notes: "", complete: false, children: [] });
        view.selectNode(view.selectedNodeId);
        document.getElementById('task-name').focus();
    }
});

// Undo / Redo
document.getElementById('undo-btn').addEventListener('click', () => {
    if (state.undo()) view.render();
});

document.getElementById('redo-btn').addEventListener('click', () => {
    if (state.redo()) view.render();
});

// Menu System
const mainMenu = document.getElementById('main-menu');
const mdModal = document.getElementById('markdown-modal');
const helpModal = document.getElementById('help-modal');
const mdText = document.getElementById('md-text');

document.getElementById('menu-toggle').addEventListener('click', () => {
    mainMenu.classList.remove('hidden');
    updateMenuButtons();
});

document.getElementById('menu-hide-completed').addEventListener('click', () => {
    state.toggleHideCompleted();
    view.render();
    updateMenuButtons();
});

document.getElementById('menu-show-private').addEventListener('click', () => {
    state.toggleShowPrivate();
    view.render();
    if (view.selectedNodeId) view.selectNode(view.selectedNodeId);
    updateMenuButtons();
});

function updateMenuButtons() {
    const completed = document.getElementById('menu-hide-completed');
    completed.textContent = state.hideCompleted ? "Show Completed Tasks" : "Hide Completed Tasks";
    const priv = document.getElementById('menu-show-private');
    priv.textContent = state.showPrivate ? "Hide Private Tasks" : "Show Private Tasks";
}

// Everything the export left out, counted the way the tree hides it: a
// completed task takes its whole subtree with it, complete or not.
const countDescendants = (node) =>
    node.children.reduce((n, child) => n + 1 + countDescendants(child), 0);

const countHiddenTasks = (node) => node.children.reduce(
    (n, child) => n + (child.complete ? 1 + countDescendants(child) : countHiddenTasks(child)),
    0,
);

// The text matches the map: with completed tasks hidden, they are absent here
// too. That makes the box a partial copy of the tree, so it says so — importing
// it back would keep only what is shown.
const hiddenFromExport = () => (state.hideCompleted ? countHiddenTasks(state.root) : 0);

document.getElementById('menu-import-export').addEventListener('click', () => {
    mdText.value = exportToMarkdown(state.root, "", false, state.hideCompleted);

    const hidden = hiddenFromExport();
    const note = document.getElementById('md-hidden-note');
    note.classList.toggle('hidden', hidden === 0);
    if (hidden > 0) {
        note.textContent = `Completed tasks are hidden, so ${hidden} ${hidden === 1 ? 'task is' : 'tasks are'} missing from this text. Importing it back would delete ${hidden === 1 ? 'it' : 'them'} — choose Show Completed Tasks first to export everything.`;
    }

    mainMenu.classList.add('hidden');
    mdModal.classList.remove('hidden');
});

document.getElementById('menu-sync-now').addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    if (!isConfigured()) {
        openSyncSettings();
        return;
    }
    sync.pull().then((r) => {
        if (r && r.missing) offerToCreateRemote();
    });
});

document.getElementById('menu-sync-settings').addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    openSyncSettings();
});

document.getElementById('menu-help').addEventListener('click', () => {
    mainMenu.classList.add('hidden');

    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    document.getElementById('help-desktop').classList.toggle('hidden', isMobile);
    document.getElementById('help-mobile').classList.toggle('hidden', !isMobile);
    
    helpModal.classList.remove('hidden');
});

document.getElementById('menu-close').addEventListener('click', () => {
    mainMenu.classList.add('hidden');
});

document.getElementById('md-back').addEventListener('click', () => {
    mdModal.classList.add('hidden');
    mainMenu.classList.remove('hidden');
});

document.getElementById('help-close').addEventListener('click', () => {
    helpModal.classList.add('hidden');
    mainMenu.classList.remove('hidden');
});

mainMenu.addEventListener('click', (e) => {
    if (e.target === mainMenu) mainMenu.classList.add('hidden');
});

mdModal.addEventListener('click', (e) => {
    if (e.target === mdModal) mdModal.classList.add('hidden');
});

helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
});

document.getElementById('md-import').addEventListener('click', () => {
    const { root, error } = importFromMarkdown(mdText.value);
    if (error) {
        alert(error);
        return;
    }
    // Import replaces the whole tree, so importing a filtered export drops the
    // completed tasks it never contained. Worth asking about rather than doing.
    const hidden = hiddenFromExport();
    if (hidden > 0 && !confirm(
        `Completed tasks are hidden, so ${hidden} ${hidden === 1 ? 'task is' : 'tasks are'} not in this text. `
        + `Importing replaces the whole tree, which would delete ${hidden === 1 ? 'it' : 'them'}.\n\n`
        + `Import anyway?`)) {
        return;
    }
    state.root = root;
    state.saveState();
    view.render();
    mdModal.classList.add('hidden');
});

// GitHub Sync
const syncModal = document.getElementById('sync-modal');
const syncStatus = document.getElementById('sync-status');
const syncLabel = document.getElementById('sync-label');
const syncResult = document.getElementById('sync-result');
const syncFields = {
    owner: document.getElementById('sync-owner'),
    repo: document.getElementById('sync-repo'),
    path: document.getElementById('sync-path'),
    branch: document.getElementById('sync-branch'),
    expiry: document.getElementById('sync-expiry'),
};
const syncTokenField = document.getElementById('sync-token');
const syncExpiryNote = document.getElementById('sync-expiry-note');

const sync = new Sync({
    // Deliberately unfiltered, unlike the Import/Export box. The synced file is
    // the durable copy of the tree, so hiding completed tasks in the view must
    // never be what erases them from it.
    getText: () => exportToMarkdown(state.root),
    applyText: (md) => {
        const { root } = importFromMarkdown(md);
        if (!root) return false;
        state.root = root;
        state.saveState();
        view.render();
        return true;
    },
    onStatus: (kind, message) => {
        // An expiring token outranks whatever the last sync did, because sync
        // will simply stop working on the date shown.
        const expiry = tokenExpiry();
        let shownKind = kind;
        let shownMessage = message;
        if (expiry && expiry.level === 'expired' && kind !== 'off') {
            shownKind = 'error';
            shownMessage = 'Token has expired — add a new one in Sync Settings';
        } else if (expiry && expiry.level === 'soon' && kind !== 'off') {
            shownMessage = `${message} · ${expiry.text}`;
        }
        syncStatus.className = `sync-${shownKind}`;
        syncLabel.textContent = shownMessage;
        syncStatus.title = shownMessage;
    },
    onConflict: (mergedText) => {
        mdText.value = mergedText;
        mainMenu.classList.add('hidden');
        mdModal.classList.remove('hidden');
        alert('This file changed on GitHub and here. The conflicting parts are marked with <<<<<<< and >>>>>>>. Delete the markers and the version you do not want, then press Import.');
    },
    onAuthError: (message) => {
        openSyncSettings();
        showSyncResult(`${message} Paste a new token and press Save.`, false);
        syncTokenField.focus();
    },
});

// applyText writes through saveState, which would immediately re-queue a push.
let applyingRemote = false;
const originalApply = sync.applyText;
sync.applyText = (md) => {
    applyingRemote = true;
    try {
        return originalApply(md);
    } finally {
        applyingRemote = false;
    }
};

state.onChange = () => {
    if (!applyingRemote) sync.schedulePush();
};

function showSyncResult(message, ok) {
    syncResult.textContent = message;
    syncResult.className = `sync-result ${ok ? 'ok' : 'bad'}`;
}

function openSyncSettings() {
    const settings = loadSettings();
    syncFields.owner.value = settings.owner;
    syncFields.repo.value = settings.repo;
    syncFields.path.value = settings.path || DEFAULT_SETTINGS.path;
    syncFields.branch.value = settings.branch || DEFAULT_SETTINGS.branch;
    syncFields.expiry.value = settings.expiry || '';
    syncTokenField.value = loadToken();
    syncResult.className = 'sync-result hidden';
    updateExpiryNote();
    syncModal.classList.remove('hidden');
}

function updateExpiryNote() {
    const expiry = tokenExpiry({ ...loadSettings(), expiry: syncFields.expiry.value });
    if (!expiry) {
        syncExpiryNote.className = 'hint hidden';
        return;
    }
    syncExpiryNote.textContent = expiry.level === 'ok'
        ? expiry.text
        : `${expiry.text}. Create a new one on GitHub and paste it above.`;
    syncExpiryNote.className = expiry.level === 'ok' ? 'hint' : 'hint warn';
}

function readSyncFields() {
    return {
        owner: syncFields.owner.value,
        repo: syncFields.repo.value,
        path: syncFields.path.value,
        branch: syncFields.branch.value,
        expiry: syncFields.expiry.value,
    };
}

syncFields.expiry.addEventListener('change', () => {
    saveSettings(readSyncFields());
    updateExpiryNote();
});

function offerToCreateRemote() {
    const s = loadSettings();
    if (confirm(`${s.path} does not exist in ${s.owner}/${s.repo} on ${s.branch}. Create it from the tasks on this device?`)) {
        sync.createRemote();
    }
}

document.getElementById('sync-save').addEventListener('click', () => {
    saveSettings(readSyncFields());
    saveToken(syncTokenField.value);
    if (!isConfigured()) {
        showSyncResult('Owner, repo, file path and token are all needed before sync can run.', false);
        return;
    }
    showSyncResult('Saved.', true);
    sync.pull().then((r) => {
        if (r && r.missing) offerToCreateRemote();
    });
});

document.getElementById('sync-test').addEventListener('click', async () => {
    saveSettings(readSyncFields());
    saveToken(syncTokenField.value);
    if (!isConfigured()) {
        showSyncResult('Fill in owner, repo, file path and token first.', false);
        return;
    }
    showSyncResult('Checking…', true);
    try {
        const { GitHubFile } = await import('./github.js');
        const result = await new GitHubFile(loadSettings(), loadToken()).read();
        if (result.missing) {
            showSyncResult('Reached GitHub, but that file is not there yet. Save, then create it.', true);
        } else {
            const lines = result.text.split('\n').filter((l) => l.includes('- [')).length;
            showSyncResult(`Connected. Found ${lines} task lines at ${loadSettings().path}.`, true);
        }
    } catch (e) {
        showSyncResult(e.message, false);
    }
});

document.getElementById('sync-clear-token').addEventListener('click', () => {
    clearToken();
    syncTokenField.value = '';
    showSyncResult('Token cleared from this browser. Sync is off until you add one.', true);
    sync.status('off', 'Sync off');
});

document.getElementById('sync-close').addEventListener('click', () => {
    syncModal.classList.add('hidden');
});

syncModal.addEventListener('click', (e) => {
    if (e.target === syncModal) syncModal.classList.add('hidden');
});

syncStatus.addEventListener('click', () => {
    if (!isConfigured()) {
        openSyncSettings();
        return;
    }
    sync.pull().then((r) => {
        if (r && r.missing) offerToCreateRemote();
    });
});

// Pull on load, and flush anything pending before the tab goes away.
if (isConfigured()) {
    sync.pull().then((r) => {
        if (r && r.missing) offerToCreateRemote();
    });
} else {
    sync.status('off', 'Sync off');
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && sync.dirty) sync.push();
});
