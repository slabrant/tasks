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

// Menu / Markdown
const mdModal = document.getElementById('markdown-modal');
const mdText = document.getElementById('md-text');

document.getElementById('menu-toggle').addEventListener('click', () => {
    mdText.value = exportToMarkdown(state.root);
    mdModal.classList.remove('hidden');
});

mdModal.addEventListener('click', (e) => {
    if (e.target === mdModal) {
        mdModal.classList.add('hidden');
    }
});

document.getElementById('md-import').addEventListener('click', () => {
    const newRoot = importFromMarkdown(mdText.value);
    if (newRoot) {
        state.root = newRoot;
        state.saveState();
        view.render();
        mdModal.classList.add('hidden');
    } else {
        alert("Failed to parse Markdown. Ensure it follows the '- [ ] Task' format.");
    }
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

    for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1].length : 0;
        const level = Math.floor(indent / 2);

        const taskMatch = line.match(/^\s*-\s*\[([ xX]?)\]\s*(.*)$/);
        if (taskMatch) {
            const complete = taskMatch[1].toLowerCase() === 'x';
            const name = taskMatch[2].trim();
            const node = new TaskNode(name, "", complete);

            if (!root) {
                root = node;
                stack[0] = node;
            } else {
                while (stack.length > level) stack.pop();
                const parent = stack[stack.length - 1];
                if (parent) {
                    parent.children.push(node);
                    stack[level] = node;
                }
            }
            lastTask = node;
        } else {
            const noteMatch = line.match(/^\s*-\s*(.*)$/);
            if (noteMatch && lastTask) {
                const note = noteMatch[1].trim();
                lastTask.notes += (lastTask.notes ? "\n" : "") + note;
            }
        }
    }
    return root;
}
