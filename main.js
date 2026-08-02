import { TaskNode, TaskTree } from './state.js';
import { View } from './view.js';
import { Sync } from './sync.js';
import {
    DEFAULT_SETTINGS, clearToken, isConfigured, loadSettings, loadToken,
    saveSettings, saveToken,
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
    if (view.selectedNodeId) {
        state.updateNode(view.selectedNodeId, { notes: e.target.value });
        view.render();
    }
});

document.getElementById('task-complete').addEventListener('change', (e) => {
    if (view.selectedNodeId) {
        state.updateNode(view.selectedNodeId, { complete: e.target.checked });
        view.render();
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

function updateMenuButtons() {
    const btn = document.getElementById('menu-hide-completed');
    btn.textContent = state.hideCompleted ? "Show Completed Tasks" : "Hide Completed Tasks";
}

document.getElementById('menu-import-export').addEventListener('click', () => {
    mdText.value = exportToMarkdown(state.root);
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
    state.root = root;
    state.saveState();
    view.render();
    mdModal.classList.add('hidden');
});

function exportToMarkdown(node, indent = "") {
    let md = `${indent}- [${node.complete ? 'x' : ' '}] ${node.name}\n`;
    if (node.notes) {
        const noteLines = node.notes.split('\n');
        for (const line of noteLines) {
            md += `${indent}  - ${line}\n`;
        }
    }
    for (const child of node.children) {
        md += exportToMarkdown(child, indent + "  ");
    }
    return md;
}

function importFromMarkdown(md) {
    const lines = md.split('\n');
    let root = null;
    let lastTask = null;
    let lastTaskLevel = 0;
    let noteLevel = null;
    const stack = [];

    const fail = (lineNo, message) => ({ root: null, error: `Line ${lineNo}: ${message}` });
    const NOTE_PARENT = 'a note can\'t have children. Give it a checkbox to make it a task, or unindent what follows it.';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNo = i + 1;
        if (!line.trim()) continue;

        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1].length : 0;
        const level = Math.floor(indent / 2);

        const taskMatch = line.match(/^\s*-\s*\[([ xX]?)\]\s*(.*)$/);
        if (taskMatch) {
            const complete = taskMatch[1].toLowerCase() === 'x';
            const name = taskMatch[2].trim();
            const node = new TaskNode(name, "", complete);

            if (noteLevel !== null && level > noteLevel) return fail(lineNo, NOTE_PARENT);
            noteLevel = null;
            lastTaskLevel = level;

            if (!root) {
                if (level !== 0) return fail(lineNo, "the first task can't be indented.");
                root = node;
                stack[0] = node;
            } else if (level === 0) {
                return fail(lineNo, `"${name}" is a second top-level task, but a tree has one root. Indent it under "${root.name}".`);
            } else {
                while (stack.length > level) stack.pop();
                if (stack.length !== level) {
                    return fail(lineNo, `"${name}" is indented too deep for the task above it. Use two spaces per level.`);
                }
                stack[level - 1].children.push(node);
                stack[level] = node;
            }
            lastTask = node;
        } else {
            const noteMatch = line.match(/^\s*-\s*(.*)$/);
            if (!noteMatch) {
                return fail(lineNo, 'not a task or a note. Every line starts with "- ".');
            }
            if (!lastTask) {
                return fail(lineNo, "a note here has no task above it to attach to.");
            }
            if (noteLevel !== null && level > noteLevel) return fail(lineNo, NOTE_PARENT);
            if (level !== lastTaskLevel + 1) {
                return fail(lineNo, `a note must sit two spaces in from its task, "${lastTask.name}".`);
            }
            noteLevel = level;
            const note = noteMatch[1].trim();
            lastTask.notes += (lastTask.notes ? "\n" : "") + note;
        }
    }

    if (!root) {
        return { root: null, error: 'No tasks found. Expected lines like "- [ ] Task".' };
    }
    return { root, error: null };
}

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
};
const syncTokenField = document.getElementById('sync-token');

const sync = new Sync({
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
        syncStatus.className = `sync-${kind}`;
        syncLabel.textContent = message;
        syncStatus.title = message;
    },
    onConflict: (mergedText) => {
        mdText.value = mergedText;
        mainMenu.classList.add('hidden');
        mdModal.classList.remove('hidden');
        alert('This file changed on GitHub and here. The conflicting parts are marked with <<<<<<< and >>>>>>>. Delete the markers and the version you do not want, then press Import.');
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
    syncTokenField.value = loadToken();
    syncResult.className = 'sync-result hidden';
    syncModal.classList.remove('hidden');
}

function readSyncFields() {
    return {
        owner: syncFields.owner.value,
        repo: syncFields.repo.value,
        path: syncFields.path.value,
        branch: syncFields.branch.value,
    };
}

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
