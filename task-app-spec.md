# Task Tree App — Specification

## Overview

A single-page, zero-dependency task management app rendered on an infinite pannable/zoomable canvas. Tasks are arranged as a left-to-right tree with orthogonal (horizontal + vertical only) connectors. No JS libraries. No frameworks. Pure HTML + CSS + JS.

---

## Layout & Visual Structure

### Canvas
- Infinite canvas with a **dot-grid or grid background** that is fixed — it does **not** scroll or zoom with the content. Only the task tree pans and zooms.
- Default cursor is a grab/pan cursor when hovering over the background.

### Tree Layout
- The **root node** is anchored on the left side.
- **Children** are stacked **vertically** to the **right** of their parent.
- Each level of depth shifts one column to the right.
- All connections are **orthogonal** (horizontal + vertical lines only — no diagonals).
- Connector routing: a horizontal line goes right from the parent, then a vertical line runs down the left side of all children, then a horizontal line goes right into each child. This creates an L/T-shaped connector pattern.
- Layout is **compact** — minimal spacing between nodes.

### Nodes
- Each node displays only the **task name**.
- **Completion** is signified entirely through styling — no checkbox icon on the node:
  - Incomplete: normal appearance.
  - Complete: name has a **strikethrough**, text is **dimmed/muted**, and the node has a subtle **background color shift** (e.g. slightly greyed out).
- A **colored left border accent** indicates when a node has notes/details attached. No border (or neutral border) when no notes exist.
- Nodes have a clean, minimal, chip-like appearance.

---

## Interaction Model

The interaction model prioritizes the two most frequent actions: **adding tasks** and **completing tasks**.

### Selection
- **Left-click a node** → selects it, opens the Details Pane.
- **Right-click a node** → toggles completion status (checked/unchecked). The browser context menu is suppressed.
- **Left-click the background** → deselects, closes the Details Pane.
- Only one node can be selected at a time.

### Panning
- **Left-click + drag on background** → pan the canvas.
- **Middle-click + drag** → pan the canvas.

### Zooming
- **Scroll wheel** → zoom in/out, centered on cursor position.

### Middle-click Split
- **Middle-click a node** → duplicates it as a new **child** of itself, copying the name and notes (and subtasks if any). The original node retains all its data.
- The intent is to quickly break a task into a parent + child for further decomposition. A "Clear" button in the Details Pane allows wiping the duplicated child's content if unwanted.

---

## Details Pane

Appears on the right side (or as an overlay panel) when a node is selected. Hidden when nothing is selected.

### Fields
- **Name** — editable text field (this is the only way to rename a node).
- **Notes/Details** — freeform text area for additional context. The presence of any content here triggers the node's visual signifier.
- **Completion checkbox** — the only way to toggle done/undone. Checking this triggers the node's completion styling.

### Task Action Buttons
All task mutations live here:

| Button | Behavior |
|---|---|
| Move Up | Moves this node up among its siblings |
| Move Down | Moves this node down among its siblings |
| Add Child | Adds a new empty child node to this node |
| Add Sibling | Adds a new empty node at the same level, directly below this one |
| Delete | Removes this node and all its descendants |
| Clear | Clears the name, notes, and subtasks of this node (used after a middle-click split if unwanted) |

---

## Persistent UI Controls

Two **Undo / Redo buttons** are always visible in the corner (e.g. next to the menu button). They are greyed out when there is nothing to undo/redo.

- Every state-mutating action (add, delete, move, rename, edit notes, toggle completion, clear) pushes a snapshot onto the undo stack.
- Undo restores the previous snapshot; Redo re-applies it.
- The undo stack is **not** persisted to localStorage — it resets on page load.

## Menu

A **single menu button** (e.g. hamburger icon, top-left or top-right corner) opens a modal or dropdown for:

### Import
- Accepts **Markdown** text input.
- Parses checkbox syntax into the task tree (see Markdown Format below).

### Export
- Outputs the current task tree as **Markdown** using the checkbox syntax.
- User can copy the output.

---

## Markdown Format

The app uses a subset of Markdown for import/export.

### Syntax Rules
- `- [ ] Task name` → unchecked (incomplete) task
- `- [x] Task name` → checked (complete) task
- **Indentation** (2 or 4 spaces per level) → nesting depth = parent/child relationship
- `- Note text` (a plain list item, **no checkbox**) → notes/details for the preceding task

### Example
```markdown
- [ ] Project Alpha
  - Some background context for this project
  - [x] Research phase
    - Notes from initial research
  - [ ] Design
    - [ ] Wireframes
    - [ ] Mockups
  - [ ] Development
```

### Import Rules
- The first non-indented checkbox item becomes the root (or a child of the implicit root if multiple exist).
- Plain list items (no checkbox) are treated as notes for the most recently seen task at that indent level.
- Nesting is determined by indentation depth.

### Export Rules
- Tree is serialized depth-first (top to bottom, left to right visually).
- Notes are output as plain list items immediately after their parent task, at the same indent level as children would be.

---

## Visual Design Notes

- **Compact layout**: node padding should be minimal; grid spacing should be tight.
- **No diagonal lines** anywhere.
- **Background grid** is decorative and static (does not move during pan/zoom).
- **One global menu button** — no other persistent UI chrome.
- **Details pane** is the only place task editing/actions occur.
- Color scheme should be clean and neutral — the structure of the tree is the focus.
- Nodes should feel like small chips or cards, not large boxes.

---

## Persistence

- The full task tree is serialized to **localStorage** as JSON on every state change.
- On page load, the tree is restored from localStorage automatically.
- If no localStorage data exists, start with a single empty root node.
- The undo/redo stack is not persisted — it resets on page load.

---

## Technical Constraints

- **Vanilla HTML + CSS + JS only** — no external libraries, no frameworks, no build step.
- Organized across **multiple files** for clarity and maintainability (e.g., `index.html`, `style.css`, `app.js`).
- Canvas rendering via **absolutely positioned DOM elements** (not `<canvas>`), so the tree is made of real HTML nodes connected by CSS-drawn lines (e.g. borders/pseudo-elements) or SVG overlay.
- All state lives in memory; import/export is the persistence mechanism.

---

## Edge Cases to Handle

- Deleting the root node: either prevent it, or reset to a single empty root.
- Moving the first sibling "up" or last sibling "down": buttons should be disabled or no-op.
- Importing malformed markdown: fail gracefully, import what is valid.
- Very deep or wide trees: canvas should handle arbitrary size via panning.
