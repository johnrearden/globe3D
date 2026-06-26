/**
 * Flag Renderer Module
 * Handles 3D waving flag display for country hover and selection
 */

import { state } from '../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

// Phosphor `x` glyph (inline SVG per CLAUDE.md — no icon font) for the close button.
const CLOSE_ICON = '<svg viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';

export class FlagRenderer {
    constructor(containerElement, elements) {
        this.containerElement = containerElement;
        this.elements = elements;

        // Three.js objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Flag mesh and animation
        this.flagMesh = null;
        this.originalPositions = null;
        this.time = 0;

        // Current state
        this.currentCountry = null;

        // Optional dismiss callback (wired by the app to also clear the globe
        // selection / label highlight). Falls back to just hiding the panel.
        this.onClose = null;
    }

    /**
     * Initialize the flag renderer (scene, camera, renderer, lights)
     */
    init() {
        // Create flag scene
        this.scene = new THREE.Scene();
        this.scene.background = null; // Transparent background

        // Create flag camera (reduced by 40%: 180x120)
        this.camera = new THREE.PerspectiveCamera(45, 180 / 120, 0.1, 1000);
        this.camera.position.z = 9.5; // Moved slightly back from 8

        // Create flag renderer (reduced by 40%)
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(180, 120);
        this.renderer.setClearColor(0x000000, 0); // Transparent

        // Insert the canvas into the flag-container-content, after flag-info
        const flagContainerContent = this.elements.get('flag-container-content');
        flagContainerContent.appendChild(this.renderer.domElement);

        // Dismiss (×) button, top-right of the panel. The panel is pointer-events:none
        // so the button re-enables them (see styles.css .flag-close). stopPropagation
        // keeps the tap from reaching the globe pointer handlers behind it.
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'flag-close';
        closeBtn.setAttribute('aria-label', 'Close country info');
        closeBtn.innerHTML = CLOSE_ICON;
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onClose) this.onClose();
            else this.hide();
        });
        this.elements.get('flag-container').appendChild(closeBtn);

        // Add lights to flag scene
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        console.log('FlagRenderer initialized');
    }

    /**
     * Create a waving flag mesh
     * @param {string} isoCode - ISO country code (lowercase, 2 letters)
     * @returns {Object} Object with flag mesh and original positions
     */
    createWavingFlag(isoCode) {
        // Load flag texture from flagcdn.com (high resolution)
        const textureLoader = new THREE.TextureLoader();
        const flagTexture = textureLoader.load(`https://flagcdn.com/w640/${isoCode}.png`);

        // Create plane geometry with subdivisions for wave effect
        const flagGeometry = new THREE.PlaneGeometry(10, 6.67, 20, 15);

        // Create material. flatShading lets the GPU derive normals from the
        // deformed geometry each frame, so lighting tracks the wave without a
        // per-frame computeVertexNormals() on the CPU.
        const flagMaterial = new THREE.MeshStandardMaterial({
            map: flagTexture,
            side: THREE.DoubleSide,
            roughness: 0.7,
            metalness: 0.1,
            flatShading: true
        });

        // Create mesh
        const flag = new THREE.Mesh(flagGeometry, flagMaterial);

        // Store original positions for animation
        const positions = flag.geometry.attributes.position;
        const originalPositions = new Float32Array(positions.array);

        return { flag, originalPositions };
    }

    /**
     * Animate flag wave using Perlin noise
     * @param {THREE.Mesh} mesh - Flag mesh to animate
     * @param {Float32Array} originalPositions - Original vertex positions
     * @param {number} time - Animation time
     */
    animateFlagWave(mesh, originalPositions, time) {
        if (!mesh || !originalPositions) return;

        // Check if Perlin noise library is loaded
        if (!window.noise || !window.noise.perlin2) {
            console.warn('Perlin noise library not loaded yet');
            return;
        }

        const positions = mesh.geometry.attributes.position;
        const coeff = 72;
        const coeff2 = 65;
        const gap = 10;
        const spacing = 30;

        for (let i = 0; i < positions.count; i++) {
            const x = originalPositions[i * 3];
            const y = originalPositions[i * 3 + 1];

            // Apply Perlin noise to Z position for wave effect
            positions.array[i * 3 + 2] = 1 +
                (spacing / 25) *
                window.noise.perlin2(
                    x * (gap / coeff) + time,
                    y * (gap / coeff2)
                );
        }

        positions.needsUpdate = true;
    }

    /**
     * Update flag animation
     */
    update() {
        if (!this.flagMesh || !this.originalPositions) return;

        this.time = performance.now() * 0.001 * 3; // Speed factor
        this.animateFlagWave(this.flagMesh, this.originalPositions, this.time);

        // Render the flag scene
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Show waving flag for a country
     * @param {string} countryName - Name of the country
     * @param {Object} countryData - Country data with iso, pop, area, lang
     * @param {Object} countryToISO - Legacy ISO mapping fallback
     * @param {string} [capital] - Capital city name (from globeManager.getCapital)
     */
    show(countryName, countryData, countryToISO, capital) {
        // Try to get data from countryData first, fallback to legacy ISO mapping
        let data = countryData[countryName];
        let isoCode = data ? data.iso : countryToISO[countryName];

        if (!isoCode) {
            console.log('No ISO code found for:', countryName);
            // Still show the panel with limited info
            data = { iso: null, pop: 'N/A', area: 'N/A', lang: 'N/A' };
        }

        // Only create new flag if country changed
        if (this.currentCountry !== countryName) {
            this.currentCountry = countryName;

            // Remove old flag if exists
            if (this.flagMesh) {
                this.scene.remove(this.flagMesh);
                this.flagMesh.geometry.dispose();
                this.flagMesh.material.dispose();
            }

            // Create new flag if ISO code exists
            if (isoCode) {
                const { flag, originalPositions } = this.createWavingFlag(isoCode);
                this.flagMesh = flag;
                this.originalPositions = originalPositions;
                this.scene.add(this.flagMesh);

                // Reset time
                this.time = 0;
            }

            // Update country info
            const countryNameEl = document.querySelector('#flag-info .country-name');
            if (countryNameEl) {
                countryNameEl.textContent = countryName;
            }
            this.elements.get('info-population').textContent =
                data && data.pop !== 'N/A' ? `${data.pop}M` : 'N/A';
            this.elements.get('info-area').textContent =
                data && data.area !== 'N/A' ? data.area : 'N/A';
            this.elements.get('info-language').textContent =
                data && data.lang !== 'N/A' ? data.lang : 'N/A';
            this.elements.get('info-capital').textContent = capital || 'N/A';

            // Dependencies carry a sovereign parent ("Territory of: Denmark").
            // Sovereign states have no parent — hide the row entirely.
            const parentRow = this.elements.get('info-parent-row');
            const parentVal = this.elements.get('info-parent');
            if (data && data.parent) {
                if (parentVal) parentVal.textContent = data.parent;
                if (parentRow) parentRow.style.display = '';
            } else if (parentRow) {
                parentRow.style.display = 'none';
            }
        }

        // Show flag container (fixed position in top right). The body class lets CSS
        // hide the bottom-right main CTA cluster on mobile, where the country detail
        // panel docks at the bottom and would otherwise overlap it.
        this.elements.get('flag-container').style.display = 'block';
        document.body.classList.add('flag-info-active');
    }

    /**
     * Hide the waving flag
     */
    hide() {
        this.elements.get('flag-container').style.display = 'none';
        document.body.classList.remove('flag-info-active');
        this.currentCountry = null;
    }

    /**
     * Get current hovered country
     * @returns {string|null}
     */
    getCurrentCountry() {
        return this.currentCountry;
    }

    /**
     * Check if flag is currently showing
     * @returns {boolean}
     */
    isShowing() {
        return this.currentCountry !== null;
    }
}
