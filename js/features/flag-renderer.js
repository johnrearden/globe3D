/**
 * Flag Renderer Module
 * Handles 3D waving flag display for country hover and selection
 */

import { state } from '../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

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

        // Create material
        const flagMaterial = new THREE.MeshStandardMaterial({
            map: flagTexture,
            side: THREE.DoubleSide,
            roughness: 0.7,
            metalness: 0.1
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
        mesh.geometry.computeVertexNormals();
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
     */
    show(countryName, countryData, countryToISO) {
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
        }

        // Show flag container (fixed position in top right)
        this.elements.get('flag-container').style.display = 'block';
    }

    /**
     * Hide the waving flag
     */
    hide() {
        this.elements.get('flag-container').style.display = 'none';
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
