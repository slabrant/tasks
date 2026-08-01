import { TaskNode, TaskTree } from './state.js';
import { View } from './view.js';

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

// Remove close-pane event listener as it's handled by swipe/background click now
// document.getElementById('close-pane').addEventListener('click', () => {
//     view.deselect();
// });

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
    const stack = [];

    const fail = (lineNo, message) => ({ root: null, error: `Line ${lineNo}: ${message}` });

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
            const note = noteMatch[1].trim();
            lastTask.notes += (lastTask.notes ? "\n" : "") + note;
        }
    }

    if (!root) {
        return { root: null, error: 'No tasks found. Expected lines like "- [ ] Task".' };
    }
    return { root, error: null };
}
