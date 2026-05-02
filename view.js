export class View {
    constructor(state) {
        this.state = state;
        this.canvasContainer = document.getElementById('canvas-container');
        this.treeContainer = document.getElementById('tree-container');
        this.nodeLayer = document.getElementById('node-layer');
        this.connectorLayer = document.getElementById('connector-layer');
        this.detailsPane = document.getElementById('details-pane');

        this.camera = { x: 0, y: 0, zoom: 1 };
        this.drag = { isDragging: false, lastX: 0, lastY: 0, hasMoved: false };
        this.touch = { lastDistance: 0, lastX: 0, lastY: 0, isTouching: false, startTime: 0, hasMoved: false };
        this.selectedNodeId = null;

        this.nodeWidth = 180; // Increased from 160
        this.nodeHeight = 45; // Increased from 40
        this.hSpacing = 120; // Increased from 100
        this.vSpacing = 25; // Increased from 20

        this.initEvents();
    }

    initEvents() {
        // Swipe to dismiss details pane
        let swipeStartX = 0;
        this.detailsPane.addEventListener('touchstart', (e) => {
            swipeStartX = e.touches[0].clientX;
        }, { passive: true });

        this.detailsPane.addEventListener('touchend', (e) => {
            const swipeEndX = e.changedTouches[0].clientX;
            if (swipeEndX - swipeStartX > 50) { // Swipe right (lowered from 100)
                this.deselect();
            }
        }, { passive: true });

        // Auto-scroll to node when keyboard opens
        const inputs = this.detailsPane.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                if (this.selectedNodeId) {
                    setTimeout(() => {
                        this.scrollToNode(this.selectedNodeId);
                    }, 300); // Wait for keyboard to start appearing
                }
            });
        });

        // Panning
        window.addEventListener('mousedown', (e) => {
            if (this.detailsPane.contains(e.target)) return;
            if (e.target.closest('.ui-overlay')) return;
            if (e.target.closest('.modal')) return;
            if (e.target.closest('.node')) return;

            if (e.button === 0 || e.button === 1) { // Left or Middle
                if (e.target === this.canvasContainer || e.target === this.treeContainer) {
                    this.drag.isDragging = true;
                    this.drag.lastX = e.clientX;
                    this.drag.lastY = e.clientY;
                    this.drag.hasMoved = false;
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.drag.isDragging) {
                const dx = e.clientX - this.drag.lastX;
                const dy = e.clientY - this.drag.lastY;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.drag.hasMoved = true;
                this.camera.x += dx;
                this.camera.y += dy;
                this.drag.lastX = e.clientX;
                this.drag.lastY = e.clientY;
                this.applyTransform();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (this.drag.isDragging && !this.drag.hasMoved && e.button === 0) {
                // If it was a click without dragging on background, deselect
                if (e.target === this.canvasContainer || e.target === this.treeContainer) {
                    this.deselect();
                }
            }
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

            const beforeX = (mouseX - this.camera.x) / this.camera.zoom;
            const beforeY = (mouseY - this.camera.y) / this.camera.zoom;

            this.camera.zoom = Math.min(Math.max(this.camera.zoom * factor, 0.1), 5);

            const afterX = (mouseX - this.camera.x) / this.camera.zoom;
            const afterY = (mouseY - this.camera.y) / this.camera.zoom;

            this.camera.x += (afterX - beforeX) * this.camera.zoom;
            this.camera.y += (afterY - beforeY) * this.camera.zoom;

            this.applyTransform();
        }, { passive: false });

        // Touch Events
        this.canvasContainer.addEventListener('touchstart', (e) => {
            if (this.detailsPane.contains(e.target)) return;
            if (e.target.closest('.ui-overlay')) return;
            if (e.target.closest('.modal')) return;

            this.touch.isTouching = true;
            this.touch.startTime = Date.now();
            this.touch.hasMoved = false;

            if (e.touches.length === 1) {
                this.touch.lastX = e.touches[0].clientX;
                this.touch.lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                this.touch.lastDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this.touch.lastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                this.touch.lastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            }
        }, { passive: false });

        this.canvasContainer.addEventListener('touchmove', (e) => {
            if (!this.touch.isTouching) return;
            
            if (e.touches.length === 1) {
                const dx = e.touches[0].clientX - this.touch.lastX;
                const dy = e.touches[0].clientY - this.touch.lastY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.touch.hasMoved = true;
                
                // If touching a node and moved, it's a pan, so we don't preventDefault yet 
                // unless we want to block browser scroll
                e.preventDefault(); 

                this.camera.x += dx;
                this.camera.y += dy;
                this.touch.lastX = e.touches[0].clientX;
                this.touch.lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                e.preventDefault();
                this.touch.hasMoved = true;
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

                const factor = dist / this.touch.lastDistance;
                
                const beforeX = (midX - this.camera.x) / this.camera.zoom;
                const beforeY = (midY - this.camera.y) / this.camera.zoom;

                this.camera.zoom = Math.min(Math.max(this.camera.zoom * factor, 0.1), 5);

                const afterX = (midX - this.camera.x) / this.camera.zoom;
                const afterY = (midY - this.camera.y) / this.camera.zoom;

                this.camera.x += (afterX - beforeX) * this.camera.zoom;
                this.camera.y += (afterY - beforeY) * this.camera.zoom;

                // Also pan with the midpoint
                const dx = midX - this.touch.lastX;
                const dy = midY - this.touch.lastY;
                this.camera.x += dx;
                this.camera.y += dy;

                this.touch.lastDistance = dist;
                this.touch.lastX = midX;
                this.touch.lastY = midY;
            }
            this.applyTransform();
        }, { passive: false });

        this.canvasContainer.addEventListener('touchend', (e) => {
            if (this.touch.isTouching && !this.touch.hasMoved && e.touches.length === 0) {
                if (e.target === this.canvasContainer || e.target === this.treeContainer) {
                    this.deselect();
                }
            }
            this.touch.isTouching = false;
        });
    }

    applyTransform() {
        this.treeContainer.style.transform = `translate3d(${this.camera.x}px, ${this.camera.y}px, 0) scale(${this.camera.zoom})`;
    }

    render() {
        this.connectorLayer.setAttribute('width', '0');
        this.connectorLayer.setAttribute('height', '0');

        if (this.nodeLayer.innerHTML === '') {
            // First render: center the root
            const layout = this.calculateLayout(this.state.root, 0, 0);
            const rect = this.canvasContainer.getBoundingClientRect();
            
            // Adjust zoom for mobile if needed
            if (rect.width < 600) {
                this.camera.zoom = 0.8;
            } else {
                this.camera.zoom = 1.0;
            }

            this.camera.x = 40; // Margin from left
            this.camera.y = (rect.height / 2) - ((layout.totalHeight * this.camera.zoom) / 2);
            
            // If height calculation was based on 0 (init not yet finished), fallback to a reasonable middle
            if (this.camera.y < 0 || isNaN(this.camera.y)) {
                this.camera.y = 100;
            }
        }

        this.nodeLayer.innerHTML = '';
        this.connectorLayer.innerHTML = '';

        const layout = this.calculateLayout(this.state.root, 0, 0);
        this.renderNode(this.state.root, layout);
        this.applyTransform();
        this.updateUndoRedoButtons();
    }

    calculateLayout(node, x, y) {
        let subtreeHeight = 0;
        const childrenLayouts = [];

        if (node.children.length > 0) {
            let currentY = y;
            for (const child of node.children) {
                const childLayout = this.calculateLayout(child, x + this.nodeWidth + this.hSpacing, currentY);
                childrenLayouts.push(childLayout);
                currentY += childLayout.totalHeight + this.vSpacing;
                subtreeHeight += childLayout.totalHeight + this.vSpacing;
            }
            subtreeHeight -= this.vSpacing; // Remove last spacing
        }

        const totalHeight = Math.max(subtreeHeight, this.nodeHeight);
        
        // Center parent relative to its subtree
        const nodeY = y + (totalHeight / 2) - (this.nodeHeight / 2);

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
        div.style.width = `${this.nodeWidth}px`;
        div.style.boxSizing = 'border-box';
        
        div.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle click split
                e.preventDefault();
                const newNode = node.clone();
                node.children.push(newNode);
                this.state.saveState();
                this.render();
            }
        });

        // Click handler with movement check
        div.addEventListener('click', (e) => {
            if (this.drag.hasMoved) return;
            e.stopPropagation();
            this.selectNode(node.id);
        });

        // Touch handlers for Long Press Radial Menu
        let touchTimer = null;
        div.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            touchTimer = setTimeout(() => {
                this.showRadialMenu(e.touches[0].clientX, e.touches[0].clientY, node);
                touchTimer = null;
            }, 600);
        }, { passive: true });

        div.addEventListener('touchend', (e) => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
                // If it was a quick tap, select node
                if (!this.touch.hasMoved) {
                    e.stopPropagation();
                    this.selectNode(node.id);
                }
            }
        });

        div.addEventListener('touchmove', () => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });

        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.state.updateNode(node.id, { complete: !node.complete });
            this.render();
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
        
        // Ensure SVG is large enough to show this path
        const maxX = Math.max(startX, endX, midX);
        const maxY = Math.max(startY, endY);
        const currentWidth = parseInt(this.connectorLayer.getAttribute('width') || '0');
        const currentHeight = parseInt(this.connectorLayer.getAttribute('height') || '0');
        if (maxX + 200 > currentWidth) this.connectorLayer.setAttribute('width', (maxX + 200).toString());
        if (maxY + 200 > currentHeight) this.connectorLayer.setAttribute('height', (maxY + 200).toString());

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

    scrollToNode(id) {
        const node = this.state.findNode(id);
        if (!node) return;

        // Find current layout position
        const layout = this.calculateLayout(this.state.root, 0, 0);
        const findInLayout = (l) => {
            if (l.id === id) return l;
            for (const child of l.children) {
                const found = findInLayout(child);
                if (found) return found;
            }
            return null;
        };
        const nodeLayout = findInLayout(layout);
        if (!nodeLayout) return;

        const rect = this.canvasContainer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 3; // Position it in the upper third to leave room for keyboard

        this.camera.x = centerX - (nodeLayout.x + nodeLayout.width / 2) * this.camera.zoom;
        this.camera.y = centerY - (nodeLayout.y + nodeLayout.height / 2) * this.camera.zoom;
        
        this.applyTransform();
    }

    updateUndoRedoButtons() {
        document.getElementById('undo-btn').disabled = this.state.undoStack.length <= 1;
        document.getElementById('redo-btn').disabled = this.state.redoStack.length === 0;
    }

    showRadialMenu(x, y, node) {
        const menu = document.createElement('div');
        menu.className = 'radial-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const actions = [
            { icon: '✓', label: 'Toggle', callback: () => {
                this.state.updateNode(node.id, { complete: !node.complete });
                this.render();
            }},
            { icon: '⑂', label: 'Split', callback: () => {
                const newNode = node.clone();
                node.children.push(newNode);
                this.state.saveState();
                this.render();
            }}
        ];

        actions.forEach((action, i) => {
            const angle = (i / actions.length) * Math.PI * 2;
            const dist = 60;
            const ax = Math.cos(angle) * dist;
            const ay = Math.sin(angle) * dist;

            const btn = document.createElement('div');
            btn.className = 'radial-item';
            btn.innerHTML = `<span>${action.icon}</span>`;
            btn.style.transform = `translate(${ax}px, ${ay}px)`;
            
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                action.callback();
                menu.remove();
            });
            // Also mouse for testing
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                action.callback();
                menu.remove();
            });

            menu.appendChild(btn);
        });

        document.body.appendChild(menu);

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                window.removeEventListener('touchstart', closeMenu);
                window.removeEventListener('mousedown', closeMenu);
            }
        };
        setTimeout(() => {
            window.addEventListener('touchstart', closeMenu);
            window.addEventListener('mousedown', closeMenu);
        }, 10);
    }
}
