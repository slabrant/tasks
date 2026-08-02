import { TaskNode } from './state.js';

// A private subtree is marked at its root; everything beneath it inherits.
export const PRIVATE_MARKER = '{p}';

// ROT13 is its own inverse, so one function both ways. This is obfuscation,
// not encryption: it keeps the file from being readable at a glance in a diff
// or over a shoulder. The private repo and the token are the real boundary.
export function rot13(text) {
    return text.replace(/[a-zA-Z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
}

// A name that would otherwise be mistaken for a marker gets a {} in front.
const NEEDS_ESCAPE = /^(\{p\}|\{\})/;
const escapeName = (text) => (NEEDS_ESCAPE.test(text) ? `{}${text}` : text);

function parseName(raw) {
    let name = raw;
    let marked = false;
    if (name === PRIVATE_MARKER || name.startsWith(`${PRIVATE_MARKER} `)) {
        marked = true;
        name = name.slice(PRIVATE_MARKER.length).trim();
    }
    if (name.startsWith('{}')) name = name.slice(2);
    return { name, marked };
}

export function exportToMarkdown(node, indent = "", inheritedPrivate = false) {
    const isPrivate = inheritedPrivate || Boolean(node.private);
    // Every flagged node carries the marker, even one already inside a private
    // subtree. Dropping the redundant-looking marker would silently make the
    // inner task public the moment the outer one was unmarked.
    const marker = node.private ? `${PRIVATE_MARKER} ` : '';
    const name = escapeName(isPrivate ? rot13(node.name) : node.name);

    let md = `${indent}- [${node.complete ? 'x' : ' '}] ${marker}${name}\n`;
    if (node.notes) {
        const noteLines = node.notes.split('\n');
        for (const line of noteLines) {
            md += `${indent}  - ${isPrivate ? rot13(line) : line}\n`;
        }
    }
    for (const child of node.children) {
        md += exportToMarkdown(child, indent + "  ", isPrivate);
    }
    return md;
}

export function importFromMarkdown(md) {
    const lines = md.split('\n');
    let root = null;
    let lastTask = null;
    let lastTaskLevel = 0;
    let lastTaskPrivate = false;
    let noteLevel = null;
    const stack = [];
    const privateAt = [];

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
            const { name: rawName, marked } = parseName(taskMatch[2].trim());

            if (noteLevel !== null && level > noteLevel) return fail(lineNo, NOTE_PARENT);
            noteLevel = null;
            lastTaskLevel = level;

            const inherited = level > 0 ? Boolean(privateAt[level - 1]) : false;
            const isPrivate = inherited || marked;
            const node = new TaskNode(isPrivate ? rot13(rawName) : rawName, "", complete);
            // Only the subtree root is flagged, so export puts the marker back
            // in the same place it was read from.
            if (marked) node.private = true;

            if (!root) {
                if (level !== 0) return fail(lineNo, "the first task can't be indented.");
                root = node;
                stack[0] = node;
            } else if (level === 0) {
                return fail(lineNo, `"${node.name}" is a second top-level task, but a tree has one root. Indent it under "${root.name}".`);
            } else {
                while (stack.length > level) stack.pop();
                if (stack.length !== level) {
                    return fail(lineNo, `"${node.name}" is indented too deep for the task above it. Use two spaces per level.`);
                }
                stack[level - 1].children.push(node);
                stack[level] = node;
            }
            privateAt[level] = isPrivate;
            privateAt.length = level + 1;
            lastTask = node;
            lastTaskPrivate = isPrivate;
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
            const raw = noteMatch[1].trim();
            const note = lastTaskPrivate ? rot13(raw) : raw;
            lastTask.notes += (lastTask.notes ? "\n" : "") + note;
        }
    }

    if (!root) {
        return { root: null, error: 'No tasks found. Expected lines like "- [ ] Task".' };
    }
    return { root, error: null };
}
