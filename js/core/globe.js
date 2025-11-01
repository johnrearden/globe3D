/**
 * Globe Management Module
 * Handles globe creation, country loading, and geographic utilities
 */

import { state } from '../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

export class GlobeManager {
    constructor(scene) {
        this.scene = scene;
        this.globe = null;
        this.baseSphere = null;
        this.countries = [];
        this.countryCentroids = [];
    }

    /**
     * Initialize globe container and base sphere
     */
    init() {
        // Create globe container
        this.globe = new THREE.Group();
        this.scene.add(this.globe);

        // Create base sphere (inner blocker)
        // Radius is 1.014 (just below countries at 1.02) to block artifacts from inside
        const sphereGeometry = new THREE.SphereGeometry(1.014, 64, 64);
        const sphereMaterial = new THREE.MeshPhongMaterial({
            color: 0x001a33, // Dark blue ocean color
            transparent: false,
            opacity: 1.0,
            side: THREE.BackSide, // Render inside surface to block artifacts
            depthWrite: true,
            shininess: 30, // Moderate reflectivity
            specular: 0x222222 // Subtle highlights
        });
        this.baseSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.globe.add(this.baseSphere);

        // Add latitude and longitude lines
        this.addLatLongLines();

        // Sync to state
        state.set('scene.globe', this.globe, false);
        state.set('scene.baseSphere', this.baseSphere, false);

        console.log('GlobeManager initialized');
    }

    /**
     * Convert latitude/longitude to 3D vector position on sphere
     * @param {number} lat - Latitude in degrees
     * @param {number} lng - Longitude in degrees
     * @param {number} radius - Sphere radius
     * @param {number} height - Additional height above surface
     * @returns {THREE.Vector3}
     */
    latLngToVector3(lat, lng, radius = 1, height = 0) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lng + 180) * Math.PI / 180;

        const r = radius + height;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);

        return new THREE.Vector3(x, y, z);
    }

    /**
     * Add latitude and longitude grid lines to globe
     */
    addLatLongLines() {
        const radius = 1.001; // Slightly larger than globe to prevent z-fighting
        const lineColor = 0x444444;
        const lineMaterial = new THREE.LineBasicMaterial({
            color: lineColor,
            opacity: 0.3,
            transparent: true
        });

        // Add latitude lines (parallels)
        // Every 15 degrees: -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75
        for (let lat = -75; lat <= 75; lat += 15) {
            const points = [];
            for (let lng = -180; lng <= 180; lng += 5) {
                const point = this.latLngToVector3(lat, lng, radius);
                points.push(point);
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.globe.add(line);
        }

        // Add longitude lines (meridians)
        // Every 15 degrees
        for (let lng = -180; lng < 180; lng += 15) {
            const points = [];
            for (let lat = -90; lat <= 90; lat += 5) {
                const point = this.latLngToVector3(lat, lng, radius);
                points.push(point);
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.globe.add(line);
        }

        // Add equator with different color for emphasis
        const equatorMaterial = new THREE.LineBasicMaterial({
            color: 0x666666,
            opacity: 0.5,
            transparent: true
        });
        const equatorPoints = [];
        for (let lng = -180; lng <= 180; lng += 5) {
            const point = this.latLngToVector3(0, lng, radius);
            equatorPoints.push(point);
        }
        const equatorGeometry = new THREE.BufferGeometry().setFromPoints(equatorPoints);
        const equatorLine = new THREE.Line(equatorGeometry, equatorMaterial);
        this.globe.add(equatorLine);
    }

    /**
     * Load world data from GLB file
     * @param {Function} onProgress - Progress callback (percent, message)
     * @param {Function} onComplete - Completion callback (countries)
     * @param {Function} onError - Error callback
     */
    async loadGlobe(onProgress, onComplete, onError) {
        try {
            console.log('Loading world globe...');

            // Create DRACOLoader for decompressing the mesh
            const dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
            dracoLoader.setDecoderConfig({ type: 'js' });

            // Create GLTFLoader and attach DRACOLoader
            const loader = new THREE.GLTFLoader();
            loader.setDRACOLoader(dracoLoader);

            // Load the pre-built globe GLB file
            loader.load(
                'assets/world.glb',
                async (gltf) => {
                    console.log('GLB loaded successfully');
                    if (onProgress) onProgress(70, 'Processing countries...', true);

                    // Add all meshes from the GLB to the globe
                    gltf.scene.traverse((child) => {
                        if (child.isMesh) {
                            // Store reference for raycasting and interaction
                            child.userData.isCountry = true;

                            // Get the vertex color from the geometry (if available)
                            const hasVertexColors = child.geometry.attributes.color !== undefined;

                            // Set material to use vertex colors with Phong material for smooth lighting
                            if (hasVertexColors) {
                                child.material = new THREE.MeshPhongMaterial({
                                    vertexColors: true,
                                    transparent: false,
                                    side: THREE.FrontSide,
                                    flatShading: false,
                                    shininess: 30
                                });
                            } else {
                                child.material = new THREE.MeshPhongMaterial({
                                    color: 0x4FC3F7,
                                    transparent: false,
                                    side: THREE.FrontSide,
                                    flatShading: false,
                                    shininess: 30
                                });
                            }

                            // Extract country name from mesh name
                            // Remove the trailing number (e.g., "_0", "_1") and convert to title case
                            const countryName = child.name.replace(/_\d+$/, ''); // Remove trailing _number
                            const formattedName = countryName
                                .replace(/_/g, ' ') // Replace underscores with spaces
                                .split(' ')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                .join(' ');
                            child.userData.name = formattedName;

                            this.countries.push(child);
                        }
                    });

                    await new Promise(resolve => setTimeout(resolve, 300));
                    if (onProgress) onProgress(78, 'Building globe...', true);

                    // Add the entire scene to the globe
                    this.globe.add(gltf.scene);

                    console.log(`Loaded ${this.countries.length} country meshes`);

                    await new Promise(resolve => setTimeout(resolve, 300));
                    if (onProgress) onProgress(85, 'Calculating positions...', true);

                    // Build country centroids cache
                    this.buildCountryCentroidsCache();

                    // Sync to state
                    state.set('countries.list', this.countries, false);
                    state.set('countries.centroids', this.countryCentroids, false);

                    if (onComplete) onComplete(this.countries);
                },
                (xhr) => {
                    // Progress callback - scale download to 0-70% of total progress
                    const downloadPercent = (xhr.loaded / xhr.total * 100).toFixed(0);
                    const scaledPercent = Math.floor(downloadPercent * 0.7);
                    console.log(`Downloading: ${downloadPercent}% (scaled: ${scaledPercent}%)`);
                    if (onProgress) onProgress(scaledPercent, `Downloading... ${downloadPercent}%`);
                },
                (error) => {
                    console.error('Error loading GLB:', error);
                    if (onError) onError(error);
                }
            );

        } catch (error) {
            console.error('Error loading world data:', error);
            if (onError) onError(error);
        }
    }

    /**
     * Build cache of country centroids for efficient lookups
     */
    buildCountryCentroidsCache() {
        this.countryCentroids = [];

        // Get unique country names
        const uniqueCountries = new Map();

        this.countries.forEach(mesh => {
            const countryName = mesh.userData.name;
            if (!uniqueCountries.has(countryName)) {
                uniqueCountries.set(countryName, []);
            }
            uniqueCountries.get(countryName).push(mesh);
        });

        // Calculate centroid for each unique country (average of all its meshes' centroids)
        uniqueCountries.forEach((meshes, countryName) => {
            const centroid = new THREE.Vector3(0, 0, 0);
            let totalVertices = 0;

            meshes.forEach(mesh => {
                const geometry = mesh.geometry;
                const positions = geometry.attributes.position;

                for (let i = 0; i < positions.count; i++) {
                    const vertex = new THREE.Vector3(
                        positions.getX(i),
                        positions.getY(i),
                        positions.getZ(i)
                    );
                    // Apply world transform
                    mesh.localToWorld(vertex);
                    centroid.add(vertex);
                    totalVertices++;
                }
            });

            if (totalVertices > 0) {
                centroid.divideScalar(totalVertices);
                // Normalize to sphere surface (in case of small precision errors)
                centroid.normalize();

                // Store centroid with country name
                this.countryCentroids.push({
                    name: countryName,
                    centroid: centroid,
                    meshRef: meshes[0] // Reference to first mesh for convenience
                });
            }
        });

        console.log(`Built centroids for ${this.countryCentroids.length} countries`);
    }

    /**
     * Get all countries
     * @returns {Array} Array of country meshes
     */
    getCountries() {
        return this.countries;
    }

    /**
     * Get country centroids
     * @returns {Array} Array of {name, centroid, meshRef}
     */
    getCentroids() {
        return this.countryCentroids;
    }

    /**
     * Get country by name
     * @param {string} name - Country name
     * @returns {Array} Array of meshes for this country
     */
    getCountryByName(name) {
        return this.countries.filter(mesh => mesh.userData.name === name);
    }

    /**
     * Get globe container
     * @returns {THREE.Group}
     */
    getGlobe() {
        return this.globe;
    }

    /**
     * Get base sphere
     * @returns {THREE.Mesh}
     */
    getBaseSphere() {
        return this.baseSphere;
    }
}
