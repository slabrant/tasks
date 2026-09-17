export class TaskNode {
    constructor(name = "", notes = "", complete = false, isPrivate = false) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.name = name;
        this.notes = notes;
        this.complete = complete;
        // Set only on the root of a private subtree; descendants inherit.
        this.private = isPrivate;
        this.children = [];
    }

    static fromJSON(data) {
        const node = new TaskNode(data.name, data.notes, data.complete, Boolean(data.private));
        node.id = data.id || node.id;
        if (data.children) {
            node.children = data.children.map(childData => TaskNode.fromJSON(childData));
        }
        return node;
    }
}

export class TaskTree {
    constructor() {
        this.root = new TaskNode("Root Task");
        this.undoStack = [];
        this.redoStack = [];
        this.hideCompleted = false;
        this.showPrivate = false;
        this.onChange = null;
    }

    // A node is private if it is flagged or sits under something that is.
    isPrivate(nodeId) {
        let node = this.findNode(nodeId);
        while (node) {
            if (node.private) return true;
            node = this.findParent(node.id);
        }
        return false;
    }

    // Not persisted: revealing private tasks lasts for the session only.
    toggleShowPrivate() {
        this.showPrivate = !this.showPrivate;
        return this.showPrivate;
    }

    saveState() {
        const snapshot = JSON.stringify(this.root);
        if (this.undoStack.length === 0 || this.undoStack[this.undoStack.length - 1] !== snapshot) {
            this.undoStack.push(snapshot);
            this.redoStack = [];
            if (this.undoStack.length > 50) this.undoStack.shift();
        }
        localStorage.setItem('taskTree', snapshot);
        localStorage.setItem('hideCompleted', JSON.stringify(this.hideCompleted));
        if (this.onChange) this.onChange();
    }

    undo() {
        if (this.undoStack.length > 1) {
            this.redoStack.push(this.undoStack.pop());
            const snapshot = this.undoStack[this.undoStack.length - 1];
            this.root = TaskNode.fromJSON(JSON.parse(snapshot));
            localStorage.setItem('taskTree', snapshot);
            if (this.onChange) this.onChange();
            return true;
        }
        return false;
    }

    redo() {
        if (this.redoStack.length > 0) {
            const snapshot = this.redoStack.pop();
            this.undoStack.push(snapshot);
            this.root = TaskNode.fromJSON(JSON.parse(snapshot));
            localStorage.setItem('taskTree', snapshot);
            if (this.onChange) this.onChange();
            return true;
        }
        return false;
    }

    load() {
        const saved = localStorage.getItem('taskTree');
        const savedHide = localStorage.getItem('hideCompleted');
        if (savedHide !== null) {
            this.hideCompleted = JSON.parse(savedHide);
        }
        // Deliberately not persisted as "on": every reload starts hidden.
        this.showPrivate = false;
        if (saved) {
            try {
                this.root = TaskNode.fromJSON(JSON.parse(saved));
                this.undoStack = [saved];
            } catch (e) {
                console.error("Failed to load state", e);
            }
        } else {
            this.saveState();
        }
    }

    toggleHideCompleted() {
        this.hideCompleted = !this.hideCompleted;
        localStorage.setItem('hideCompleted', JSON.stringify(this.hideCompleted));
        return this.hideCompleted;
    }

    findNode(id, current = this.root) {
        if (current.id === id) return current;
        for (const child of current.children) {
            const found = this.findNode(id, child);
            if (found) return found;
        }
        return null;
    }

    findParent(id, current = this.root) {
        for (const child of current.children) {
            if (child.id === id) return current;
            const found = this.findParent(id, child);
            if (found) return found;
        }
        return null;
    }

    addChild(parentId) {
        const parent = this.findNode(parentId);
        if (parent) {
            const newNode = new TaskNode();
            parent.children.push(newNode);
            
            // Adding a child to a completed parent should uncomplete the parent
            if (parent.complete) {
                parent.complete = false;
                this.updateParentCompletion(parent.id);
            }

            this.saveState();
            return newNode;
        }
        return null;
    }

    addSibling(nodeId) {
        if (nodeId === this.root.id) return null;
        const parent = this.findParent(nodeId);
        if (parent) {
            const index = parent.children.findIndex(c => c.id === nodeId);
            const newNode = new TaskNode();
            parent.children.splice(index + 1, 0, newNode);
            this.saveState();
            return newNode;
        }
        return null;
    }

    deleteNode(nodeId) {
        if (nodeId === this.root.id) {
            this.root = new TaskNode("Root Task");
            this.saveState();
            return true;
        }
        const parent = this.findParent(nodeId);
        if (parent) {
            parent.children = parent.children.filter(c => c.id !== nodeId);
            this.saveState();
            return true;
        }
        return false;
    }

    // With completed tasks hidden, the sibling next to a task in the array may
    // not be on screen, and swapping with it looks like nothing happened. Moves
    // step past the next *visible* sibling instead, carrying any hidden ones
    // along.
    visibleSibling(parent, index, step) {
        for (let i = index + step; i >= 0 && i < parent.children.length; i += step) {
            if (!this.hideCompleted || !parent.children[i].complete) return i;
        }
        return -1;
    }

    moveBy(nodeId, step) {
        const parent = this.findParent(nodeId);
        if (!parent) return false;
        const index = parent.children.findIndex(c => c.id === nodeId);
        if (index < 0) return false;
        const target = this.visibleSibling(parent, index, step);
        if (target < 0) return false;
        const [node] = parent.children.splice(index, 1);
        parent.children.splice(target, 0, node);
        this.saveState();
        return true;
    }

    moveUp(nodeId) {
        return this.moveBy(nodeId, -1);
    }

    moveDown(nodeId) {
        return this.moveBy(nodeId, 1);
    }

    canMove(nodeId, step) {
        const parent = this.findParent(nodeId);
        if (!parent) return false;
        const index = parent.children.findIndex(c => c.id === nodeId);
        if (index < 0) return false;
        return this.visibleSibling(parent, index, step) >= 0;
    }

    updateNode(id, data) {
        const node = this.findNode(id);
        if (node) {
            const oldComplete = node.complete;
            Object.assign(node, data);
            
            if (data.hasOwnProperty('complete') && data.complete !== oldComplete) {
                // Checking a task still marks its whole branch done. Unchecking it must not,
                // because which children were genuinely finished can't be recovered afterwards.
                if (node.complete) this.propagateCompletion(node);
                this.updateParentCompletion(id);
            }

            this.saveState();
            return true;
        }
        return false;
    }

    propagateCompletion(node) {
        for (const child of node.children) {
            child.complete = node.complete;
            this.propagateCompletion(child);
        }
    }

    updateParentCompletion(nodeId) {
        const parent = this.findParent(nodeId);
        if (parent) {
            const allComplete = parent.children.length > 0 && parent.children.every(c => c.complete);
            if (parent.complete !== allComplete) {
                parent.complete = allComplete;
                this.updateParentCompletion(parent.id);
            }
        }
    }

    moveNode(nodeId, newParentId) {
        if (nodeId === this.root.id) return false;
        if (nodeId === newParentId) return false;

        const node = this.findNode(nodeId);
        const newParent = this.findNode(newParentId);
        if (!node || !newParent) return false;

        // Check if newParent is a descendant of node to avoid cycles
        let curr = newParent;
        while (curr) {
            if (curr.id === nodeId) return false;
            curr = this.findParent(curr.id);
        }

        const oldParent = this.findParent(nodeId);
        if (oldParent) {
            oldParent.children = oldParent.children.filter(c => c.id !== nodeId);
            this.updateParentCompletion(oldParent.id);
        }

        newParent.children.push(node);
        if (newParent.complete) {
            newParent.complete = false;
            this.updateParentCompletion(newParent.id);
        } else {
            this.updateParentCompletion(nodeId); // Trigger check up from node's new position if needed
        }

        this.saveState();
        return true;
    }
}
