export class View {
    constructor(state) {
        this.state = state;
        this.canvasContainer = document.getElementById('canvas-container');
        this.treeContainer = document.getElementById('tree-container');
        this.nodeLayer = document.getElementById('node-layer');
        this.connectorLayer = document.getElementById('connector-layer');
        this.detailsPane = document.getElementById('details-pane');
        this.parentSearch = document.getElementById('task-parent-search');
        this.parentOptions = document.getElementById('task-parent-options');

        this.camera = { x: 0, y: 0, zoom: 1 };
        this.drag = { isDragging: false, lastX: 0, lastY: 0, hasMoved: false };
        this.touch = { lastDistance: 0, lastX: 0, lastY: 0, isTouching: false, startTime: 0, hasMoved: false };
        this.selectedNodeId = null;
        this.isMenuOpen = false;

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
            // Removed: if (e.target.closest('.node')) return;

            if (e.button === 0 || e.button === 1) { // Left or Middle
                this.drag.isDragging = true;
                this.drag.lastX = e.clientX;
                this.drag.lastY = e.clientY;
                this.drag.hasMoved = false;
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
                if (e.target === this.canvasContainer || e.target === this.treeContainer || e.target === this.nodeLayer) {
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
            if (!this.touch.isTouching || this.isMenuOpen) return;
            
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
                if (e.target === this.canvasContainer || e.target === this.treeContainer || e.target === this.nodeLayer) {
                    this.deselect();
                }
            }
            this.touch.isTouching = false;
        });

        // Parent Combobox Events
        this.parentSearch.addEventListener('input', () => {
            this.updateParentOptions(this.parentSearch.value);
        });

        this.parentSearch.addEventListener('focus', () => {
            this.updateParentOptions(this.parentSearch.value);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.combobox-container')) {
                this.parentOptions.classList.add('hidden');
            }
        });
    }

    updateParentOptions(search = "") {
        if (!this.selectedNodeId) return;
        const allNodes = [];
        const traverse = (node) => {
            allNodes.push(node);
            node.children.forEach(traverse);
        };
        traverse(this.state.root);

        const nodeToMove = this.state.findNode(this.selectedNodeId);
        const currentParent = this.state.findParent(this.selectedNodeId);

        // Filter valid parents: not the node itself, not its descendants, and matches search
        const isDescendant = (parent, child) => {
            let curr = parent;
            while (curr) {
                if (curr.id === child.id) return true;
                curr = this.state.findParent(curr.id);
            }
            return false;
        };

        const options = allNodes.filter(n => {
            if (n.id === this.selectedNodeId) return false;
            if (isDescendant(n, nodeToMove)) return false;
            return !(search && !n.name.toLowerCase().includes(search.toLowerCase()));

        });

        this.parentOptions.innerHTML = '';
        options.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'combobox-item';
            if (currentParent && opt.id === currentParent.id) div.classList.add('selected');
            div.textContent = opt.name || "(Unnamed Task)";
            div.addEventListener('click', () => {
                this.state.moveNode(this.selectedNodeId, opt.id);
                this.parentSearch.value = opt.name;
                this.parentOptions.classList.add('hidden');
                this.render();
            });
            this.parentOptions.appendChild(div);
        });

        if (options.length > 0) {
            this.parentOptions.classList.remove('hidden');
        } else {
            this.parentOptions.classList.add('hidden');
        }
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
        
        const text = document.createElement('span');
        text.className = 'node-text';
        text.textContent = node.name || " ";
        div.appendChild(text);
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
            if (this.drag.hasMoved || this.touch.hasMoved) {
                this.drag.hasMoved = false;
                this.touch.hasMoved = false;
                return;
            }
            e.stopPropagation();
            this.selectNode(node.id);
        });

        // Touch handlers for Long Press Radial Menu
        let touchTimer = null;
        let menuActive = false;
        
        div.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            // Record starting position for move threshold
            const startTouch = e.touches[0];
            const startX = startTouch.clientX;
            const startY = startTouch.clientY;

            // Reset movement tracking for this specific touch session
            this.touch.hasMoved = false;

            touchTimer = setTimeout(() => {
                this.showRadialMenu(startX, startY, node);
                menuActive = true;
                touchTimer = null;
            }, 600);
        }, { passive: true });

        div.addEventListener('touchend', (e) => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
                // If it was a quick tap, select node
                if (!this.touch.hasMoved && !menuActive) {
                    e.stopPropagation();
                    this.selectNode(node.id);
                }
            } else if (menuActive) {
                e.preventDefault(); // Prevent ghost clicks when radial menu was active
            }
            menuActive = false;
        });

        div.addEventListener('touchmove', (e) => {
            if (touchTimer) {
                // Since this.touch.lastX is updated in canvasContainer,
                // we should actually compare against the start position we recorded if we want stability.
                // However, View.touch.hasMoved is set in canvasContainer if moved > 5px.
                if (this.touch.hasMoved) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            }
            if (menuActive) {
                // Dispatch event to radial menu to handle "hover" while dragging
                const touch = e.touches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                const radialItem = target ? target.closest('.radial-item') : null;
                
                document.querySelectorAll('.radial-item').forEach(el => el.classList.remove('active'));
                if (radialItem) {
                    radialItem.classList.add('active');
                }
            }
        });

        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
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
            
            const parent = this.state.findParent(id);
            if (parent) {
                this.parentSearch.value = parent.name || "(Unnamed Task)";
                this.parentSearch.disabled = false;
            } else {
                this.parentSearch.value = "Root";
                this.parentSearch.disabled = true;
            }
            this.parentOptions.classList.add('hidden');

            this.detailsPane.classList.remove('hidden');
            
            // Disable move buttons if at boundaries
            const btnUp = document.getElementById('btn-up');
            const btnDown = document.getElementById('btn-down');
            const btnAddSibling = document.getElementById('btn-add-sibling');

            if (parent) {
                const idx = parent.children.findIndex(c => c.id === id);
                btnUp.disabled = idx === 0;
                btnDown.disabled = idx === parent.children.length - 1;
                btnAddSibling.disabled = false;
            } else {
                btnUp.disabled = true;
                btnDown.disabled = true;
                btnAddSibling.disabled = true;
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
        this.isMenuOpen = true;
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
            
            // Store callback on element for easier access during touchend on parent
            btn._actionCallback = action.callback;

            menu.appendChild(btn);
        });

        document.body.appendChild(menu);

        const handleGlobalEnd = (e) => {
            let touch = e.changedTouches ? e.changedTouches[0] : e;
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const radialItem = target ? target.closest('.radial-item') : null;
            
            if (radialItem && radialItem._actionCallback) {
                radialItem._actionCallback();
            }
            
            menu.remove();
            this.isMenuOpen = false;
            window.removeEventListener('touchend', handleGlobalEnd);
            window.removeEventListener('mouseup', handleGlobalEnd);
        };

        // Delay attaching to avoid immediate trigger from the current touch
        setTimeout(() => {
            window.addEventListener('touchend', handleGlobalEnd);
            window.addEventListener('mouseup', handleGlobalEnd);
        }, 10);
    }
}
