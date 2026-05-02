export class View {
    constructor(state) {
        this.state = state;
        this.canvasContainer = document.getElementById('canvas-container');
        this.treeContainer = document.getElementById('tree-container');
        this.nodeLayer = document.getElementById('node-layer');
        this.connectorLayer = document.getElementById('connector-layer');
        this.detailsPane = document.getElementById('details-pane');

        this.camera = { x: 50, y: 50, zoom: 1 };
        this.drag = { isDragging: false, lastX: 0, lastY: 0 };
        this.selectedNodeId = null;

        this.nodeWidth = 150; // Approximate for layout
        this.nodeHeight = 35;
        this.hSpacing = 100;
        this.vSpacing = 20;

        this.initEvents();
    }

    initEvents() {
        // Panning
        this.canvasContainer.addEventListener('mousedown', (e) => {
            if (e.button === 0 || e.button === 1) { // Left or Middle
                if (e.target === this.canvasContainer || e.target === this.treeContainer) {
                    this.drag.isDragging = true;
                    this.drag.lastX = e.clientX;
                    this.drag.lastY = e.clientY;
                    this.deselect();
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.drag.isDragging) {
                const dx = e.clientX - this.drag.lastX;
                const dy = e.clientY - this.drag.lastY;
                this.camera.x += dx / this.camera.zoom;
                this.camera.y += dy / this.camera.zoom;
                this.drag.lastX = e.clientX;
                this.drag.lastY = e.clientY;
                this.applyTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            this.drag.isDragging = false;
        });

        // Zooming
        this.canvasContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.001;
            const factor = Math.exp(-e.deltaY * zoomSpeed);
            
            // Zoom centered on mouse
            const rect = this.canvasContainer.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left);
            const mouseY = (e.clientY - rect.top);

            const beforeX = (mouseX / this.camera.zoom) - this.camera.x;
            const beforeY = (mouseY / this.camera.zoom) - this.camera.y;

            this.camera.zoom = Math.min(Math.max(this.camera.zoom * factor, 0.1), 5);

            const afterX = (mouseX / this.camera.zoom) - this.camera.x;
            const afterY = (mouseY / this.camera.zoom) - this.camera.y;

            this.camera.x += (afterX - beforeX);
            this.camera.y += (afterY - beforeY);

            this.applyTransform();
        }, { passive: false });
    }

    applyTransform() {
        this.treeContainer.style.transform = `scale(${this.camera.zoom}) translate(${this.camera.x}px, ${this.camera.y}px)`;
    }

    render() {
        this.nodeLayer.innerHTML = '';
        this.connectorLayer.innerHTML = '';

        const layout = this.calculateLayout(this.state.root, 0, 0);
        this.renderNode(this.state.root, layout);
        this.applyTransform();
        this.updateUndoRedoButtons();
    }

    calculateLayout(node, x, y) {
        let totalHeight = 0;
        const childrenLayouts = [];

        if (node.children.length > 0) {
            let currentY = y;
            for (const child of node.children) {
                const childLayout = this.calculateLayout(child, x + this.nodeWidth + this.hSpacing, currentY);
                childrenLayouts.push(childLayout);
                currentY += childLayout.height + this.vSpacing;
                totalHeight += childLayout.height + this.vSpacing;
            }
            totalHeight -= this.vSpacing; // Remove last spacing
        } else {
            totalHeight = this.nodeHeight;
        }

        // Center parent relative to children
        const nodeY = node.children.length > 0 
            ? y + (totalHeight / 2) - (this.nodeHeight / 2)
            : y;

        return {
            id: node.id,
            x: x,
            y: nodeY,
            width: this.nodeWidth,
            height: this.nodeHeight,
            children: childrenLayouts,
            totalHeight: totalHeight
        };
    }

    renderNode(node, layout) {
        const div = document.createElement('div');
        div.className = 'node';
        if (node.id === this.selectedNodeId) div.classList.add('selected');
        if (node.complete) div.classList.add('complete');
        if (node.notes && node.notes.trim()) div.classList.add('has-notes');
        
        div.textContent = node.name || " ";
        div.style.left = `${layout.x}px`;
        div.style.top = `${layout.y}px`;
        div.style.minWidth = `${this.nodeWidth}px`;
        
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(node.id);
        });

        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.state.updateNode(node.id, { complete: !node.complete });
            this.render();
        });

        div.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle click split
                e.preventDefault();
                const newNode = node.clone();
                node.children.push(newNode);
                this.state.saveState();
                this.render();
            }
        });

        this.nodeLayer.appendChild(div);

        // Render connectors to children
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const childLayout = layout.children[i];
            this.renderConnector(layout, childLayout);
            this.renderNode(child, childLayout);
        }
    }

    renderConnector(parentLayout, childLayout) {
        const startX = parentLayout.x + parentLayout.width;
        const startY = parentLayout.y + (parentLayout.height / 2);
        const endX = childLayout.x;
        const endY = childLayout.y + (childLayout.height / 2);

        const midX = startX + (this.hSpacing / 2);

        // L/T shape: Horizontal to mid, Vertical to child Y, Horizontal to child
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'connector');
        this.connectorLayer.appendChild(path);
    }

    selectNode(id) {
        this.selectedNodeId = id;
        const node = this.state.findNode(id);
        if (node) {
            document.getElementById('task-name').value = node.name;
            document.getElementById('task-notes').value = node.notes;
            document.getElementById('task-complete').checked = node.complete;
            this.detailsPane.classList.remove('hidden');
            
            // Disable move buttons if at boundaries
            const parent = this.state.findParent(id);
            const btnUp = document.getElementById('btn-up');
            const btnDown = document.getElementById('btn-down');
            if (parent) {
                const idx = parent.children.findIndex(c => c.id === id);
                btnUp.disabled = idx === 0;
                btnDown.disabled = idx === parent.children.length - 1;
            } else {
                btnUp.disabled = true;
                btnDown.disabled = true;
            }
        }
        this.render();
    }

    deselect() {
        this.selectedNodeId = null;
        this.detailsPane.classList.add('hidden');
        this.render();
    }

    updateUndoRedoButtons() {
        document.getElementById('undo-btn').disabled = this.state.undoStack.length <= 1;
        document.getElementById('redo-btn').disabled = this.state.redoStack.length === 0;
    }
}
