// ==UserScript==
// @name         [Weverse] Media Enhancements
// @namespace    https://github.com/myouisaur/weverse.io
// @icon         https://www.weverse.io/favicon.ico
// @version      3.0
// @description  Prevents media from exceeding the viewport and uncrops multi-image posts into proportional grids with smooth transitions.
// @author       Xiv
// @match        *://*.weverse.io/*
// @run-at       document-start
// @noframes
// @updateURL    https://myouisaur.github.io/Weverse/media-enhancements.user.js
// @downloadURL  https://myouisaur.github.io/Weverse/media-enhancements.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Guard against duplicate execution
    if (window.xivAlreadyRunning) return;
    window.xivAlreadyRunning = true;

    // ==========================================
    // CONFIGURATION
    // ==========================================
    const CONFIG = {
        // Dimensions & Layout
        DIMENSIONS: {
            FALLBACK_HEADER_HEIGHT_PX: 64,
            VIEWPORT_BUFFER_PX: 48, // Generous breathing room
            VIDEO_ASPECT_RATIO: '16 / 9',
            GRID_GAP_PX: 4,
            FLEX_MULTIPLIER: 10000
        },
        // Selectors
        SELECTORS: {
            // Global UI Elements
            HEADER: 'div[class*="global-_-header"]',
            BOTTOM_BAR: 'div[class*="action_bar"]',

            // Post Module Elements (Feed View)
            POST_WRAPPER: 'div[class*="post-module-_-wrapper"]',
            POST_HEADER: 'div[class*="post-module-_-header"]',
            POST_CONTENT: 'div[class*="post-module-_-content"]',
            POST_FOOTER: 'div[class*="post-module-_-footer"]',

            // Core Media Containers
            POST_SINGLE_IMAGE_WRAP: 'div[class*="post-module-_-image_wrap"]:not([class*="grid"])',
            POST_GRID_WRAP: 'div[class*="post-module-_-image_wrap_grid"]',
            GRID_UL: 'ul[class*="image-grid-_-image_wrap"]',
            POST_THUMB_WRAP: 'span[class*="thumbnail-_-image_wrapper"]',
            DETAIL_IMAGE_LINK: 'div[class*="media-image-simple-list-_-link"]',
            WIDGET_MEDIA: 'div[data-media-attachment]',
            VIDEO_PLAYER: 'div[class*="player"]'
        },
        // CSS Identifiers & Namespaces
        STYLE: {
            ELEMENT_ID: 'xiv-weverse-media-enhancements-style',
            VAR_HEADER: '--xiv-header-offset',
            VAR_BOTTOM: '--xiv-bottom-offset',
            VAR_BUFFER: '--xiv-viewport-buffer',
            VAR_MAX_HEIGHT: '--xiv-max-media-height',
            VAR_LOCAL_UI: '--xiv-post-ui-height',
            VAR_GRID_ASPECT: '--xiv-grid-aspect'
        },
        // Uncrop Grid Classes
        CLASSES: {
            PROCESSED: 'xiv-processed',
            PROCESSING: 'xiv-processing',
            HIDDEN_ORIGINAL: 'xiv-hidden-original',
            MATH_GRID: 'xiv-math-grid',
            COL: 'xiv-math-col',
            ROW: 'xiv-math-row',
            ITEM: 'xiv-math-item',
            IMG: 'xiv-custom-img'
        }
    };

    // Global Cache for aspect ratios to avoid redundant image loading
    const aspectCache = new Map();

    // ==========================================
    // MODULE: Math & Uncrop Engine
    // ==========================================
    const UncropEngine = {
        /**
         * Resolves the true intrinsic aspect ratio of an image.
         */
        getAspect(img) {
            return new Promise(resolve => {
                const src = img.src;
                if (aspectCache.has(src)) {
                    resolve(aspectCache.get(src));
                    return;
                }

                if (img.complete && img.naturalWidth > 0) {
                    const aspect = img.naturalWidth / img.naturalHeight;
                    aspectCache.set(src, aspect);
                    resolve(aspect);
                } else {
                    const tempImg = new Image();
                    tempImg.onload = () => {
                        const aspect = tempImg.naturalWidth / tempImg.naturalHeight;
                        aspectCache.set(src, aspect);
                        resolve(aspect);
                    };
                    tempImg.onerror = () => {
                        aspectCache.set(src, 1); // Fallback to square on error
                        resolve(1);
                    };
                    tempImg.src = src;
                }
            });
        },

        /**
         * Creates a flex-item container for the custom grid.
         */
        createGridItem(nativeImg, flexVal) {
            const wrapper = document.createElement('div');
            wrapper.className = CONFIG.CLASSES.ITEM;
            wrapper.style.flex = `${flexVal * CONFIG.DIMENSIONS.FLEX_MULTIPLIER} 1 0%`;

            const img = document.createElement('img');
            img.src = nativeImg.src;
            img.className = CONFIG.CLASSES.IMG;
            img.loading = 'lazy';

            wrapper.appendChild(img);

            // Pass clicks through to the original image to trigger native lightboxes
            wrapper.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                nativeImg.click();
            });

            return wrapper;
        },

        /**
         * Calculates layout proportions and builds the custom flexbox grid.
         */
        async processGrid(gridWrapper) {
            const ul = gridWrapper.querySelector(CONFIG.SELECTORS.GRID_UL);
            if (!ul) return;

            const nativeImages = Array.from(ul.querySelectorAll('img'));
            if (nativeImages.length === 0 || nativeImages.length > 4) return;

            // Applies the shimmer animation via CSS
            gridWrapper.classList.add(CONFIG.CLASSES.PROCESSING);

            try {
                const aspects = await Promise.all(nativeImages.map(img => this.getAspect(img)));
                const count = aspects.length;
                let finalAspect = 1;

                const customGrid = document.createElement('div');
                customGrid.className = CONFIG.CLASSES.MATH_GRID;

                if (count === 1) {
                    finalAspect = aspects[0];
                    customGrid.style.flexDirection = 'row';
                    customGrid.appendChild(this.createGridItem(nativeImages[0], 1));
                }
                else if (count === 2) {
                    finalAspect = aspects[0] + aspects[1];
                    customGrid.style.flexDirection = 'row';
                    customGrid.appendChild(this.createGridItem(nativeImages[0], aspects[0]));
                    customGrid.appendChild(this.createGridItem(nativeImages[1], aspects[1]));
                }
                else if (count === 3) {
                    const rSum = (1 / aspects[1]) + (1 / aspects[2]);
                    finalAspect = aspects[0] + (1 / rSum);
                    customGrid.style.flexDirection = 'row';
                    customGrid.appendChild(this.createGridItem(nativeImages[0], aspects[0] * rSum));

                    const rightCol = document.createElement('div');
                    rightCol.className = CONFIG.CLASSES.COL;
                    rightCol.style.flex = `${CONFIG.DIMENSIONS.FLEX_MULTIPLIER} 1 0%`;
                    rightCol.appendChild(this.createGridItem(nativeImages[1], 1 / aspects[1]));
                    rightCol.appendChild(this.createGridItem(nativeImages[2], 1 / aspects[2]));
                    customGrid.appendChild(rightCol);
                }
                else if (count === 4) {
                    const r1 = aspects[0] + aspects[1];
                    const r2 = aspects[2] + aspects[3];
                    finalAspect = 1 / ((1 / r1) + (1 / r2));
                    customGrid.style.flexDirection = 'column';

                    const row1 = document.createElement('div');
                    row1.className = CONFIG.CLASSES.ROW;
                    row1.style.flex = `${(1 / r1) * CONFIG.DIMENSIONS.FLEX_MULTIPLIER} 1 0%`;
                    row1.appendChild(this.createGridItem(nativeImages[0], aspects[0]));
                    row1.appendChild(this.createGridItem(nativeImages[1], aspects[1]));

                    const row2 = document.createElement('div');
                    row2.className = CONFIG.CLASSES.ROW;
                    row2.style.flex = `${(1 / r2) * CONFIG.DIMENSIONS.FLEX_MULTIPLIER} 1 0%`;
                    row2.appendChild(this.createGridItem(nativeImages[2], aspects[2]));
                    row2.appendChild(this.createGridItem(nativeImages[3], aspects[3]));

                    customGrid.appendChild(row1);
                    customGrid.appendChild(row2);
                }

                // Apply dynamic calculations
                customGrid.style.setProperty(CONFIG.STYLE.VAR_GRID_ASPECT, finalAspect);

                // Swap native for custom (triggers CSS entrance animations)
                ul.classList.add(CONFIG.CLASSES.HIDDEN_ORIGINAL);
                gridWrapper.appendChild(customGrid);
                gridWrapper.classList.add(CONFIG.CLASSES.PROCESSED);

            } catch (error) {
                console.warn('[Weverse Media Enhancements] Uncrop processing failed:', error);
            } finally {
                // Removes shimmer
                gridWrapper.classList.remove(CONFIG.CLASSES.PROCESSING);
            }
        },

        scan(scopeNode = document) {
            const grids = scopeNode.querySelectorAll(`${CONFIG.SELECTORS.POST_GRID_WRAP}:not(.${CONFIG.CLASSES.PROCESSED}):not(.${CONFIG.CLASSES.PROCESSING})`);
            grids.forEach(grid => this.processGrid(grid));
        }
    };

    // ==========================================
    // MODULE: Layout Tracker (Dynamic UI Offsets)
    // ==========================================
    const LayoutTracker = {
        resizeObserver: null,
        mutationObserver: null,
        trackedElements: new WeakSet(),

        updateGlobalOffset(element, variableName, fallback = '0px') {
            if (element && document.documentElement.contains(element)) {
                document.documentElement.style.setProperty(variableName, `${element.offsetHeight}px`);
            } else {
                document.documentElement.style.setProperty(variableName, fallback);
            }
        },

        updateLocalPostOffset(postWrapper) {
            const header = postWrapper.querySelector(CONFIG.SELECTORS.POST_HEADER);
            const content = postWrapper.querySelector(CONFIG.SELECTORS.POST_CONTENT);
            const footer = postWrapper.querySelector(CONFIG.SELECTORS.POST_FOOTER);

            let totalUiHeight = 0;
            if (header) totalUiHeight += header.offsetHeight;
            if (content) totalUiHeight += content.offsetHeight;
            if (footer) totalUiHeight += footer.offsetHeight;

            postWrapper.style.setProperty(CONFIG.STYLE.VAR_LOCAL_UI, `${totalUiHeight}px`);
        },

        scanAndTrack() {
            const header = document.querySelector(CONFIG.SELECTORS.HEADER);
            const bottomBar = document.querySelector(CONFIG.SELECTORS.BOTTOM_BAR);
            const posts = document.querySelectorAll(CONFIG.SELECTORS.POST_WRAPPER);

            this.updateGlobalOffset(header, CONFIG.STYLE.VAR_HEADER, `${CONFIG.DIMENSIONS.FALLBACK_HEADER_HEIGHT_PX}px`);
            this.updateGlobalOffset(bottomBar, CONFIG.STYLE.VAR_BOTTOM, '0px');

            if (this.resizeObserver) {
                if (header && !this.trackedElements.has(header)) {
                    this.resizeObserver.observe(header);
                    this.trackedElements.add(header);
                }
                if (bottomBar && !this.trackedElements.has(bottomBar)) {
                    this.resizeObserver.observe(bottomBar);
                    this.trackedElements.add(bottomBar);
                }
                posts.forEach(post => {
                    if (!this.trackedElements.has(post)) {
                        this.resizeObserver.observe(post);
                        this.trackedElements.add(post);
                    }
                });
            }

            // Trigger uncrop scan on new DOM nodes
            UncropEngine.scan(document.documentElement);
        },

        init() {
            document.documentElement.style.setProperty(CONFIG.STYLE.VAR_BUFFER, `${CONFIG.DIMENSIONS.VIEWPORT_BUFFER_PX}px`);

            if (typeof ResizeObserver !== 'undefined') {
                this.resizeObserver = new ResizeObserver((entries) => {
                    window.requestAnimationFrame(() => {
                        for (const entry of entries) {
                            if (entry.target.matches(CONFIG.SELECTORS.HEADER)) {
                                this.updateGlobalOffset(entry.target, CONFIG.STYLE.VAR_HEADER);
                            } else if (entry.target.matches(CONFIG.SELECTORS.BOTTOM_BAR)) {
                                this.updateGlobalOffset(entry.target, CONFIG.STYLE.VAR_BOTTOM);
                            } else if (entry.target.matches(CONFIG.SELECTORS.POST_WRAPPER)) {
                                this.updateLocalPostOffset(entry.target);
                            }
                        }
                    });
                });
            }

            this.mutationObserver = new MutationObserver(() => {
                if (this._scanTimeout) clearTimeout(this._scanTimeout);
                this._scanTimeout = setTimeout(() => this.scanAndTrack(), 200);
            });

            // Target document.documentElement because body does not exist at document-start
            this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
            this.scanAndTrack();
        }
    };

    // ==========================================
    // MODULE: UI / Style Injection
    // ==========================================
    const StyleInjector = {
        generateCSS() {
            const { POST_SINGLE_IMAGE_WRAP, POST_GRID_WRAP, POST_THUMB_WRAP, DETAIL_IMAGE_LINK, WIDGET_MEDIA, VIDEO_PLAYER } = CONFIG.SELECTORS;
            const { VAR_HEADER, VAR_BOTTOM, VAR_BUFFER, VAR_MAX_HEIGHT, VAR_LOCAL_UI, VAR_GRID_ASPECT } = CONFIG.STYLE;
            const { VIDEO_ASPECT_RATIO, FALLBACK_HEADER_HEIGHT_PX, GRID_GAP_PX } = CONFIG.DIMENSIONS;
            const C = CONFIG.CLASSES;

            return `
                :root {
                    ${VAR_MAX_HEIGHT}: calc(100vh - var(${VAR_HEADER}, ${FALLBACK_HEADER_HEIGHT_PX}px) - var(${VAR_BOTTOM}, 0px) - var(${VAR_BUFFER}, 0px));
                }

                /* ==========================================
                   PREMIUM ANIMATIONS (HARDWARE ACCELERATED)
                   ========================================== */

                @keyframes xivShimmerPulse {
                    0% { filter: blur(0px) grayscale(0%); opacity: 1; }
                    50% { filter: blur(4px) grayscale(30%); opacity: 0.5; }
                    100% { filter: blur(0px) grayscale(0%); opacity: 1; }
                }

                @keyframes xivFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes xivScaleDown {
                    from { transform: scale(1.05); }
                    to { transform: scale(1); }
                }

                /* ==========================================
                   UNCROP MULTI-IMAGE GRIDS
                   ========================================== */

                /* Shimmer loading state while math is processing */
                .${C.PROCESSING} {
                    animation: xivShimmerPulse 1.2s infinite ease-in-out !important;
                    pointer-events: none !important;
                }

                .${C.HIDDEN_ORIGINAL} {
                    display: none !important;
                }

                .${C.MATH_GRID} {
                    display: flex;
                    box-sizing: border-box !important;
                    width: 100% !important;
                    margin: 0 auto !important;
                    gap: ${GRID_GAP_PX}px !important;
                    overflow: hidden !important;
                    border-radius: clamp(4px, 1vw, 8px) !important;

                    /* Constraints */
                    max-height: calc(var(${VAR_MAX_HEIGHT}) - var(${VAR_LOCAL_UI}, 0px)) !important;
                    aspect-ratio: var(${VAR_GRID_ASPECT}) !important;
                    max-width: calc((var(${VAR_MAX_HEIGHT}) - var(${VAR_LOCAL_UI}, 0px)) * var(${VAR_GRID_ASPECT})) !important;

                    /* Fade in transition */
                    animation: xivFadeIn 400ms ease-out forwards !important;
                }

                .${C.COL} { display: flex !important; flex-direction: column !important; gap: ${GRID_GAP_PX}px !important; min-width: 0 !important; }
                .${C.ROW} { display: flex !important; flex-direction: row !important; gap: ${GRID_GAP_PX}px !important; min-height: 0 !important; }

                .${C.ITEM} {
                    box-sizing: border-box !important;
                    position: relative !important;
                    display: flex !important;
                    cursor: pointer !important;
                    min-height: 0 !important;
                    min-width: 0 !important;
                    overflow: hidden !important;
                }

                .${C.IMG} {
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    display: block !important;
                    transform-origin: center center !important;

                    /* Scale down transition for a premium settle effect */
                    animation: xivScaleDown 600ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important;
                }

                /* Force grid parent container to hug the custom layout */
                ${POST_GRID_WRAP}.${C.PROCESSED} {
                    height: auto !important;
                    padding: 0 !important;
                    display: flex !important;
                    justify-content: center !important;
                }

                /* ==========================================
                   SINGLE IMAGE TARGETS
                   ========================================== */

                ${POST_SINGLE_IMAGE_WRAP},
                ${POST_SINGLE_IMAGE_WRAP} ${POST_THUMB_WRAP},
                ${WIDGET_MEDIA} {
                    max-height: calc(var(${VAR_MAX_HEIGHT}) - var(${VAR_LOCAL_UI}, 0px)) !important;
                    height: auto !important;
                    display: flex !important;
                    justify-content: center !important;
                    align-items: center !important;
                    padding: 0 !important;
                }

                ${POST_SINGLE_IMAGE_WRAP} img,
                ${DETAIL_IMAGE_LINK} img,
                ${WIDGET_MEDIA} img {
                    max-height: calc(var(${VAR_MAX_HEIGHT}) - var(${VAR_LOCAL_UI}, 0px)) !important;
                    height: auto !important;
                    width: auto !important;
                    max-width: 100% !important;
                    object-fit: contain !important;
                    margin: 0 auto !important;
                    display: block !important;
                }

                /* ==========================================
                   VIDEO PLAYERS
                   ========================================== */

                ${VIDEO_PLAYER}:has(iframe),
                ${VIDEO_PLAYER}:has(video) {
                    max-height: calc(var(${VAR_MAX_HEIGHT}) - var(${VAR_LOCAL_UI}, 0px)) !important;
                    width: 100% !important;
                    max-width: calc((var(${VAR_MAX_HEIGHT}) - var(${VAR_LOCAL_UI}, 0px)) * (${VIDEO_ASPECT_RATIO})) !important;
                    aspect-ratio: ${VIDEO_ASPECT_RATIO} !important;
                    height: auto !important;
                    padding: 0 !important;
                    margin: 0 auto !important;
                    position: relative !important;
                    display: block !important;
                }

                ${VIDEO_PLAYER} iframe,
                ${VIDEO_PLAYER} video {
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    max-height: calc(var(${VAR_MAX_HEIGHT}) - var(${VAR_LOCAL_UI}, 0px)) !important;
                    margin: 0 !important;
                }
            `;
        },

        inject() {
            if (document.getElementById(CONFIG.STYLE.ELEMENT_ID)) return;
            try {
                const styleEl = document.createElement('style');
                styleEl.id = CONFIG.STYLE.ELEMENT_ID;
                styleEl.textContent = this.generateCSS();

                // document.head might not exist yet at document-start, fallback to documentElement
                const targetNode = document.head || document.documentElement;
                if (targetNode) {
                    targetNode.appendChild(styleEl);
                }
            } catch (error) {
                console.warn('[Weverse Media Enhancements] Style ingestion failed:', error);
            }
        }
    };

    // ==========================================
    // MODULE: Core Application
    // ==========================================
    const App = {
        init() {
            StyleInjector.inject();
            LayoutTracker.init();
        }
    };

    App.init();

})();
