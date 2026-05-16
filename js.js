// --- 工具函数：防抖 ---
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// --- 持久化存储管理模块 ---
class StorageManager {
    constructor() {
        this.dbName = 'HeatmapDB';
        this.storeName = 'appStore';
        this.version = 1;
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('IndexedDB 初始化成功');
                resolve();
            };
            request.onerror = (event) => {
                console.error('IndexedDB 初始化失败', event);
                reject(event);
            };
        });
    }

    save(key, data) {
        if (!this.db) return;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.put(data, key);
    }

    load(key) {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve(null);
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            request.onsuccess = () => { resolve(request.result); };
            request.onerror = () => { resolve(null); };
        });
    }
}

// --- 地图管理模块 (天地图版 - 修复域名与交互体验) ---
class MapManager {
    constructor() {
        this.map = null;
        this.currentStyleIndex = 0;
        this.layers = {}; // 存储所有图层引用
        // 天地图风格定义：base=底图, anno=注记
        this.mapStyles = [
            { name: '地图(含路网)', type: 'vector', color: '#e8e6e3', layers: ['vec_w', 'cva_w'] },
            { name: '地图(无路网)', type: 'vector', color: '#e8e6e3', layers: ['vec_w'] },
            { name: '卫星(含路网)', type: 'satellite', color: '#33472D', layers: ['img_w', 'cia_w'] },
            { name: '卫星(无路网)', type: 'satellite', color: '#33472D', layers: ['img_w'] },
            { name: '地形(含路网)', type: 'terrain', color: '#d8cba0', layers: ['ter_w', 'cta_w'] },
            { name: '地形(无路网)', type: 'terrain', color: '#d8cba0', layers: ['ter_w'] },
        ];
    }

    init() {
        // 天地图初始化
        this.map = new T.Map('map', {
            projection: 'EPSG:900913'
        });

        // 默认中心点 (上海) 和缩放级别
        this.map.centerAndZoom(new T.LngLat(121.505366, 31.23351), 12);

        // 初始化图层对象 (使用 https 和 t0 节点)
        const tk = '2b2b46e9aa3d87c1d35d6f4de58a0cbf';
        const urlFunc = (layer) => `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`;

        this.layers['vec_w'] = new T.TileLayer(urlFunc('vec'), { zIndex: 1 });
        this.layers['cva_w'] = new T.TileLayer(urlFunc('cva'), { zIndex: 2, opacity: 1 });
        this.layers['img_w'] = new T.TileLayer(urlFunc('img'), { zIndex: 1 });
        this.layers['cia_w'] = new T.TileLayer(urlFunc('cia'), { zIndex: 2, opacity: 1 });
        this.layers['ter_w'] = new T.TileLayer(urlFunc('ter'), { zIndex: 1 });
        this.layers['cta_w'] = new T.TileLayer(urlFunc('cta'), { zIndex: 2, opacity: 1 });

        // 应用默认风格
        this.applyStyle(this.mapStyles[0]);

        // 事件监听适配
        this.map.addEventListener('zoomend', () => {
            if (window.brushManager && window.brushManager.drawMode) window.brushManager.updateBrushCircleSize();
            this.saveState();
        });
        this.map.addEventListener('moveend', () => { this.saveState(); });

        this.saveStateDebounced = debounce(() => {
            if (window.storageManager) {
                const center = this.map.getCenter();
                window.storageManager.save('mapState', { center: [center.lng, center.lat], zoom: this.map.getZoom(), styleIndex: this.currentStyleIndex });
            }
        }, 1000);

        return this.map;
    }

    saveState() { this.saveStateDebounced(); }
    getStyles() { return this.mapStyles; }
    getCurrentStyleIndex() { return this.currentStyleIndex; }

    setStyleByIndex(index) {
        if (index < 0 || index >= this.mapStyles.length) return;
        this.currentStyleIndex = index;
        const style = this.mapStyles[this.currentStyleIndex];
        this.applyStyle(style);
        if (window.storageManager) {
            const center = this.map.getCenter();
            window.storageManager.save('mapState', { center: [center.lng, center.lat], zoom: this.map.getZoom(), styleIndex: this.currentStyleIndex });
        }
        this.showStyleNotification(style.name);
    }

    applyStyle(style) {
        Object.values(this.layers).forEach(layer => { try { this.map.removeLayer(layer); } catch (e) { } });
        style.layers.forEach(layerKey => {
            if (this.layers[layerKey]) { this.map.addLayer(this.layers[layerKey]); }
        });
    }

    toggleStyle() { const nextIndex = (this.currentStyleIndex + 1) % this.mapStyles.length; this.setStyleByIndex(nextIndex); }
    showStyleNotification(styleName) {
        const existing = document.querySelector('.top-center-notification'); if (existing) existing.remove();
        const notification = document.createElement('div'); notification.className = 'top-center-notification'; notification.textContent = `地图风格: ${styleName}`;
        document.body.appendChild(notification); requestAnimationFrame(() => notification.classList.add('show'));
        setTimeout(() => { notification.classList.remove('show'); setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300); }, 2000);
    }

    zoomIn() { this.map.zoomIn(); }
    zoomOut() { this.map.zoomOut(); }
    getContainer() { return this.map.getContainer(); }

    lngLatToContainer(lnglat) {
        let lng, lat;
        if (Array.isArray(lnglat)) { lng = lnglat[0]; lat = lnglat[1]; } else { lng = lnglat.lng; lat = lnglat.lat; }
        return this.map.lngLatToContainerPoint(new T.LngLat(lng, lat));
    }

    containerToLngLat(pixel) {
        const ll = this.map.containerPointToLngLat(new T.Point(pixel.x, pixel.y));
        return { lng: ll.getLng(), lat: ll.getLat() };
    }

    getZoom() { return this.map.getZoom(); }

    setStatus(status) {
        if (status.dragEnable === false) this.map.disableDrag();
        else if (status.dragEnable === true) this.map.enableDrag();
        if (status.doubleClickZoom === false) this.map.disableDoubleClickZoom();
        else if (status.doubleClickZoom === true) this.map.enableDoubleClickZoom();
        if (status.scrollWheel === false) this.map.disableScrollWheelZoom();
        else if (status.scrollWheel === true) this.map.enableScrollWheelZoom();
    }

    on(event, callback) {
        let tEvent = event;
        if (event === 'mapmove') tEvent = 'move';
        this.map.addEventListener(tEvent, callback);
    }

    restoreState(state) {
        if (!state) return;
        if (state.center && state.zoom) { this.map.centerAndZoom(new T.LngLat(state.center[0], state.center[1]), state.zoom); }
        if (state.styleIndex !== undefined) this.setStyleByIndex(state.styleIndex);
    }
}

window.mapManager = new MapManager();

// --- 画板管理模块 ---
class BoardManager {
    constructor() {
        this.container = document.getElementById('boardContainer');
        this.content = document.getElementById('boardContent');
        this.image = document.getElementById('boardImage');
        this.placeholder = document.querySelector('.board-placeholder');
        this.transform = { x: 0, y: 0, scale: 1 };
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.hasImage = false;
        this.saveStateDebounced = debounce(() => this.saveState(), 1000);
        this.initEvents();
    }

    initEvents() {
        const fileInput = document.getElementById('boardImgInput');
        fileInput.addEventListener('change', (e) => this.handleImageUpload(e));
        document.getElementById('uploadImgBtn').addEventListener('click', () => fileInput.click());

        this.container.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault(); this.handleZoom(e);
        }, { passive: false });

        this.container.addEventListener('pointerdown', (e) => {
            if (window.brushManager && window.brushManager.drawMode) return;
            if (e.button !== 0) return;
            this.isDragging = true; this.lastMouse = { x: e.clientX, y: e.clientY };
            this.container.style.cursor = 'grabbing';
        });

        window.addEventListener('pointermove', (e) => {
            if (!this.isDragging) return;
            e.preventDefault();
            const dx = e.clientX - this.lastMouse.x; const dy = e.clientY - this.lastMouse.y;
            this.transform.x += dx; this.transform.y += dy;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.updateTransform();
            if (window.brushManager) window.brushManager._onMapMove();
            this.saveStateDebounced();
        });

        window.addEventListener('pointerup', () => { this.isDragging = false; this.container.style.cursor = ''; });
    }

    handleImageUpload(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => { this.setImage(event.target.result, true); };
        reader.readAsDataURL(file);
    }

    setImage(src, resetTransform = true) {
        this.image.src = src;
        this.image.onload = () => {
            this.hasImage = true; this.placeholder.style.display = 'none';
            if (resetTransform) {
                this.resetView();
                if (window.layerManager && window.layerManager.getLayersByMode('board').length === 0) window.layerManager.addLayer();
                if (window.uiManager) window.uiManager.showNotification('图片已加载', 'success');
            } else { this.updateTransform(); }
            this.saveState();
        };
    }

    saveState() { if (!window.storageManager) return; window.storageManager.save('boardState', { hasImage: this.hasImage, imageSrc: this.hasImage ? this.image.src : null, transform: this.transform }); }
    restoreState(state) { if (!state) return; if (state.hasImage && state.imageSrc) { this.transform = state.transform || { x: 0, y: 0, scale: 1 }; this.setImage(state.imageSrc, false); } }

    handleZoom(e) {
        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.transform.x) / this.transform.scale;
        const worldY = (mouseY - this.transform.y) / this.transform.scale;
        const delta = -Math.sign(e.deltaY); const zoomFactor = 1.1;
        let newScale = this.transform.scale * (delta > 0 ? zoomFactor : 1 / zoomFactor);
        newScale = Math.max(0.1, Math.min(20, newScale));
        this.transform.x = mouseX - worldX * newScale; this.transform.y = mouseY - worldY * newScale;
        this.transform.scale = newScale;
        this.updateTransform();
        if (window.brushManager) { window.brushManager.updateBrushCircleSize(); window.brushManager.render(); }
        this.saveStateDebounced();
    }

    resetView() {
        if (!this.hasImage) return;
        const containerRect = this.container.getBoundingClientRect();
        const imgWidth = this.image.naturalWidth; const imgHeight = this.image.naturalHeight;
        const scale = Math.min(containerRect.width / imgWidth, containerRect.height / imgHeight) * 0.9;
        this.transform.scale = scale;
        this.transform.x = (containerRect.width - imgWidth * scale) / 2;
        this.transform.y = (containerRect.height - imgHeight * scale) / 2;
        this.updateTransform();
        if (window.brushManager) window.brushManager.render();
    }

    updateTransform() { this.content.style.transform = `translate3d(${this.transform.x}px, ${this.transform.y}px, 0) scale(${this.transform.scale})`; }
    getContainer() { return this.container; }
    getZoom() { return Math.log2(this.transform.scale); }
    containerToLngLat(pixel) { if (!this.hasImage) return null; return { lng: (pixel.x - this.transform.x) / this.transform.scale, lat: (pixel.y - this.transform.y) / this.transform.scale, type: 'board' }; }
    lngLatToContainer(point) { return { x: point.lng * this.transform.scale + this.transform.x, y: point.lat * this.transform.scale + this.transform.y }; }
    zoomIn() { const rect = this.container.getBoundingClientRect(); this.handleZoom({ clientX: rect.width / 2 + rect.left, clientY: rect.height / 2 + rect.top, deltaY: -100, preventDefault: () => { } }); }
    zoomOut() { const rect = this.container.getBoundingClientRect(); this.handleZoom({ clientX: rect.width / 2 + rect.left, clientY: rect.height / 2 + rect.top, deltaY: 100, preventDefault: () => { } }); }
}

// --- 画笔和热力图绘制模块 (交互优化版) ---
class BrushManager {
    constructor(mapManager, boardManager) {
        this.mapManager = mapManager; 
        this.boardManager = boardManager; 
        this.currentMode = 'map'; 
        this.canvas = document.getElementById('heatmapCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.offscreen = document.createElement('canvas');
        this.offctx = this.offscreen.getContext('2d', { willReadFrequently: true });
        this.drawing = false; 
        this.drawMode = false;
        this.brushRadius = 50; 
        this.brushAlpha = 0.5; 
        this.brushBlur = 1.0;
        this.heatmapVisible = true; 
        this.isErasing = false;
        this.points = []; 
        this.currentSessionPoints = []; 
        this.lastDrawPos = null;

        // --- 【新增】配色方案定义 (务必确保这段代码存在) ---
        this.gradients = {
            'classic': {
                name: '经典彩虹 (默认)',
                stops: { 0.0: 'rgba(0,0,255,0)', 0.2: '#0000ff', 0.4: '#00ffff', 0.6: '#00ff00', 0.8: '#ffff00', 1.0: '#ff0000' }
            },
            'magma': {
                name: '岩浆 (Magma)',
                stops: { 0.0: 'rgba(0,0,4,0)', 0.1: '#000004', 0.25: '#3b0f70', 0.5: '#8c2981', 0.75: '#de4968', 1.0: '#fcfdbf' }
            },
            'plasma': {
                name: '等离子 (Plasma)',
                stops: { 0.0: 'rgba(13,8,135,0)', 0.1: '#0d0887', 0.3: '#6a00a8', 0.5: '#b12a90', 0.7: '#e16462', 0.9: '#fca636', 1.0: '#f0f921' }
            },
            'warm': {
                name: '暖色调',
                stops: { 0.0: 'rgba(255,255,255,0)', 0.2: '#ffe5e5', 0.4: '#ffb3b3', 0.6: '#ff8080', 0.8: '#ff4d4d', 1.0: '#ff0000' }
            },
            'cool': {
                name: '冷色调',
                stops: { 0.0: 'rgba(255,255,255,0)', 0.2: '#e5f5ff', 0.4: '#b3e0ff', 0.6: '#80ccff', 0.8: '#4da6ff', 1.0: '#0080ff' }
            },
            'deep-sea': {
                name: '深海',
                stops: { 0.0: 'rgba(0,0,0,0)', 0.2: '#023e8a', 0.4: '#0077b6', 0.6: '#0096c7', 0.8: '#48cae4', 1.0: '#ade8f4' }
            },
            'traffic': {
                name: '红绿灯 (拥堵)',
                stops: { 0.0: 'rgba(0,255,0,0)', 0.2: '#00ff00', 0.5: '#ffff00', 0.8: '#ff0000', 1.0: '#8b0000' }
            }
        };

        // --- 【新增】自定义配色存储 ---
        this.customGradients = {}; 
        this.loadCustomGradients(); // 加载保存的配置

        this.currentGradientName = 'classic';
        // --- 【新增结束】 ---

        this.brushTexture = document.createElement('canvas');
        this.brushTexture.width = 128; 
        this.brushTexture.height = 128;
        this.updateBrushTexture();
        this.renderPending = false;
        this.brushCircle = document.createElement('div'); 
        document.body.appendChild(this.brushCircle); 
        this.setupBrushCircle();
        
        // --- 【新增】初始化UI ---
        this.initGradientUI();
        this.initGradientEditorEvents(); // 【新增】初始化编辑器事件
        this.initCommonEvents(); 
        this.initEventListeners();
    }

    initGradientUI() {
        const bar = document.getElementById('gradientBar');
        const dropdown = document.getElementById('gradientDropdown');
        
        // 1. 确保下拉菜单挂载到 body (避免被工具栏截断)
        if (dropdown.parentElement !== document.body) {
            document.body.appendChild(dropdown);
        }

        // --- 事件监听部分 (之前可能丢失的部分) ---

        // 2. 清除旧的事件监听器 (防止重复绑定)
        // 注意：匿名函数无法通过 removeEventListener 清除，但这里我们通过重置元素来简单处理
        // 或者依靠由类实例管理的单一调用。如果多次调用此方法，请小心。
        // 为了安全起见，这里我们假设 initGradientUI 可能被多次调用（例如保存方案后刷新列表）
        // 我们只在第一次初始化时绑定事件，或者使用一个标志位。
        
        if (!this._gradientEventsBound) {
            // 点击色带显示/隐藏
            bar.addEventListener('click', (e) => {
                e.stopPropagation();
                
                if (dropdown.classList.contains('show')) {
                    dropdown.classList.remove('show');
                    return;
                }

                // 动态定位
                const rect = bar.getBoundingClientRect();
                dropdown.style.width = rect.width + 'px';
                dropdown.style.left = rect.left + 'px';
                
                const dropdownHeight = Math.min(300, dropdown.scrollHeight); // 估算高度
                if (rect.bottom + dropdownHeight > window.innerHeight) {
                    dropdown.style.top = 'auto';
                    dropdown.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
                    dropdown.style.transformOrigin = 'bottom center';
                } else {
                    dropdown.style.bottom = 'auto';
                    dropdown.style.top = (rect.bottom + 5) + 'px';
                    dropdown.style.transformOrigin = 'top center';
                }

                dropdown.classList.add('show');
            });

            // 滚轮切换配色
            bar.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // 合并内置和自定义的所有 key
                const builtInKeys = Object.keys(this.gradients);
                const customKeys = Object.keys(this.customGradients).map(k => `custom_${k}`);
                const allKeys = [...builtInKeys, ...customKeys];
                
                const currentIndex = allKeys.indexOf(this.currentGradientName);
                if (currentIndex === -1) return; // 容错

                const delta = Math.sign(e.deltaY);
                if (delta === 0) return;

                let nextIndex;
                if (delta > 0) {
                    nextIndex = (currentIndex + 1) % allKeys.length;
                } else {
                    nextIndex = (currentIndex - 1 + allKeys.length) % allKeys.length;
                }

                this.setGradient(allKeys[nextIndex]);
            }, { passive: false });

            // 点击外部关闭
            window.addEventListener('click', () => {
                dropdown.classList.remove('show');
            });
            
            // 滚动关闭 (防止错位)
            window.addEventListener('scroll', (e) => {
                if (dropdown.contains(e.target)) return;
                dropdown.classList.remove('show');
            }, true);

            // 窗口调整关闭
            window.addEventListener('resize', () => dropdown.classList.remove('show'));

            this._gradientEventsBound = true; // 标记事件已绑定
        }

        // --- 渲染部分 (列表生成) ---
        
        dropdown.innerHTML = '';

        // 3. 渲染内置配色
        const presetHeader = document.createElement('div');
        presetHeader.style.cssText = 'font-size:11px; color:#999; margin:4px 8px;';
        presetHeader.textContent = '内置方案';
        dropdown.appendChild(presetHeader);

        Object.keys(this.gradients).forEach(key => {
            this.createGradientOption(dropdown, key, this.gradients[key], false);
        });

        // 4. 渲染自定义配色
        if (Object.keys(this.customGradients).length > 0) {
            const customHeader = document.createElement('div');
            customHeader.style.cssText = 'font-size:11px; color:#999; margin:8px 8px 4px 8px; border-top:1px dashed #eee; padding-top:4px;';
            customHeader.textContent = '我的配色';
            dropdown.appendChild(customHeader);

            Object.keys(this.customGradients).forEach(id => {
                this.createGradientOption(dropdown, id, this.customGradients[id], true);
            });
        }
        
        // 6. 更新主色带显示
        this.updateGradientBarUI();
    }

    // 【新增】辅助方法：创建下拉选项
    createGradientOption(container, id, data, isCustom) {
        const option = document.createElement('div');
        const isActive = (isCustom && this.currentGradientName === `custom_${id}`) || (!isCustom && this.currentGradientName === id);
        
        option.className = `gradient-option ${isActive ? 'active' : ''}`;
        option.dataset.value = isCustom ? `custom_${id}` : id;

        const stopsArr = Object.entries(data.stops).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
        const cssGradient = `linear-gradient(to right, ${stopsArr.map(s => `${s[1]} ${parseFloat(s[0]) * 100}%`).join(', ')})`;

        // --- 确认 HTML 结构如下 ---
        let html = `
            <div class="gradient-top-row">
                <span class="gradient-option-name">${data.name}</span>
                ${isCustom ? `
                <div class="gradient-item-actions">
                    <button class="mini-btn primary edit-grad-btn" title="编辑"><i class="fas fa-pen"></i></button>
                    <button class="mini-btn danger del-grad-btn" title="删除"><i class="fas fa-trash"></i></button>
                </div>` : ''}
            </div>
            <div class="gradient-option-preview" style="background: ${cssGradient}"></div>
        `;

        option.innerHTML = html;
        
        // ... (事件绑定代码保持不变) ...
        option.addEventListener('click', (e) => {
            this.setGradient(isCustom ? `custom_${id}` : id);
            document.getElementById('gradientDropdown').classList.remove('show');
        });

        if (isCustom) {
            const editBtn = option.querySelector('.edit-grad-btn');
            const delBtn = option.querySelector('.del-grad-btn');
            editBtn.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('gradientDropdown').classList.remove('show'); this.openGradientEditor(id); });
            delBtn.addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`确定要删除配色 "${data.name}" 吗？`)) { this.deleteCustomGradient(id); } });
        }
        
        container.appendChild(option);
    }

    setGradient(name) {
        // 1. 尝试从内置列表中查找
        if (this.gradients[name]) {
            this.currentGradientName = name;
        } 
        // 2. 尝试从自定义列表中查找 (前缀匹配)
        else if (name.startsWith('custom_')) {
            const id = name.replace('custom_', '');
            if (this.customGradients[id]) {
                this.currentGradientName = name;
            } else {
                console.warn(`Custom gradient ${id} not found.`);
                return;
            }
        } 
        else {
            console.warn(`Gradient ${name} not found.`);
            return;
        }
        
        // 强制重新生成调色板
        this.palette = null;
        this.initPalette();
        
        // 更新下拉菜单的选中高亮
        const options = document.querySelectorAll('.gradient-option');
        options.forEach(opt => {
            if (opt.dataset.value === name) opt.classList.add('active');
            else opt.classList.remove('active');
        });

        this.updateGradientBarUI();
        this.saveSettings();
        this.requestRender();
    }

    updateGradientBarUI() {
        const bar = document.getElementById('gradientBar');
        let gradientData;

        // 根据当前名称判断数据源
        if (this.currentGradientName.startsWith('custom_')) {
            const id = this.currentGradientName.replace('custom_', '');
            gradientData = this.customGradients[id];
            // 容错：如果数据丢了，回退到默认
            if (!gradientData) {
                this.currentGradientName = 'classic';
                gradientData = this.gradients['classic'];
            }
        } else {
            gradientData = this.gradients[this.currentGradientName];
        }

        const stopsArr = Object.entries(gradientData.stops).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
        const cssGradient = `linear-gradient(to right, ${stopsArr.map(s => `${s[1]} ${parseFloat(s[0]) * 100}%`).join(', ')})`;
        bar.style.background = cssGradient;
    }

    setupBrushCircle() {
        this.brushCircle.style.cssText = `position: absolute; pointer-events: none; border-radius: 50%; z-index: 9999; display: none; mix-blend-mode: normal; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3); transition: width 0.1s ease, height 0.1s ease; left: 0; top: 0;`;
        this.updateCursorStyle();
    }

    updateCursorStyle() {
        this.initPalette();
        if (this.isErasing) {
            this.brushCircle.style.background = `radial-gradient(closest-side, rgba(0, 255, 0, 0.5) 0%, rgba(0, 255, 0, 0) 100%)`;
            this.brushCircle.style.boxShadow = `0 0 0 1px rgba(0, 255, 0, 0.5)`;
            return;
        }
        const stops = []; const steps = 10; const blurThreshold = 1 - Math.max(0, Math.min(1, this.brushBlur));
        for (let i = 0; i <= steps; i++) {
            const percent = i / steps;
            let localAlpha = (percent < blurThreshold) ? this.brushAlpha : (1 - blurThreshold <= 0 ? 0 : this.brushAlpha * (1 - (percent - blurThreshold) / (1 - blurThreshold)));
            const idx = Math.floor(localAlpha * 255) * 4;
            stops.push(`rgba(${this.palette[idx]}, ${this.palette[idx + 1]}, ${this.palette[idx + 2]}, ${Math.min(1, localAlpha * 1.2)}) ${percent * 100}%`);
        }
        this.brushCircle.style.background = `radial-gradient(closest-side, ${stops.join(', ')})`;
        const maxIdx = Math.floor(this.brushAlpha * 255) * 4;
        this.brushCircle.style.boxShadow = `0 0 0 1px rgba(${this.palette[maxIdx]}, ${this.palette[maxIdx + 1]}, ${this.palette[maxIdx + 2]}, 0.3)`;
    }

    updateBrushTexture() {
        const size = 128; const ctx = this.brushTexture.getContext('2d'); const center = size / 2; const radius = size / 2;
        ctx.clearRect(0, 0, size, size); const innerRadius = radius * (1 - Math.max(0.01, this.brushBlur));
        const grd = ctx.createRadialGradient(center, center, innerRadius, center, center, radius);
        grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fill();
        this._textureCache = {};
    }

    setMode(mode) {
        this.currentMode = mode; this.exitDrawMode(); this.initEventListeners();
        if (window.layerManager) window.layerManager.switchMode(mode);
        this.render(); if (window.storageManager) window.storageManager.save('settings', this.getSettings());
    }

    get manager() { return this.currentMode === 'board' ? this.boardManager : this.mapManager; }

    initCommonEvents() {
        document.getElementById('radiusRange').oninput = (e) => { this.brushRadius = parseInt(e.target.value, 10); this.updateValueDisplays(); this.updateBrushCircleSize(); this.saveSettings(); };
        document.getElementById('alphaRange').oninput = (e) => { this.brushAlpha = parseFloat(e.target.value); this.updateValueDisplays(); this.saveSettings(); };
        document.getElementById('blurRange').oninput = (e) => { this.brushBlur = parseFloat(e.target.value); this.updateBrushTexture(); this.updateValueDisplays(); this.requestRender(); this.saveSettings(); };
        document.getElementById('toggleHeatmap').addEventListener('click', () => { this.toggleHeatmapVisibility(); });
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        this._wheelHandler = this.handleWheel.bind(this);
    }

    initEventListeners() {
        const container = this.manager.getContainer(); this._currentContainer = container;
        container.addEventListener('mousemove', (e) => this.updateBrushCirclePosition(e));
        container.addEventListener('contextmenu', (e) => { if (this.drawMode) { e.preventDefault(); return false; } });

        if (this.currentMode === 'map') {
            // 关键优化：针对天地图的平移和缩放处理
            // 1. 平移时 (move) 直接渲染，避免不跟手
            this.mapManager.on('move', () => {
                this.requestRender();
            });

            // 2. 缩放开始时 (zoomstart) 隐藏热力图，避免错位
            // this.mapManager.on('zoomstart', () => {
            //     this.canvas.style.opacity = 0;
            // });

            // 3. 缩放结束后 (zoomend) 恢复并渲染
            this.mapManager.on('zoomend', () => {
                this.canvas.style.opacity = 1;
                this.render();
                if (this.drawMode) this.updateBrushCircleSize();
            });

            // 移动结束保存状态
            this.mapManager.on('moveend', () => { this.render(); });
        }
    }

    // _onMapMove 逻辑被上方 initEventListeners 中的直接事件取代
    _onMapMove() {
        if (this.currentMode === 'board') { this.requestRender(); }
    }

    handleKeyboardShortcuts(e) { if (e.key === 'Escape' && this.drawMode) { this.cancelCurrentSession(); e.preventDefault(); } if (e.key === ' ' && !e.ctrlKey && !e.altKey && !e.shiftKey) { this.toggleDrawMode(); e.preventDefault(); } }
    handleWheel(e) {
        if (!this.drawMode) return;
        const hasModifier = e.ctrlKey || e.shiftKey || e.altKey;
        if (hasModifier) {
            const delta = Math.sign(e.deltaY) * -1;
            if (e.ctrlKey && !e.altKey && !e.shiftKey) this.adjustBrushRadius(delta * 5);
            else if (e.shiftKey && !e.ctrlKey && !e.altKey) this.adjustBrushAlpha(delta * 0.05);
            else if (e.altKey && !e.ctrlKey && !e.shiftKey) this.adjustBrushBlur(delta * 0.1);
            this.saveSettings(); e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        }
    }

    adjustBrushAlpha(delta) { this.brushAlpha = Math.max(0.01, Math.min(1, this.brushAlpha + delta)); document.getElementById('alphaRange').value = this.brushAlpha; this.updateValueDisplays(); this.showAdjustmentNotification(`画笔强度: ${this.brushAlpha.toFixed(2)}`); }
    adjustBrushRadius(delta) { this.brushRadius = Math.max(5, Math.min(500, this.brushRadius + delta)); document.getElementById('radiusRange').value = this.brushRadius; this.updateValueDisplays(); this.updateBrushCircleSize(); this.showAdjustmentNotification(`画笔半径: ${this.brushRadius}px`); }
    adjustBrushBlur(delta) { this.brushBlur = Math.max(0, Math.min(1, this.brushBlur + delta)); document.getElementById('blurRange').value = this.brushBlur; this.updateBrushTexture(); this.updateValueDisplays(); this.requestRender(); this.showAdjustmentNotification(`模糊度: ${this.brushBlur.toFixed(1)}`); }

    cancelCurrentSession() { if (this.currentSessionPoints.length === 0) { this.clearCurrentPoints(); this.exitDrawMode(); return; } this.currentSessionPoints.forEach(p => { const idx = this.points.indexOf(p); if (idx > -1) this.points.splice(idx, 1); }); this.currentSessionPoints = []; this.render(); this.showAdjustmentNotification('已取消本次绘制'); this.exitDrawMode(); }
    showAdjustmentNotification(msg) { const ex = document.getElementById('brush-adjust-notification'); if (ex) ex.remove(); const n = document.createElement('div'); n.id = 'brush-adjust-notification'; n.className = 'top-center-notification show'; n.textContent = msg; document.body.appendChild(n); setTimeout(() => n.remove(), 1000); }

    enterDrawMode() {
        if (this.currentMode === 'board' && !this.boardManager.hasImage) { window.uiManager.showAlert('无法开始绘制', '请先点击底部的 <b>"上传图片"</b> 按钮加载一张底图。', 'warning'); return; }
        this.canvas.classList.add('drawing'); document.getElementById('drawToggleBtn').innerHTML = '<i class="fas fa-stop"></i> 结束绘制'; document.getElementById('drawToggleBtn').classList.add('danger');
        this.canvas.style.pointerEvents = 'none'; this.currentSessionPoints = []; this.clearCurrentPoints(); this.brushCircle.style.display = 'block'; this.updateBrushCircleSize();
        if (this.currentMode === 'map') this.mapManager.setStatus({ dragEnable: false, doubleClickZoom: false, scrollWheel: true });
        this._boundDown = this.handlePointerDown.bind(this); const container = this.manager.getContainer(); container.addEventListener('pointerdown', this._boundDown); container.oncontextmenu = () => false;
        window.addEventListener('wheel', this._wheelHandler, { passive: false, capture: true }); this.lastDrawPos = null;
    }

    exitDrawMode() {
        this.drawMode = false; this.drawing = false; this.canvas.classList.remove('drawing');
        document.getElementById('drawToggleBtn').innerHTML = '<i class="fas fa-paint-brush"></i> 开始绘制'; document.getElementById('drawToggleBtn').classList.remove('danger');
        this.brushCircle.style.display = 'none';
        if (this.currentMode === 'map') this.mapManager.setStatus({ dragEnable: true, doubleClickZoom: true, scrollWheel: true });
        this.canvas.style.pointerEvents = 'none'; const container = this.manager.getContainer(); container.oncontextmenu = null;
        if (this._boundDown) container.removeEventListener('pointerdown', this._boundDown);
        window.removeEventListener('wheel', this._wheelHandler, { capture: true });
        if (this._boundGlobalMove) { window.removeEventListener('pointermove', this._boundGlobalMove); window.removeEventListener('pointerup', this._boundGlobalUp); this._boundGlobalMove = null; this._boundGlobalUp = null; }
        this.currentSessionPoints = []; this.clearCurrentPoints(); this.isErasing = false; this.updateCursorStyle();
        if (window.layerManager) window.layerManager.updateDrawButtonState();
    }

    updateBrushCirclePosition(e) { if (!this.drawMode) return; const x = e.clientX; const y = e.clientY; this.brushCircle.style.transform = `translate(${x - parseFloat(this.brushCircle.style.width) / 2}px, ${y - parseFloat(this.brushCircle.style.height) / 2}px)`; this.brushCircle.style.left = '0px'; this.brushCircle.style.top = '0px'; this.brushCircle.style.position = 'fixed'; }
    updateBrushCircleSize() { if (!this.drawMode) return; const r = this.brushRadius; this.brushCircle.style.width = r * 2 + 'px'; this.brushCircle.style.height = r * 2 + 'px'; }
    initPalette() {
        if (this.palette) return;

        let gradientData;
        
        // 判断当前使用的是内置还是自定义
        if (this.currentGradientName.startsWith('custom_')) {
            const id = this.currentGradientName.replace('custom_', '');
            gradientData = this.customGradients[id];
            // 如果找不到自定义的（可能被删除了），回退到默认
            if (!gradientData) {
                this.currentGradientName = 'classic';
                gradientData = this.gradients['classic'];
            }
        } else {
            gradientData = this.gradients[this.currentGradientName] || this.gradients['classic'];
        }

        const c = document.createElement('canvas');
        c.width = 256; c.height = 1;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 256, 0);
        
        try {
            for (const [pos, color] of Object.entries(gradientData.stops)) {
                g.addColorStop(parseFloat(pos), color);
            }
        } catch (e) { console.error(e); }

        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 1);
        this.palette = ctx.getImageData(0, 0, 256, 1).data;
    }

    loadCustomGradients() {
        try {
            const stored = localStorage.getItem('heatmap_custom_gradients');
            if (stored) {
                this.customGradients = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load custom gradients', e);
        }
    }

    saveCustomGradients() {
        localStorage.setItem('heatmap_custom_gradients', JSON.stringify(this.customGradients));
    }

    toggleDrawMode() {
        const layers = window.layerManager ? window.layerManager.getLayersByMode(this.currentMode) : [];
        if (layers.length === 0) { this.showNoLayerNotification(); return false; }
        const currentLayerId = window.layerManager ? window.layerManager.getCurrentLayerId() : null;
        const currentLayer = window.layerManager.getLayerById(currentLayerId);
        if (!currentLayer || currentLayer.mode !== this.currentMode) { window.layerManager.switchMode(this.currentMode); if (window.layerManager.getLayersByMode(this.currentMode).length === 0) { this.showNoLayerNotification(); return false; } }
        this.drawMode = !this.drawMode; if (this.drawMode) this.enterDrawMode(); else this.exitDrawMode();
        if (window.layerManager) window.layerManager.updateDrawButtonState(); return this.drawMode;
    }

    showNoLayerNotification() { if (window.uiManager) window.uiManager.showNotification('请先创建图层', 'error'); }

    handlePointerDown(e) {
        if (!this.drawMode) return; if (e.button !== 0 && e.button !== 2 && e.pointerType === 'mouse') return;
        e.preventDefault(); e.stopPropagation();
        if (window.historyManager) window.historyManager.saveState();
        if (e.button === 2) { this.isErasing = true; this.updateCursorStyle(); } else { this.isErasing = false; this.updateCursorStyle(); }
        this.drawing = true; this.lastDrawPos = null; const pos = this.getPos(e); this.addPointsFromScreen(pos.x, pos.y);
        this._boundGlobalMove = this.handlePointerMove.bind(this); this._boundGlobalUp = this.handlePointerUp.bind(this);
        window.addEventListener('pointermove', this._boundGlobalMove); window.addEventListener('pointerup', this._boundGlobalUp);
    }
    handlePointerMove(e) { if (!this.drawing) return; e.preventDefault(); e.stopPropagation(); const pos = this.getPos(e); this.addPointsFromScreen(pos.x, pos.y); this.updateBrushCirclePosition(e); }
    handlePointerUp(e) {
        if (!this.drawing) return; this.drawing = false; this.lastDrawPos = null;
        if (window.layerManager && this.currentSessionPoints.length > 0) { window.layerManager.saveCurrentPointsToLayer(this.currentSessionPoints); this.currentSessionPoints = []; }
        this.clearCurrentPoints(); if (this.isErasing) { this.isErasing = false; this.updateCursorStyle(); }
        window.removeEventListener('pointermove', this._boundGlobalMove); window.removeEventListener('pointerup', this._boundGlobalUp); this._boundGlobalMove = null; this._boundGlobalUp = null;
    }

    addPointsFromScreen(x, y) {
        const pixelObj = this.currentMode === 'map' ? new T.Point(x, y) : { x, y };
        const worldPoint = this.manager.containerToLngLat(pixelObj);
        if (!worldPoint) return;
        const currentPixelRadius = this.brushRadius;
        if (this.lastDrawPos) { const dx = x - this.lastDrawPos.x; const dy = y - this.lastDrawPos.y; if (Math.sqrt(dx * dx + dy * dy) < currentPixelRadius / 4) return; }
        this.lastDrawPos = { x, y };
        let storedRadius;
        if (this.currentMode === 'map') { const zoom = this.mapManager.getZoom(); storedRadius = this.pixelsToMeters(currentPixelRadius, worldPoint.lat, zoom); }
        else { storedRadius = currentPixelRadius / this.boardManager.transform.scale; }
        const point = { lng: worldPoint.lng, lat: worldPoint.lat, radius: storedRadius, alpha: this.brushAlpha, blur: this.brushBlur, isErase: this.isErasing, type: this.currentMode };
        this.points.push(point); this.currentSessionPoints.push(point); this.updateValueDisplays(); this.requestRender();
    }

    getPos(e) { const rect = this.manager.getContainer().getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
    resizeCanvas() { const container = document.getElementById('map'); const rect = container.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; const w = rect.width * dpr; const h = rect.height * dpr; if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.canvas.style.width = rect.width + 'px'; this.canvas.style.height = rect.height + 'px'; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.offscreen.width = w; this.offscreen.height = h; this.offctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.updateBrushTexture(); this.requestRender(); } }
    requestRender() { if (!this.renderPending) { this.renderPending = true; requestAnimationFrame(() => this.render()); } }

    render() {
        this.renderPending = false; this.clearCanvas();
        // 关键修复：每次渲染时，无论是否有交互，都要重置transform，因为我们现在依赖全屏重绘
        if (this.currentMode === 'map') this.canvas.style.transform = 'none';

        let allPoints = [];
        if (window.layerManager) {
            const layers = window.layerManager.getLayersByMode(this.currentMode);
            for (const layer of layers) if (layer.visible) allPoints = allPoints.concat(layer.points);
        }
        allPoints = allPoints.concat(this.points);
        allPoints = allPoints.filter(p => { if (this.currentMode === 'map') return !p.type || p.type === 'map'; else return p.type === 'board'; });
        if (allPoints.length === 0) return;
        const zoom = this.manager.getZoom();
        for (const p of allPoints) {
            let pt; if (this.currentMode === 'map') pt = this.manager.lngLatToContainer([p.lng, p.lat]); else pt = this.manager.lngLatToContainer({ lng: p.lng, lat: p.lat });
            if (pt.x < -200 || pt.y < -200 || pt.x > this.canvas.width + 200 || pt.y > this.canvas.height + 200) continue;
            let pixelRadius; if (this.currentMode === 'map') pixelRadius = this.metersToPixels(p.radius, p.lat, zoom); else pixelRadius = p.radius * this.boardManager.transform.scale;
            const texture = this.getTextureForBlur(p.blur !== undefined ? p.blur : 1.0);
            this.offctx.globalAlpha = Math.abs(p.alpha);
            this.offctx.globalCompositeOperation = (p.isErase || p.alpha < 0) ? 'destination-out' : 'source-over';
            this.offctx.drawImage(texture, pt.x - pixelRadius, pt.y - pixelRadius, pixelRadius * 2, pixelRadius * 2);
        }
        this.colorize();
    }

    getTextureForBlur(blur) { const key = Math.round(blur * 10) / 10; if (!this._textureCache) this._textureCache = {}; if (!this._textureCache[key]) { const cvs = document.createElement('canvas'); cvs.width = 64; cvs.height = 64; const ctx = cvs.getContext('2d'); const r = 32; const inner = r * (1 - key); const grd = ctx.createRadialGradient(r, r, inner, r, r, r); grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill(); this._textureCache[key] = cvs; } return this._textureCache[key]; }
    pixelsToMeters(px, lat, z) { return px * (40075017 * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, z))); }
    metersToPixels(m, lat, z) { return m / (40075017 * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, z))); }
    colorize() { const w = this.offscreen.width; const h = this.offscreen.height; if (w === 0 || h === 0) return; const img = this.offctx.getImageData(0, 0, w, h); const pixels = img.data; this.initPalette(); const MAX = 204; for (let i = 0; i < pixels.length; i += 4) { const a = pixels[i + 3]; if (a > 0) { const idx = Math.min(255, a) * 4; pixels[i] = this.palette[idx]; pixels[i + 1] = this.palette[idx + 1]; pixels[i + 2] = this.palette[idx + 2]; pixels[i + 3] = Math.min(MAX, a * 1.5); } } this.ctx.putImageData(img, 0, 0); }
    clearCanvas() { this.offctx.clearRect(0, 0, this.offscreen.width, this.offscreen.height); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
    toggleHeatmapVisibility() { const t = document.getElementById('toggleHeatmap'); t.classList.toggle('active'); this.heatmapVisible = t.classList.contains('active'); this.canvas.style.display = this.heatmapVisible ? 'block' : 'none'; }
    updateValueDisplays() { document.getElementById('radiusValue').textContent = this.brushRadius + 'px'; document.getElementById('alphaValue').textContent = this.brushAlpha.toFixed(2); document.getElementById('blurValue').textContent = this.brushBlur.toFixed(1); let totalPoints = this.points.length; if (window.layerManager) window.layerManager.getLayersByMode(this.currentMode).forEach(l => { totalPoints += l.points.length; }); document.getElementById('pointsCount').textContent = totalPoints; this.updateCursorStyle(); }
    getCurrentPoints() { return this.points; }
    setCurrentPoints(points) { this.points = points; this.updateValueDisplays(); this.render(); }
    clearCurrentPoints() { this.points.length = 0; this.updateValueDisplays(); this.requestRender(); }
    getBrushParams() { return { radius: this.brushRadius, alpha: this.brushAlpha, blur: this.brushBlur }; }
    setBrushParams(params) { if (params.radius !== undefined) { this.brushRadius = params.radius; document.getElementById('radiusRange').value = params.radius; } if (params.alpha !== undefined) { this.brushAlpha = params.alpha; document.getElementById('alphaRange').value = params.alpha; } if (params.blur !== undefined) { this.brushBlur = params.blur; document.getElementById('blurRange').value = params.blur; this.updateBrushTexture(); } this.updateValueDisplays(); }
    getSettings() {
        return { 
            mode: this.currentMode, 
            params: this.getBrushParams(),
            gradient: this.currentGradientName // 新增保存项
        };
    }

    // 修改 restoreSettings
    restoreSettings(settings) {
        if (!settings) return;
        if (settings.params) this.setBrushParams(settings.params);
        if (settings.gradient) this.setGradient(settings.gradient); // 恢复配色
    }
    saveSettings() { if (window.storageManager) window.storageManager.save('settings', this.getSettings()); }

    initGradientEditorEvents() {
        // 模态框通用按钮
        const createBtn = document.getElementById('createGradientBtn');
        if (createBtn) createBtn.onclick = (e) => { e.stopPropagation(); document.getElementById('gradientDropdown').classList.remove('show'); this.openGradientEditor(); };
        
        document.getElementById('closeGradientModal').onclick = () => document.getElementById('gradientEditorModal').style.display = 'none';
        document.getElementById('cancelGradientBtn').onclick = () => document.getElementById('gradientEditorModal').style.display = 'none';
        document.getElementById('saveGradientBtn').onclick = () => this.saveFromEditor();

        // --- PS编辑器 交互事件 ---
        
        // 1. 点击滑块区域：添加新节点
        const stopsArea = document.getElementById('psStopsArea');
        stopsArea.addEventListener('pointerdown', (e) => {
            if (e.target.classList.contains('ps-stop-handle')) return; // 如果点的是滑块，由滑块逻辑处理
            
            const rect = stopsArea.getBoundingClientRect();
            let percent = (e.clientX - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent));
            
            // 默认颜色：取当前位置的插值颜色（这里简化为白色，用户可调）
            this.addEditorStopData(percent, '#ffffff');
        });

        // 2. 底部控件事件
        const colorInput = document.getElementById('psColorInput');
        const posInput = document.getElementById('psPosInput');
        const delBtn = document.getElementById('psDeleteStopBtn');

        colorInput.addEventListener('input', (e) => this.updateActiveStop(null, e.target.value));
        posInput.addEventListener('input', (e) => this.updateActiveStop(e.target.value / 100, null));
        delBtn.addEventListener('click', () => this.deleteActiveStop());
    }

    openGradientEditor(editId = null) {
        this.editingGradientId = editId;
        const modal = document.getElementById('gradientEditorModal');
        const nameInput = document.getElementById('gradientNameInput');
        const title = document.getElementById('gradientEditorTitle');

        // 初始化数据
        this.editorStops = []; // 格式: [{id: 1, pos: 0.5, color: '#ff0000'}, ...]
        this.activeStopId = null;
        this.stopIdCounter = 0;

        if (editId) {
            const data = this.customGradients[editId];
            title.innerHTML = '<i class="fas fa-edit"></i> 编辑配色方案';
            nameInput.value = data.name;
            // 转换数据格式
            Object.entries(data.stops).forEach(([pos, color]) => {
                this.editorStops.push({
                    id: this.stopIdCounter++,
                    pos: parseFloat(pos),
                    color: color
                });
            });
        } else {
            title.innerHTML = '<i class="fas fa-plus"></i> 新建配色方案';
            nameInput.value = '';
            // 默认两个端点
            this.editorStops.push({ id: this.stopIdCounter++, pos: 0.0, color: '#0000ff' });
            this.editorStops.push({ id: this.stopIdCounter++, pos: 1.0, color: '#ff0000' });
        }

        // 默认选中第一个
        this.activeStopId = this.editorStops[0].id;
        
        this.renderEditor();
        modal.style.display = 'flex';
    }

    renderEditor() {
        const track = document.getElementById('psGradientPreview');
        const area = document.getElementById('psStopsArea');
        const controls = document.getElementById('psControls');
        const colorInput = document.getElementById('psColorInput');
        const posInput = document.getElementById('psPosInput');

        // 1. 排序数据
        this.editorStops.sort((a, b) => a.pos - b.pos);

        // 2. 渲染背景预览
        const css = `linear-gradient(to right, ${this.editorStops.map(s => `${s.color} ${s.pos * 100}%`).join(', ')})`;
        track.style.background = css;

        // 3. 渲染滑块
        area.innerHTML = '';
        this.editorStops.forEach(stop => {
            const handle = document.createElement('div');
            handle.className = `ps-stop-handle ${stop.id === this.activeStopId ? 'active' : ''}`;
            handle.style.left = `${stop.pos * 100}%`;
            handle.style.setProperty('--stop-color', stop.color);
            
            // --- 拖拽与点击逻辑优化 ---
            handle.addEventListener('pointerdown', (e) => {
                e.stopPropagation(); // 防止触发 area 的添加事件
                e.preventDefault();  // 防止文本选中
                
                // 1. 选中当前节点
                this.activeStopId = stop.id;
                this.renderEditor(); // 重新渲染以高亮选中项、更新下方输入框值
                
                // 2. 准备拖拽
                const startX = e.clientX;
                const areaRect = area.getBoundingClientRect();
                const startPos = stop.pos;
                let hasMoved = false; // 标记是否发生了移动

                const onMove = (moveEvent) => {
                    const dx = moveEvent.clientX - startX;
                    
                    // 只有移动超过 2 像素才算是拖拽，避免手抖误判
                    if (Math.abs(dx) > 2) {
                        hasMoved = true;
                        let newPos = startPos + (dx / areaRect.width);
                        newPos = Math.max(0, Math.min(1, newPos));
                        this.updateActiveStop(newPos, null);
                    }
                };

                const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    
                    // 3. 如果没有发生移动，则视为“点击”
                    if (!hasMoved) {
                        // 稍微延迟一下，确保 input value 已经更新
                        setTimeout(() => {
                            // 模拟点击隐藏的颜色输入框，弹出选色卡
                            colorInput.click(); 
                        }, 0);
                    }
                };

                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            });

            area.appendChild(handle);
        });

        // 4. 更新控件区域
        const activeStop = this.editorStops.find(s => s.id === this.activeStopId);
        if (activeStop) {
            controls.classList.remove('disabled');
            colorInput.value = this.rgbToHex(activeStop.color);
            posInput.value = Math.round(activeStop.pos * 100);
        } else {
            controls.classList.add('disabled');
        }
    }

    addEditorStopData(pos, color) {
        const newStop = {
            id: this.stopIdCounter++,
            pos: pos,
            color: color
        };
        this.editorStops.push(newStop);
        this.activeStopId = newStop.id;
        this.renderEditor();
    }

    updateActiveStop(newPos, newColor) {
        const stop = this.editorStops.find(s => s.id === this.activeStopId);
        if (!stop) return;

        if (newPos !== null) stop.pos = parseFloat(newPos);
        if (newColor !== null) stop.color = newColor;

        this.renderEditor();
    }

    deleteActiveStop() {
        if (this.editorStops.length <= 2) {
            window.uiManager.showNotification('至少保留两个颜色节点', 'error');
            return;
        }
        this.editorStops = this.editorStops.filter(s => s.id !== this.activeStopId);
        // 选中剩下的第一个
        this.activeStopId = this.editorStops[0].id;
        this.renderEditor();
    }

    saveFromEditor() {
        const name = document.getElementById('gradientNameInput').value.trim();
        if (!name) { window.uiManager.showNotification('请输入方案名称', 'warning'); return; }

        const stopsObj = {};
        this.editorStops.forEach(s => {
            // 防止 key 重复，如果位置完全一样，稍微偏移一点点
            let key = s.pos;
            while (stopsObj[key]) { key += 0.0001; }
            stopsObj[key] = s.color;
        });

        const id = this.editingGradientId || Date.now().toString();
        this.customGradients[id] = { name: name, stops: stopsObj };

        this.saveCustomGradients();
        this.initGradientUI();
        this.setGradient(`custom_${id}`);
        
        document.getElementById('gradientEditorModal').style.display = 'none';
        window.uiManager.showNotification('配色方案已保存', 'success');
    }

    deleteCustomGradient(id) {
        if (this.currentGradientName === `custom_${id}`) {
            this.setGradient('classic'); // 如果删除了当前正在用的，回退到默认
        }
        delete this.customGradients[id];
        this.saveCustomGradients();
        this.initGradientUI();
    }

    // 辅助：处理颜色格式兼容
    rgbToHex(color) {
        if (color.startsWith('#')) return color;
        // 简单的 RGB 转 Hex 处理（如果需要支持更多格式可以使用 canvas 辅助）
        if (color.startsWith('rgb')) {
            const rgb = color.match(/\d+/g);
            return '#' + ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1);
        }
        return '#000000';
    }
}

// --- 历史记录管理模块 ---
class HistoryManager {
    constructor(layerManager, brushManager) { this.layerManager = layerManager; this.brushManager = brushManager; this.undoStack = []; this.redoStack = []; this.maxHistory = 20; this.initEventListeners(); this.updateButtons(); }
    initEventListeners() { document.getElementById('undoBtn').onclick = () => this.undo(); document.getElementById('redoBtn').onclick = () => this.redo(); document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); } if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); this.redo(); } }); }
    saveState() { const layersSnapshot = JSON.parse(JSON.stringify(this.layerManager.getLayers())); const currentLayerId = this.layerManager.getCurrentLayerId(); this.undoStack.push({ layers: layersSnapshot, currentLayerId: currentLayerId }); if (this.undoStack.length > this.maxHistory) this.undoStack.shift(); this.redoStack = []; this.updateButtons(); }
    undo() { if (this.undoStack.length === 0) return; const currentState = { layers: JSON.parse(JSON.stringify(this.layerManager.getLayers())), currentLayerId: this.layerManager.getCurrentLayerId() }; this.redoStack.push(currentState); const prevState = this.undoStack.pop(); this.applyState(prevState); this.updateButtons(); }
    redo() { if (this.redoStack.length === 0) return; const currentState = { layers: JSON.parse(JSON.stringify(this.layerManager.getLayers())), currentLayerId: this.layerManager.getCurrentLayerId() }; this.undoStack.push(currentState); const nextState = this.redoStack.pop(); this.applyState(nextState); this.updateButtons(); }
    applyState(state) { this.layerManager.setLayers(state.layers); if (state.currentLayerId !== null) this.layerManager.setCurrentLayer(state.currentLayerId); this.brushManager.clearCurrentPoints(); this.layerManager.renderLayerList(); this.brushManager.render(); this.brushManager.updateValueDisplays(); }
    updateButtons() { document.getElementById('undoBtn').disabled = this.undoStack.length === 0; document.getElementById('redoBtn').disabled = this.redoStack.length === 0; }
}

// --- 图层管理模块 ---
class LayerManager {
    constructor() { this.layers = []; this.layerCounter = 0; this.currentLayerId = null; this.initEventListeners(); }
    get currentMode() { return window.brushManager ? window.brushManager.currentMode : 'map'; }
    initDefault() { this.ensureLayerForMode(this.currentMode); if (this.layers.length > 0) this.layerCounter = Math.max(...this.layers.map(l => l.id)) + 1; this.renderLayerList(); this.updateDrawButtonState(); }
    switchMode(mode) { this.ensureLayerForMode(mode); const layers = this.getLayersByMode(mode); if (layers.length > 0) { const current = this.getLayerById(this.currentLayerId); if (!current || current.mode !== mode) this.currentLayerId = layers[0].id; } this.renderLayerList(); this.updateDrawButtonState(); }
    ensureLayerForMode(mode) { const layers = this.getLayersByMode(mode); if (layers.length === 0) this.createDefaultLayer(mode); }
    getLayersByMode(mode) { return this.layers.filter(l => l.mode === mode || (!l.mode && mode === 'map')); }
    getLayerById(id) { return this.layers.find(l => l.id === id); }

    updateDrawButtonState() {
        const drawButton = document.getElementById('drawToggleBtn'); if (drawButton) {
            const layers = this.getLayersByMode(this.currentMode);
            if (layers.length === 0) { drawButton.disabled = true; drawButton.title = '请先创建图层'; drawButton.innerHTML = '<i class="fas fa-paint-brush"></i> 无法绘制'; drawButton.classList.remove('danger'); }
            else { drawButton.disabled = false; drawButton.title = '开始绘制热力图'; if (window.brushManager && window.brushManager.drawMode) { drawButton.innerHTML = '<i class="fas fa-stop"></i> 结束绘制'; drawButton.classList.add('danger'); } else { drawButton.innerHTML = '<i class="fas fa-paint-brush"></i> 开始绘制'; drawButton.classList.remove('danger'); } }
            drawButton.style.display = 'none'; drawButton.offsetHeight; drawButton.style.display = '';
        }
    }

    initEventListeners() { document.getElementById('addLayerBtn').addEventListener('click', () => { this.addLayer(); setTimeout(() => { this.updateDrawButtonState(); }, 100); }); document.getElementById('minimizeLayerBtn').addEventListener('click', () => { this.toggleLayerToolbarMinimize(); }); document.getElementById('layerMinimizeIcon').addEventListener('click', () => { this.expandLayerToolbar(); }); }
    createDefaultLayer(mode) { const targetMode = mode || this.currentMode; const defaultLayer = { id: this.layerCounter++, name: targetMode === 'board' ? '画板图层 1' : '地图图层 1', points: [], visible: true, editing: false, mode: targetMode }; this.layers.push(defaultLayer); if (targetMode === this.currentMode) this.currentLayerId = defaultLayer.id; this.saveLayers(); }
    addLayer() { if (window.historyManager) window.historyManager.saveState(); const newLayer = { id: this.layerCounter++, name: `图层 ${this.layerCounter}`, points: [], visible: true, editing: false, mode: this.currentMode }; this.layers.push(newLayer); this.currentLayerId = newLayer.id; this.renderLayerList(); this.saveLayers(); if (window.brushManager) window.brushManager.clearCurrentPoints(); return newLayer; }
    renderLayerList() { const layerList = document.getElementById('layerList'); layerList.innerHTML = ''; const visibleLayers = this.getLayersByMode(this.currentMode); if (visibleLayers.length === 0) { layerList.innerHTML = '<div style="text-align: center; padding: 10px; color: var(--gray); font-size: 12px;">暂无图层</div>'; return; } visibleLayers.forEach((layer) => { const layerItem = this.createLayerItem(layer); layerList.appendChild(layerItem); }); }
    createLayerItem(layer) { const layerItem = document.createElement('div'); layerItem.className = `layer-item ${layer.visible ? 'active' : ''} ${layer.id === this.currentLayerId ? 'current' : ''}`; layerItem.dataset.id = layer.id; if (layer.editing) { layerItem.innerHTML = this.getEditingLayerHTML(layer); this.setupEditingLayerEvents(layerItem, layer); } else { layerItem.innerHTML = this.getNormalLayerHTML(layer); this.setupNormalLayerEvents(layerItem, layer); } return layerItem; }
    getEditingLayerHTML(layer) { return `<input type="text" class="layer-name-input" value="${layer.name}"><div class="layer-item-actions"><div class="ios-toggle ${layer.visible ? 'active' : ''}"></div><button class="layer-item-action-btn rename" title="重命名"><i class="fas fa-edit"></i></button><button class="layer-item-action-btn export" title="导出图层"><i class="fas fa-download"></i></button><button class="layer-item-action-btn delete" title="删除图层"><i class="fas fa-trash"></i></button></div>`; }
    getNormalLayerHTML(layer) { return `<div class="layer-name">${layer.name}</div><div class="layer-item-actions"><div class="ios-toggle ${layer.visible ? 'active' : ''}"></div><button class="layer-item-action-btn rename" title="重命名"><i class="fas fa-edit"></i></button><button class="layer-item-action-btn export" title="导出图层"><i class="fas fa-download"></i></button><button class="layer-item-action-btn delete" title="删除图层"><i class="fas fa-trash"></i></button></div>`; }
    setupEditingLayerEvents(layerItem, layer) { const input = layerItem.querySelector('.layer-name-input'); setTimeout(() => { input.focus(); input.select(); }, 10); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.finishLayerEditing(layer.id, input.value); else if (e.key === 'Escape') this.finishLayerEditing(layer.id, layer.name); }); input.addEventListener('blur', () => { this.finishLayerEditing(layer.id, input.value); }); this.setupCommonLayerEvents(layerItem, layer); }
    setupNormalLayerEvents(layerItem, layer) { const layerName = layerItem.querySelector('.layer-name'); layerName.addEventListener('click', () => { this.setCurrentLayer(layer.id); }); const renameBtn = layerItem.querySelector('.rename'); renameBtn.addEventListener('click', () => { this.startLayerEditing(layer.id); }); const exportBtn = layerItem.querySelector('.export'); exportBtn.addEventListener('click', (e) => { e.stopPropagation(); if (window.importExportManager) window.importExportManager.showLayerExportMenu([layer], e.target); }); this.setupCommonLayerEvents(layerItem, layer); }
    setupCommonLayerEvents(layerItem, layer) { const deleteBtn = layerItem.querySelector('.delete'); deleteBtn.addEventListener('click', () => { this.deleteLayer(layer.id); }); const toggle = layerItem.querySelector('.ios-toggle'); if (toggle) { toggle.addEventListener('click', (e) => { e.stopPropagation(); this.toggleLayerVisibility(layer.id); }); } }

    getLayerIndex(id) { return this.layers.findIndex(l => l.id === id); }
    startLayerEditing(id) { const idx = this.getLayerIndex(id); if (idx > -1) { this.layers[idx].editing = true; this.renderLayerList(); } }
    finishLayerEditing(id, newName) { const idx = this.getLayerIndex(id); if (idx > -1) { const layer = this.layers[idx]; if (newName.trim() === '') newName = `图层 ${layer.id}`; layer.name = newName.trim(); layer.editing = false; this.renderLayerList(); this.saveLayers(); } }
    toggleLayerVisibility(id) { const idx = this.getLayerIndex(id); if (idx > -1) { this.layers[idx].visible = !this.layers[idx].visible; this.renderLayerList(); if (window.brushManager) window.brushManager.render(); this.saveLayers(); } }

    deleteLayer(id) {
        const idx = this.getLayerIndex(id); if (idx === -1) return; const layer = this.layers[idx];
        window.uiManager.showConfirm('删除图层', `确定要删除图层 <span class="highlight">${layer.name}</span> 吗？`, 'danger').then(ok => {
            if (ok) {
                if (window.historyManager) window.historyManager.saveState();
                const isCurrentLayer = layer.id === this.currentLayerId;
                this.layers.splice(idx, 1);
                if (isCurrentLayer) { const remaining = this.getLayersByMode(this.currentMode); if (remaining.length > 0) this.currentLayerId = remaining[0].id; else { this.currentLayerId = null; if (window.brushManager && window.brushManager.drawMode) window.brushManager.exitDrawMode(); } }
                this.renderLayerList(); this.updateDrawButtonState(); this.saveLayers();
                if (window.brushManager) { window.brushManager.render(); window.brushManager.updateValueDisplays(); }
                window.uiManager.showNotification('图层已删除', 'success');
            }
        });
    }

    setCurrentLayer(layerId) { if (window.brushManager && window.brushManager.drawMode) window.brushManager.exitDrawMode(); this.currentLayerId = layerId; this.renderLayerList(); if (window.brushManager) window.brushManager.clearCurrentPoints(); }
    saveCurrentPointsToLayer(points) {
        if (this.currentLayerId === null || points.length === 0) return;
        const currentLayer = this.getLayerById(this.currentLayerId);
        if (currentLayer) {
            const normalPoints = points.filter(point => !point.isErase);
            normalPoints.forEach(point => { currentLayer.points.push({ lng: point.lng, lat: point.lat, radius: point.radius, alpha: point.alpha, blur: point.blur !== undefined ? point.blur : 1.0, type: point.type }); });
            const erasePoints = points.filter(point => point.isErase);
            if (erasePoints.length > 0) this.erasePointsFromLayer(currentLayer, erasePoints);
            this.saveLayers();
        }
    }
    erasePointsFromLayer(layer, erasePoints) {
        const mode = erasePoints[0].type;
        layer.points = layer.points.filter(layerPoint => {
            if (layerPoint.type !== mode && (layerPoint.type || 'map') !== (mode || 'map')) return true;
            for (const erasePoint of erasePoints) {
                let distance; if (mode === 'board') { const dx = layerPoint.lng - erasePoint.lng; const dy = layerPoint.lat - erasePoint.lat; distance = Math.sqrt(dx * dx + dy * dy); } else { distance = this.calculateDistance(layerPoint.lng, layerPoint.lat, erasePoint.lng, erasePoint.lat); }
                if (distance <= erasePoint.radius) return false;
            } return true;
        });
    }
    calculateDistance(lng1, lat1, lng2, lat2) { const R = 6371000; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180; const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c; }
    getLayers() { return this.layers; }
    setLayers(newLayers) { this.layers = newLayers; this.saveLayers(); this.switchMode(this.currentMode); }
    getCurrentLayerId() { return this.currentLayerId; }
    saveLayers() { if (window.storageManager) window.storageManager.save('layers', this.layers); }
    toggleLayerToolbarMinimize() { document.getElementById('layerToolbar').classList.toggle('minimized'); }
    expandLayerToolbar() { document.getElementById('layerToolbar').classList.remove('minimized'); }
    getVisibleLayers() { return this.getLayersByMode(this.currentMode).filter(layer => layer.visible); }
}

// --- 导入导出管理模块 ---
class ImportExportManager {
    constructor(mapManager, brushManager, layerManager) {
        this.mapManager = mapManager; this.brushManager = brushManager; this.layerManager = layerManager;
        this.selectedDPI = 96; this.exportBgType = 'transparent';
        this.initEventListeners(); this.initKeyboardEvents();
    }

    initEventListeners() {
        document.getElementById('jsonFileInput').addEventListener('change', (e) => this.handleJsonImport(e));
        document.getElementById('exportLayerBtn').addEventListener('click', (e) => this.showMainExportMenu(e));
        document.getElementById('closeJsonModal').onclick = () => document.getElementById('jsonModal').style.display = 'none';
        document.getElementById('closePngModal').onclick = () => document.getElementById('pngModal').style.display = 'none';
        document.getElementById('closeExportMenuBtn').onclick = () => this.hideExportMenu();
        document.getElementById('copyJsonBtn').onclick = () => this.copyJsonToClipboard();
        window.onclick = (event) => this.handleModalOutsideClick(event);

        // 分辨率选择
        document.querySelectorAll('input[name="dpi"]').forEach(option => {
            option.addEventListener('change', () => { this.selectedDPI = parseInt(option.value); });
        });

        // 导出类型选择（透明/合成）
        document.querySelectorAll('input[name="bgType"]').forEach(option => {
            option.addEventListener('change', (e) => {
                this.exportBgType = e.target.value;
                this.updateDpiOptionsVisibility();
            });
        });

        document.getElementById('useAgainBtn').onclick = () => this.showExportButtons();
    }

    // 控制二级分辨率选项的显隐
    updateDpiOptionsVisibility() {
        const nestedOptions = document.getElementById('dpiNestedOptions');
        if (this.exportBgType === 'transparent') {
            nestedOptions.style.display = 'block';
        } else {
            nestedOptions.style.display = 'none';
        }
    }

    showExportButtons() { document.getElementById('useAgainBtn').style.display = 'none'; document.getElementById('exportLayerPngBtn').style.display = 'block'; document.getElementById('exportLayerJsonBtn').style.display = 'block'; }
    initKeyboardEvents() { document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.hideExportMenu(); document.getElementById('jsonModal').style.display = 'none'; document.getElementById('pngModal').style.display = 'none'; } }); }
    hideExportMenu() { document.getElementById('layerExportMenu').style.display = 'none'; }

    // --- 导入逻辑 ---
    handleJsonImport(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);
                // 自动识别是否为 GeoJSON
                const isGeoJSON = jsonData.type === 'FeatureCollection';
                if (!isGeoJSON && typeof jsonData !== 'object') throw new Error('数据格式不正确');

                const importMode = this.detectImportMode(jsonData);
                const currentMode = this.brushManager.currentMode;

                if (importMode && importMode !== currentMode) {
                    const modeNames = { 'map': '地图', 'board': '画板' };
                    const msg = `检测到导入文件属于 <span class="highlight">【${modeNames[importMode] || importMode}】</span> 模式数据，<br>而当前处于 <span class="highlight">【${modeNames[currentMode] || currentMode}】</span> 模式。<br><br>是否切换模式并继续导入？`;
                    window.uiManager.showConfirm('模式不匹配', msg, 'warning').then(ok => {
                        if (ok) {
                            const toggleBtn = document.getElementById('modeToggleBtn'); if (toggleBtn) toggleBtn.click();
                            setTimeout(() => { this.processImport(jsonData); }, 50);
                        } else { document.getElementById('jsonFileInput').value = ''; }
                    });
                } else { this.processImport(jsonData); }
            } catch (error) { window.uiManager.showAlert('导入失败: ' + error.message, 'error'); console.error('导入错误:', error); document.getElementById('jsonFileInput').value = ''; }
        }; reader.readAsText(file);
    }

    detectImportMode(jsonData) {
        // GeoJSON 检测
        if (jsonData.type === 'FeatureCollection' && jsonData.features && jsonData.features.length > 0) {
            return jsonData.features[0].properties?.mode || 'map';
        }
        // 旧版 JSON 检测
        if (Array.isArray(jsonData.layers) && jsonData.layers.length > 0) return jsonData.layers[0].mode || 'map';
        else if (Array.isArray(jsonData.dataPoints) && jsonData.dataPoints.length > 0) return jsonData.dataPoints[0].type || 'map';
        return null;
    }

    processImport(jsonData) {
        if (jsonData.type === 'FeatureCollection') this.importGeoJSON(jsonData);
        else if (Array.isArray(jsonData.layers)) this.importLayersData(jsonData);
        else if (Array.isArray(jsonData.dataPoints)) this.importDataPoints(jsonData);
        else throw new Error('数据格式不正确');
        document.getElementById('jsonFileInput').value = '';
    }

    importGeoJSON(geoJSON) {
        if (!geoJSON.features) throw new Error('无效的 GeoJSON 格式');

        // 按图层名分组，如果 GeoJSON 里没有 layerName 属性则全部归为"导入层"
        const layersMap = {};

        geoJSON.features.forEach(feature => {
            if (feature.geometry && feature.geometry.type === 'Point') {
                const props = feature.properties || {};
                const layerName = props.layerName || '导入层';
                const mode = props.mode || 'map';

                if (!layersMap[layerName]) {
                    layersMap[layerName] = { name: layerName, points: [], mode: mode, visible: true };
                }

                const coords = feature.geometry.coordinates;
                layersMap[layerName].points.push({
                    lng: coords[0],
                    lat: coords[1],
                    radius: props.radius !== undefined ? props.radius : 50,
                    alpha: props.alpha !== undefined ? props.alpha : 0.5,
                    blur: props.blur !== undefined ? props.blur : 1.0,
                    type: mode
                });
            }
        });

        const newLayers = [];
        let layerCounter = Math.max(0, ...this.layerManager.layers.map(l => l.id)) + 1;

        for (const key in layersMap) {
            const l = layersMap[key];
            newLayers.push({
                id: layerCounter++,
                name: l.name,
                points: l.points,
                visible: true,
                editing: false,
                mode: l.mode
            });
        }

        this.layerManager.setLayers(this.layerManager.layers.concat(newLayers));
        this.brushManager.clearCurrentPoints();
        this.brushManager.render();
        window.uiManager.showAlert(`成功导入 <span class="highlight">${newLayers.length}</span> 个图层`, 'success');
    }

    importLayersData(jsonData) {
        if (!Array.isArray(jsonData.layers) || jsonData.layers.length === 0) throw new Error('layers 数组为空');
        const newLayers = []; let layerCounter = Math.max(0, ...this.layerManager.layers.map(l => l.id)) + 1;
        jsonData.layers.forEach((layerData, index) => {
            const layerMode = layerData.mode || 'map';
            const newLayer = { id: layerCounter++, name: layerData.name || `导入图层 ${index + 1}`, points: [], visible: layerData.visible !== undefined ? layerData.visible : true, editing: false, mode: layerMode };
            if (Array.isArray(layerData.points)) {
                layerData.points.forEach(point => { if (point.lng && point.lat) { newLayer.points.push({ lng: point.lng, lat: point.lat, radius: point.radius !== undefined ? point.radius : this.brushManager.getBrushParams().radius, alpha: point.alpha !== undefined ? point.alpha : this.brushManager.getBrushParams().alpha, blur: point.blur !== undefined ? point.blur : 1.0, type: point.type || layerMode }); } });
            } newLayers.push(newLayer);
        });
        this.layerManager.setLayers(this.layerManager.layers.concat(newLayers));
        this.brushManager.clearCurrentPoints(); this.brushManager.render();
        window.uiManager.showAlert(`成功导入 <span class="highlight">${newLayers.length}</span> 个图层`, 'success');
    }

    importDataPoints(jsonData) {
        if (!Array.isArray(jsonData.dataPoints)) throw new Error('dataPoints 格式错误');
        const pointsMode = jsonData.dataPoints[0]?.type || 'map';
        const newLayer = { id: ++this.layerManager.layerCounter, name: `导入数据 ${new Date().toLocaleString()}`, points: [], visible: true, editing: false, mode: pointsMode };
        jsonData.dataPoints.forEach(item => { if (item.lng && item.lat) { newLayer.points.push({ lng: item.lng, lat: item.lat, radius: item.radius, alpha: item.alpha, blur: item.blur, type: item.type || pointsMode }); } });
        this.layerManager.layers.push(newLayer);
        if (pointsMode === this.brushManager.currentMode) this.layerManager.setCurrentLayer(newLayer.id);
        this.layerManager.saveLayers(); this.brushManager.render();
        window.uiManager.showAlert(`成功导入数据点`, 'success');
    }

    showMainExportMenu(e) { const exportMenu = document.getElementById('layerExportMenu'); const visibleLayers = this.layerManager.getVisibleLayers(); if (visibleLayers.length === 0) { window.uiManager.showAlert('当前模式下没有可见图层可导出。', 'warning'); return; } exportMenu.style.display = exportMenu.style.display === 'block' ? 'none' : 'block'; this.setupExportMenuEvents(visibleLayers); e.stopPropagation(); }
    showLayerExportMenu(layersToExport, buttonElement) { const exportMenu = document.getElementById('layerExportMenu'); exportMenu.style.display = 'block'; this.setupExportMenuEvents(layersToExport); }
    setupExportMenuEvents(layersToExport) { document.getElementById('useAgainBtn').style.display = 'block'; document.getElementById('exportLayerPngBtn').style.display = 'none'; document.getElementById('exportLayerJsonBtn').style.display = 'none'; document.getElementById('exportLayerPngBtn').onclick = () => { document.getElementById('layerExportMenu').style.display = 'none'; this.exportLayerPng(layersToExport); }; document.getElementById('exportLayerJsonBtn').onclick = () => { document.getElementById('layerExportMenu').style.display = 'none'; this.exportLayerJson(layersToExport); }; }

    // --- PNG 导出逻辑 ---
    exportLayerPng(layersToExport) {
        // 重置导出模态框状态
        document.getElementById('bgTransparent').checked = true;
        this.exportBgType = 'transparent';
        document.getElementById('dpi96').checked = true;
        this.selectedDPI = 96;

        // 初始状态显示 DPI 选项 (因为默认选中是透明)
        this.updateDpiOptionsVisibility();

        document.getElementById('pngModal').style.display = 'flex';

        const originalVisibility = {};
        const allLayers = this.layerManager.getLayers();

        // 设置导出按钮点击事件
        document.getElementById('downloadPngBtn').onclick = () => {
            // 临时设置图层可见性
            allLayers.forEach(layer => { originalVisibility[layer.id] = layer.visible; });
            allLayers.forEach(layer => { layer.visible = false; });
            layersToExport.forEach(layer => { layer.visible = true; });

            // 延时执行以允许UI刷新
            setTimeout(() => {
                this.handlePngDownloadLogic(layersToExport, originalVisibility);
            }, 50);
        };
    }

    handlePngDownloadLogic(layersToExport, originalVisibility) {
        const currentMode = this.brushManager.currentMode;

        // 1. 地图模式 + 包含底图 = 提示隐藏UI截图
        if (currentMode === 'map' && this.exportBgType === 'composite') {
            document.getElementById('pngModal').style.display = 'none';
            this.restoreLayers(originalVisibility);
            this.brushManager.render();

            // 调用新的截图提示方法
            window.uiManager.showScreenshotPrompt();
            return;
        }

        // 2. 画板模式 + 包含底图 = 原图合成
        if (currentMode === 'board' && this.exportBgType === 'composite') {
            if (!this.brushManager.boardManager.hasImage) {
                window.uiManager.showAlert('导出失败', '当前画板没有底图，无法导出合成图片。', 'error');
                this.restoreLayers(originalVisibility);
                return;
            }
            this.exportBoardComposite(layersToExport, originalVisibility, false);
            return;
        }

        // 3. 透明背景模式 (地图或画板) - 执行真正的高清重绘
        this.downloadTransparentPng(layersToExport, originalVisibility);
    }

    restoreLayers(originalVisibility) {
        const allLayers = this.layerManager.getLayers();
        allLayers.forEach(layer => { layer.visible = originalVisibility[layer.id]; });
    }

    downloadTransparentPng(layersToExport, originalVisibility) {
        const scaleFactor = this.selectedDPI / 96; // 96dpi = 1x, 300dpi = 3.125x
        if (this.brushManager.currentMode === 'board' && this.brushManager.boardManager.hasImage) {
            this.exportBoardComposite(layersToExport, originalVisibility, true);
        } else {
            this.renderHighResHeatmap(layersToExport, scaleFactor, originalVisibility);
        }
    }

    // 核心算法：高清重绘 (Map Mode)
    renderHighResHeatmap(layersToExport, scale, originalVisibility) {
        const container = this.brushManager.manager.getContainer();
        const rect = container.getBoundingClientRect();

        // 1. 创建高清画布
        const width = rect.width * scale;
        const height = rect.height * scale;

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = width;
        exportCanvas.height = height;

        // 2. 准备离屏画布用于绘制黑白 Alpha 通道
        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const offctx = offscreen.getContext('2d');

        // 3. 收集所有点
        let allPoints = [];
        layersToExport.forEach(layer => {
            if (layer.visible) allPoints = allPoints.concat(layer.points);
        });

        // 4. 重绘
        const currentZoom = this.mapManager.getZoom();

        for (const p of allPoints) {
            if (this.brushManager.currentMode === 'map' && p.type && p.type !== 'map') continue;

            // 计算屏幕坐标 -> 映射到高清画布
            let screenPt;
            if (this.brushManager.currentMode === 'map') {
                screenPt = this.mapManager.lngLatToContainer([p.lng, p.lat]);
            } else {
                screenPt = this.brushManager.manager.lngLatToContainer({ lng: p.lng, lat: p.lat });
            }

            const targetX = screenPt.x * scale;
            const targetY = screenPt.y * scale;

            // 范围检查
            const margin = 200 * scale;
            if (targetX < -margin || targetY < -margin || targetX > width + margin || targetY > height + margin) continue;

            // 计算半径 (地图模式基于米，画板模式基于相对尺寸)
            let pixelRadius;
            if (this.brushManager.currentMode === 'map') {
                const screenRadius = this.brushManager.metersToPixels(p.radius, p.lat, currentZoom);
                pixelRadius = screenRadius * scale;
            } else {
                pixelRadius = p.radius * this.brushManager.boardManager.transform.scale * scale;
            }

            const texture = this.brushManager.getTextureForBlur(p.blur !== undefined ? p.blur : 1.0);

            offctx.globalAlpha = Math.abs(p.alpha);
            offctx.globalCompositeOperation = (p.isErase || p.alpha < 0) ? 'destination-out' : 'source-over';
            offctx.drawImage(texture, targetX - pixelRadius, targetY - pixelRadius, pixelRadius * 2, pixelRadius * 2);
        }

        // 5. 着色
        const ctx = exportCanvas.getContext('2d');
        const imgData = offctx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        this.brushManager.initPalette();
        const palette = this.brushManager.palette;
        const MAX = 204;

        for (let i = 0; i < pixels.length; i += 4) {
            const a = pixels[i + 3];
            if (a > 0) {
                const idx = Math.min(255, a) * 4;
                pixels[i] = palette[idx];
                pixels[i + 1] = palette[idx + 1];
                pixels[i + 2] = palette[idx + 2];
                pixels[i + 3] = Math.min(MAX, a);
            }
        }

        ctx.putImageData(imgData, 0, 0);

        this.triggerDownload(exportCanvas.toDataURL('image/png'), `heatmap_map_${this.selectedDPI}dpi.png`);
        this.cleanupExport(originalVisibility);
    }

    // 核心算法：画板合成 (Board Mode)
    exportBoardComposite(layersToExport, originalVisibility, transparentOnly = false) {
        const img = this.brushManager.boardManager.image;
        const width = img.naturalWidth;
        const height = img.naturalHeight;

        let targetWidth = width;
        let targetHeight = height;
        let scale = 1.0;

        // 如果是透明导出且选了高清，则放大画布
        if (transparentOnly && this.selectedDPI === 300) {
            scale = 300 / 96;
            targetWidth = width * scale;
            targetHeight = height * scale;
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        // 绘制底图 (仅在合成模式下)
        if (!transparentOnly) {
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        }

        const offscreen = document.createElement('canvas');
        offscreen.width = targetWidth;
        offscreen.height = targetHeight;
        const offctx = offscreen.getContext('2d');

        let allPoints = [];
        layersToExport.forEach(layer => {
            if (layer.visible) allPoints = allPoints.concat(layer.points);
        });

        for (const p of allPoints) {
            if (p.type && p.type !== 'board') continue;

            // 坐标映射
            const targetX = p.lng * scale;
            const targetY = p.lat * scale;
            const radius = p.radius * scale;

            const texture = this.brushManager.getTextureForBlur(p.blur !== undefined ? p.blur : 1.0);

            offctx.globalAlpha = Math.abs(p.alpha);
            offctx.globalCompositeOperation = (p.isErase || p.alpha < 0) ? 'destination-out' : 'source-over';
            offctx.drawImage(texture, targetX - radius, targetY - radius, radius * 2, radius * 2);
        }

        // 着色
        const imgData = offctx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imgData.data;
        this.brushManager.initPalette();
        const palette = this.brushManager.palette;
        const MAX = 204;

        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a > 0) {
                const idx = Math.min(255, a) * 4;
                data[i] = palette[idx];
                data[i + 1] = palette[idx + 1];
                data[i + 2] = palette[idx + 2];
                data[i + 3] = Math.min(MAX, a);
            }
        }
        offctx.putImageData(imgData, 0, 0);

        // 合并
        ctx.drawImage(offscreen, 0, 0);

        const filename = transparentOnly
            ? `heatmap_board_transparent_${scale > 1 ? '300dpi' : 'original'}.png`
            : 'heatmap_board_composite.png';

        this.triggerDownload(canvas.toDataURL('image/png'), filename);
        this.cleanupExport(originalVisibility);
    }

    triggerDownload(dataURL, filename) {
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = filename || `heatmap_export_${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    cleanupExport(originalVisibility) {
        document.getElementById('pngModal').style.display = 'none';
        this.restoreLayers(originalVisibility);
        this.brushManager.render();
    }

    exportLayerJson(layersToExport) {
        // 导出为 GeoJSON FeatureCollection
        const features = [];
        layersToExport.forEach(layer => {
            layer.points.forEach(p => {
                features.push({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [p.lng, p.lat]
                    },
                    properties: {
                        radius: p.radius,
                        alpha: p.alpha,
                        blur: p.blur,
                        type: p.type, // 兼容旧版
                        mode: p.type || layer.mode,
                        layerName: layer.name,
                        layerId: layer.id
                    }
                });
            });
        });

        const geoJSON = {
            type: "FeatureCollection",
            exportDate: new Date().toISOString(),
            features: features
        };

        const jsonString = JSON.stringify(geoJSON, null, 2);
        document.getElementById('jsonPreview').textContent = jsonString;
        document.getElementById('jsonModal').style.display = 'flex';
        document.getElementById('downloadJsonBtn').onclick = () => { this.downloadJson(jsonString); };
    }

    downloadJson(jsonString) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `heatmap_data_${new Date().toISOString().slice(0, 10)}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        document.getElementById('jsonModal').style.display = 'none';
    }

    copyJsonToClipboard() { const jsonText = document.getElementById('jsonPreview').textContent; navigator.clipboard.writeText(jsonText).then(() => { window.uiManager.showNotification('JSON数据已复制到剪贴板！', 'success'); }).catch(err => window.uiManager.showNotification('复制失败', 'error')); }
    handleModalOutsideClick(event) { const m = [document.getElementById('jsonModal'), document.getElementById('pngModal'), document.getElementById('layerExportMenu')]; if (m.includes(event.target)) event.target.style.display = 'none'; }
}

// --- UI交互管理模块 ---
class UIManager {
    constructor() {
        this.toolbarMinimized = false; this.helpMode = false; this.helpLabels = [];
        this.isUIHidden = false; // 新增：UI隐藏状态标记
        this.globalModal = document.getElementById('globalModal'); this.globalTitle = document.getElementById('globalModalTitle'); this.globalBody = document.getElementById('globalModalBody'); this.globalBtns = document.getElementById('globalModalButtons'); this.closeGlobalBtn = document.getElementById('closeGlobalModal');
        this.initEventListeners(); this.checkFirstVisit();
    }

    checkFirstVisit() { const v = localStorage.getItem('hasVisitedHeatmapApp'); if (!v) { setTimeout(() => { this.showHelpModal(); localStorage.setItem('hasVisitedHeatmapApp', 'true'); }, 1000); } }

    initEventListeners() {
        document.getElementById('minimizeToolbarBtn').addEventListener('click', () => this.toggleToolbarMinimize());
        document.getElementById('toolbarMinimizeIcon').addEventListener('click', () => this.expandToolbar());
        document.getElementById('styleToggleBtn').onclick = (e) => { if (e.ctrlKey || e.metaKey) { if (window.mapManager) window.mapManager.toggleStyle(); } else { this.showStyleModal(); } };

        // 【新增】清屏按钮事件
        document.getElementById('cleanUIBtn').onclick = () => this.hideAllUI();

        document.getElementById('closeStyleModal').onclick = () => this.hideStyleModal();
        document.getElementById('drawToggleBtn').onclick = () => { if (window.brushManager) { window.brushManager.toggleDrawMode(); if (window.layerManager) window.layerManager.updateDrawButtonState(); } };
        document.getElementById('helpBtn').onclick = () => { this.helpMode ? (this.exitHelpMode(), this.hideHelpModal()) : this.showHelpModal(); };
        document.getElementById('closeHelpModal').onclick = () => { this.exitHelpMode(); this.hideHelpModal(); };
        document.addEventListener('keydown', (e) => this.handleKeyboardEvents(e));
        window.addEventListener('click', (event) => { if (event.target === document.getElementById('helpModal')) { this.exitHelpMode(); this.hideHelpModal(); } if (event.target === document.getElementById('styleModal')) { this.hideStyleModal(); } });
        this.closeGlobalBtn.onclick = () => { this.globalModal.style.display = 'none'; };
    }

    // 新增：截图提示专用方法
    showScreenshotPrompt() {
        return new Promise((resolve) => {
            this.setupModal('info', '截图提示');
            this.globalBody.innerHTML = `
                <div style="text-align: left; padding: 0 10px;">
                    <p>由于地图服务限制，网页无法直接导出带有在线地图的合成图片。</p>
                    <p><strong>解决方案：</strong></p>
                    <ol>
                        <li>点击下方 <span class="highlight">"隐藏网页菜单"</span> 按钮。</li>
                        <li>网页上的所有按钮和菜单将消失，只保留地图和热力图。</li>
                        <li>使用电脑截图工具（如 QQ截图、Snipaste）截取屏幕。</li>
                        <li>截图完成后，按 <span class="highlight">ESC 键</span> 恢复菜单显示。</li>
                    </ol>
                </div>
            `;
            this.globalBtns.innerHTML = '';

            const hideBtn = document.createElement('button');
            hideBtn.className = 'primary';
            hideBtn.innerHTML = '<i class="fas fa-eye-slash"></i> 隐藏网页菜单';

            const close = () => { this.globalModal.style.display = 'none'; resolve(); };

            hideBtn.onclick = () => {
                close();
                this.hideAllUI();
            };

            this.closeGlobalBtn.onclick = close;
            this.globalBtns.appendChild(hideBtn);
            this.globalModal.style.display = 'flex';
        });
    }

    // 新增：隐藏所有UI元素
    hideAllUI() {
        if (this.isUIHidden) return;
        this.isUIHidden = true;

        // 收集需要隐藏的元素选择器
        const selectors = [
            '.site-header',
            '.history-controls-floating',
            '.zoom-controls',
            '#toolbar',
            '#toolbarMinimizeIcon',
            '#layerToolbar',
            '#layerMinimizeIcon',
            '.bottom-toolbar',
            '.top-center-notification',
            '.more-tools-btn'
        ];

        document.body.classList.add('ui-hidden-mode');

        selectors.forEach(sel => {
            const els = document.querySelectorAll(sel);
            els.forEach(el => {
                if (el) {
                    el.dataset.originalDisplay = el.style.display;
                    el.style.display = 'none';
                }
            });
        });

        this.showNotification('按 ESC 键恢复界面', 'info');
    }

    // 新增：恢复所有UI元素
    restoreAllUI() {
        if (!this.isUIHidden) return;
        this.isUIHidden = false;

        document.body.classList.remove('ui-hidden-mode');

        const selectors = [
            '.site-header',
            '.history-controls-floating',
            '.zoom-controls',
            '#toolbar',
            '#toolbarMinimizeIcon',
            '#layerToolbar',
            '#layerMinimizeIcon',
            '.bottom-toolbar',
            '.more-tools-btn'
        ];

        selectors.forEach(sel => {
            const els = document.querySelectorAll(sel);
            els.forEach(el => {
                if (el) {
                    el.style.display = '';
                    if (sel === '#toolbar' && this.toolbarMinimized) {
                        el.classList.add('minimized');
                    }
                }
            });
        });

        // 恢复工具栏显隐状态
        if (this.toolbarMinimized) {
            document.getElementById('toolbar').classList.add('minimized');
            document.getElementById('toolbarMinimizeIcon').style.display = 'flex';
        } else {
            document.getElementById('toolbar').classList.remove('minimized');
            document.getElementById('toolbarMinimizeIcon').style.display = 'none';
        }

        const layerToolbar = document.getElementById('layerToolbar');
        const layerIcon = document.getElementById('layerMinimizeIcon');
        if (layerToolbar.classList.contains('minimized')) {
            layerIcon.style.display = 'flex';
        } else {
            layerIcon.style.display = 'none';
        }
    }

    showAlert(message, detail = '', type = 'info') {
        return new Promise((resolve) => {
            this.setupModal(type, '提示');
            this.globalBody.innerHTML = `<h4 style="margin:0 0 10px 0;">${message}</h4><div style="font-size:13px;color:#666;">${detail}</div>`;
            this.globalBtns.innerHTML = '';
            const okBtn = document.createElement('button'); okBtn.className = 'primary'; okBtn.innerText = '知道了';
            const close = () => { this.globalModal.style.display = 'none'; resolve(); };
            okBtn.onclick = close; this.closeGlobalBtn.onclick = close;
            this.globalBtns.appendChild(okBtn); this.globalModal.style.display = 'flex';
        });
    }

    showConfirm(title, message, type = 'warning') {
        return new Promise((resolve) => {
            this.setupModal(type, title); this.globalBody.innerHTML = message; this.globalBtns.innerHTML = '';
            const cancelBtn = document.createElement('button'); cancelBtn.className = 'secondary'; cancelBtn.innerText = '取消';
            const okBtn = document.createElement('button'); okBtn.className = type === 'danger' ? 'danger' : 'primary'; okBtn.innerText = '确定';
            const closeAndResolve = (res) => { this.globalModal.style.display = 'none'; this.globalModal.onclick = null; resolve(res); };
            cancelBtn.onclick = () => closeAndResolve(false); okBtn.onclick = () => closeAndResolve(true); this.closeGlobalBtn.onclick = () => closeAndResolve(false);
            this.globalModal.onclick = (e) => { if (e.target === this.globalModal) closeAndResolve(false); };
            this.globalBtns.appendChild(cancelBtn); this.globalBtns.appendChild(okBtn); this.globalModal.style.display = 'flex';
        });
    }

    setupModal(type, titleText) {
        let icon = 'fa-info-circle';
        switch (type) { case 'success': icon = 'fa-check-circle'; break; case 'warning': icon = 'fa-exclamation-triangle'; break; case 'error': case 'danger': icon = 'fa-times-circle'; break; }
        this.globalTitle.innerHTML = `<i class="fas ${icon}"></i> ${titleText}`;
    }

    showStyleModal() { const m = document.getElementById('styleModal'); if (m) { this.renderStyleGrid(); m.style.display = 'flex'; } }
    hideStyleModal() { const m = document.getElementById('styleModal'); if (m) m.style.display = 'none'; }
    renderStyleGrid() {
        const grid = document.getElementById('styleGrid'); if (!grid || !window.mapManager) return; grid.innerHTML = '';
        const styles = window.mapManager.getStyles(); const curr = window.mapManager.getCurrentStyleIndex();
        styles.forEach((style, index) => {
            const item = document.createElement('div'); item.className = `style-item ${index === curr ? 'active' : ''}`;
            item.onclick = () => { window.mapManager.setStyleByIndex(index); this.renderStyleGrid(); };
            const preview = document.createElement('div'); preview.className = 'style-preview'; preview.style.background = style.color || '#eee';
            const name = document.createElement('div'); name.className = 'style-name'; name.textContent = style.name;
            item.appendChild(preview); item.appendChild(name); grid.appendChild(item);
        });
    }
    showHelpModal() { document.getElementById('helpModal').style.display = 'flex'; this.enterHelpMode(); }
    hideHelpModal() { document.getElementById('helpModal').style.display = 'none'; this.exitHelpMode(); }
    enterHelpMode() { this.helpMode = true; this.showHelpLabels(); document.body.classList.add('help-mode-active'); const b = document.getElementById('helpBtn'); b.classList.add('active'); b.innerHTML = '<i class="fas fa-times"></i>'; b.title = '退出帮助模式'; }
    exitHelpMode() { this.helpMode = false; this.hideHelpLabels(); document.body.classList.remove('help-mode-active'); const b = document.getElementById('helpBtn'); b.classList.remove('active'); b.innerHTML = '<i class="fas fa-question-circle"></i>'; b.title = '帮助'; }
    showHelpLabels() {
        const conf = [{ s: '#zoomInBtn', t: '放大', p: 'right' }, { s: '#zoomOutBtn', t: '缩小', p: 'right' }, { s: '#styleToggleBtn', t: '风格 (Ctrl+Click)', p: 'right' }, { s: '#cleanUIBtn', t: '清屏 (ESC退出)', p: 'right' }, { s: '#radiusRange', t: '半径 (Ctrl+Scroll)', p: 'left' }, { s: '#alphaRange', t: '强度 (Shift+Scroll)', p: 'left' }, { s: '#blurRange', t: '模糊 (Alt+Scroll)', p: 'left' }, { s: '#addLayerBtn', t: '新建图层', p: 'left' }, { s: '#undoBtn', t: '撤销', p: 'left' }, { s: '#exportLayerBtn', t: '导出', p: 'top' }, { s: '#drawToggleBtn', t: '空格键开关', p: 'top' }, { s: '#pointsCount', t: '热力点数', p: 'top' }, { s: '#redoBtn', t: '恢复', p: 'right' }, { s: '#modeToggleBtn', t: '切换地图/画板模式', p: 'top' }];
        conf.forEach(c => {
            const els = document.querySelectorAll(c.s);
            els.forEach(el => {
                if (!el.offsetParent) return;
                const l = document.createElement('div'); l.className = 'help-tooltip'; l.textContent = c.t; l.setAttribute('data-position', c.p);
                const r = el.getBoundingClientRect();
                let x, y;
                if (c.p === 'right') { x = r.right; y = r.top + r.height / 2; } else if (c.p === 'left') { x = r.left; y = r.top + r.height / 2; } else if (c.p === 'top') { x = r.left + r.width / 2; y = r.top; } else { x = r.left + r.width / 2; y = r.bottom; }
                l.style.left = x + 'px'; l.style.top = y + 'px'; document.body.appendChild(l); this.helpLabels.push(l);
            });
        });
    }
    hideHelpLabels() { this.helpLabels.forEach(l => { if (l.parentNode) l.parentNode.removeChild(l); }); this.helpLabels = []; }

    handleKeyboardEvents(e) {
        if (e.key === 'Escape') {
            // 优先检查 UI 是否被隐藏
            if (this.isUIHidden) {
                this.restoreAllUI();
                e.preventDefault();
                return;
            }

            if (window.brushManager && window.brushManager.drawMode) {
                window.brushManager.exitDrawMode(); e.preventDefault();
            } else if (this.helpMode) {
                this.exitHelpMode(); this.hideHelpModal(); e.preventDefault();
            } else {
                this.hideStyleModal();
            }
        }
    }
    toggleToolbarMinimize() { document.getElementById('toolbar').classList.toggle('minimized'); this.toolbarMinimized = !this.toolbarMinimized; }
    expandToolbar() { document.getElementById('toolbar').classList.remove('minimized'); this.toolbarMinimized = false; }
    showNotification(msg, type = 'info') { const n = document.createElement('div'); n.style.cssText = `position:fixed;top:20px;right:20px;background:${type === 'error' ? 'var(--danger)' : 'var(--primary)'};color:white;padding:12px 20px;border-radius:var(--border-radius);box-shadow:var(--shadow);z-index:2001;transition:all 0.3s ease;transform:translateX(100%);font-size:14px;`; n.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check' : 'fa-info-circle'}"></i> ${msg}`; document.body.appendChild(n); setTimeout(() => n.style.transform = 'translateX(0)', 10); setTimeout(() => { n.style.transform = 'translateX(100%)'; setTimeout(() => n.remove(), 300); }, 3000); }
}

// --- 主应用程序 ---
class HeatmapApp {
    constructor() { this.storageManager = new StorageManager(); this.init(); }
    async init() {
        await this.storageManager.init(); window.storageManager = this.storageManager;
        this.mapManager = window.mapManager; this.mapManager.init();
        this.boardManager = new BoardManager();
        this.brushManager = new BrushManager(this.mapManager, this.boardManager);
        this.layerManager = new LayerManager();
        window.brushManager = this.brushManager; window.layerManager = this.layerManager;
        this.historyManager = new HistoryManager(this.layerManager, this.brushManager); window.historyManager = this.historyManager;
        this.importExportManager = new ImportExportManager(this.mapManager, this.brushManager, this.layerManager); window.importExportManager = this.importExportManager;
        this.uiManager = new UIManager(); window.uiManager = this.uiManager;
        this.brushManager.resizeCanvas(); window.addEventListener('resize', () => this.brushManager.resizeCanvas());
        this.initModeToggle();
        document.getElementById('zoomInBtn').onclick = () => this.mapManager.zoomIn();
        document.getElementById('zoomOutBtn').onclick = () => this.mapManager.zoomOut();

        await this.loadData();
        this.layerManager.initDefault();
        this.brushManager.render(); this.brushManager.updateValueDisplays();
        console.log('热力图应用初始化完成 (天地图版)');
    }

    async loadData() {
        const layers = await this.storageManager.load('layers');
        if (layers && Array.isArray(layers)) {
            layers.forEach(layer => { if (!layer.mode) { const firstPoint = layer.points[0]; layer.mode = firstPoint ? (firstPoint.type || 'map') : 'map'; } });
            this.layerManager.layers = layers;
        }
        const boardState = await this.storageManager.load('boardState'); if (boardState) this.boardManager.restoreState(boardState);
        const settings = await this.storageManager.load('settings');
        if (settings) {
            this.brushManager.restoreSettings(settings);
            if (settings.mode === 'board') { const btn = document.getElementById('modeToggleBtn'); if (!btn.textContent.includes('地图')) btn.click(); }
        }
        const mapState = await this.storageManager.load('mapState'); if (mapState) this.mapManager.restoreState(mapState);
    }

    initModeToggle() {
        const toggleBtn = document.getElementById('modeToggleBtn'); const uploadBtn = document.getElementById('uploadImgBtn');
        const boardContainer = document.getElementById('boardContainer'); const styleBtn = document.getElementById('styleToggleBtn');
        const zoomInBtn = document.getElementById('zoomInBtn'); const zoomOutBtn = document.getElementById('zoomOutBtn');
        // 清屏按钮在画板模式下可能需要特殊处理，暂时保留
        const cleanUIBtn = document.getElementById('cleanUIBtn');

        toggleBtn.addEventListener('click', () => {
            const isToBoard = toggleBtn.textContent.includes('画板');
            if (isToBoard) {
                toggleBtn.innerHTML = '<i class="fas fa-map"></i> 地图模式'; toggleBtn.classList.remove('primary'); toggleBtn.classList.add('warning');
                uploadBtn.style.display = 'block'; styleBtn.style.display = 'none';
                boardContainer.classList.remove('hidden'); boardContainer.classList.add('active');
                this.brushManager.setMode('board');
                zoomInBtn.onclick = () => this.boardManager.zoomIn(); zoomOutBtn.onclick = () => this.boardManager.zoomOut();
            } else {
                toggleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> 画板模式'; toggleBtn.classList.remove('warning'); toggleBtn.classList.add('primary');
                uploadBtn.style.display = 'none'; styleBtn.style.display = 'flex';
                boardContainer.classList.add('hidden'); boardContainer.classList.remove('active');
                this.brushManager.setMode('map');
                zoomInBtn.onclick = () => this.mapManager.zoomIn(); zoomOutBtn.onclick = () => this.mapManager.zoomOut();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => { new HeatmapApp(); });