const fs = require('fs');
const path = require('path');
const earcutModule = require('earcut');
const earcut = earcutModule.default || earcutModule;
const simplify = require('simplify-js');
const { Document, NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune, dedup, draco } = require('@gltf-transform/functions');

// Configuration
const COUNTRIES_DIR = './node_modules/world-geojson/countries/';
const OUTPUT_FILE = './assets/world.glb';
const GLOBE_RADIUS = 1.0;
const EXTRUSION_HEIGHT = 0.02;
const SUBDIVISION_LEVEL = 1; // Balanced subdivision for smooth lighting with reasonable vertex count
const SIMPLIFICATION_TOLERANCE = 0.002; // Balanced detail for coastlines while reducing vertex count

// Helper: Convert lat/lng to 3D sphere coordinates
function latLngToVector3(lat, lng, radius = GLOBE_RADIUS, height = 0) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = -(lng + 180) * Math.PI / 180; // Negated to fix lateral inversion
    const r = radius + height;

    return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta)
    };
}

// Helper: Simplify GeoJSON coordinates
function simplifyCoordinates(coords, tolerance) {
    // Convert to simplify-js format
    const points = coords.map(([lng, lat]) => ({ x: lng, y: lat }));

    // Simplify
    const simplified = simplify(points, tolerance, true);

    // Convert back to GeoJSON format
    return simplified.map(p => [p.x, p.y]);
}

// Helper: Subdivide triangles and project onto sphere
function subdivideTriangles(vertices, triangleIndices, level, radius) {
    let currentTriangles = [];

    // Convert indices to vertex triplets
    for (let i = 0; i < triangleIndices.length; i += 3) {
        currentTriangles.push([
            vertices[triangleIndices[i]],
            vertices[triangleIndices[i + 1]],
            vertices[triangleIndices[i + 2]]
        ]);
    }

    // Subdivide recursively
    for (let l = 0; l < level; l++) {
        const newTriangles = [];

        currentTriangles.forEach(tri => {
            const [v0, v1, v2] = tri;

            // Calculate midpoints and project onto sphere
            const m01 = projectToSphere(midpoint(v0, v1), radius);
            const m12 = projectToSphere(midpoint(v1, v2), radius);
            const m20 = projectToSphere(midpoint(v2, v0), radius);

            // Create 4 new triangles
            newTriangles.push(
                [v0, m01, m20],
                [m01, v1, m12],
                [m20, m12, v2],
                [m01, m12, m20]
            );
        });

        currentTriangles = newTriangles;
    }

    return currentTriangles;
}

function midpoint(v0, v1) {
    return {
        x: (v0.x + v1.x) * 0.5,
        y: (v0.y + v1.y) * 0.5,
        z: (v0.z + v1.z) * 0.5
    };
}

function projectToSphere(v, radius) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return {
        x: (v.x / len) * radius,
        y: (v.y / len) * radius,
        z: (v.z / len) * radius
    };
}

// Helper: Create extruded geometry from triangles
function createExtrudedGeometry(triangles, extrusionHeight) {
    const positions = [];
    const normals = [];
    const indices = [];
    let vertexIndex = 0;

    triangles.forEach(triangle => {
        triangle.forEach(vertex => {
            // Calculate normal (pointing outward from sphere center)
            const normal = {
                x: vertex.x / GLOBE_RADIUS,
                y: vertex.y / GLOBE_RADIUS,
                z: vertex.z / GLOBE_RADIUS
            };

            // Create the extruded vertex (outward along normal)
            positions.push(
                vertex.x + normal.x * extrusionHeight,
                vertex.y + normal.y * extrusionHeight,
                vertex.z + normal.z * extrusionHeight
            );

            // Store the normal for this vertex
            normals.push(normal.x, normal.y, normal.z);
        });

        // Create indices for this triangle (only top face)
        const baseIdx = vertexIndex;
        indices.push(baseIdx, baseIdx + 1, baseIdx + 2);

        vertexIndex += 3;
    });

    return { positions, normals, indices };
}

// Helper: Generate random green color
function generateRandomColor() {
    // Generate shades of green with varying brightness
    // Keep red and blue components low, vary green from 0.3 to 0.9
    const greenBrightness = 0.3 + Math.random() * 0.6; // 0.3 to 0.9
    const redComponent = 0.05 + Math.random() * 0.15; // 0.05 to 0.2 (slight variation)
    const blueComponent = 0.05 + Math.random() * 0.15; // 0.05 to 0.2 (slight variation)

    return [redComponent, greenBrightness, blueComponent];
}

// Process a single country
function processCountry(countryFile) {
    const countryName = path.basename(countryFile, '.json');
    console.log(`Processing ${countryName}...`);

    const geoJSON = JSON.parse(fs.readFileSync(countryFile, 'utf8'));
    const geometries = [];

    // Generate a random color for this country
    const countryColor = generateRandomColor();

    geoJSON.features.forEach((feature, featureIdx) => {
        const processPolygon = (coordinates) => {
            const outerCoords = coordinates[0];

            if (outerCoords.length < 3) return null;

            // Simplify coordinates
            const simplifiedCoords = simplifyCoordinates(outerCoords, SIMPLIFICATION_TOLERANCE);

            if (simplifiedCoords.length < 3) return null;

            // Flatten for earcut
            const flatCoords = [];
            simplifiedCoords.forEach(coord => {
                flatCoords.push(coord[0], coord[1]);
            });

            // Triangulate
            const triangleIndices = earcut(flatCoords, null, 2);

            if (triangleIndices.length === 0) return null;

            // Convert to 3D sphere vertices
            const vertices3D = simplifiedCoords.map(coord => {
                const [lng, lat] = coord;
                return latLngToVector3(lat, lng, GLOBE_RADIUS);
            });

            // Subdivide and project
            const subdividedTriangles = subdivideTriangles(
                vertices3D,
                triangleIndices,
                SUBDIVISION_LEVEL,
                GLOBE_RADIUS
            );

            // Create extruded geometry
            return createExtrudedGeometry(subdividedTriangles, EXTRUSION_HEIGHT);
        };

        let geometry = null;

        if (feature.geometry.type === 'Polygon') {
            geometry = processPolygon(feature.geometry.coordinates);
        } else if (feature.geometry.type === 'MultiPolygon') {
            // For MultiPolygon, combine all polygons
            const allGeometries = feature.geometry.coordinates
                .map(polygon => processPolygon(polygon))
                .filter(g => g !== null);

            if (allGeometries.length > 0) {
                // Combine into single geometry
                const combinedPositions = [];
                const combinedNormals = [];
                const combinedIndices = [];
                let vertexOffset = 0;

                allGeometries.forEach(geom => {
                    combinedPositions.push(...geom.positions);
                    combinedNormals.push(...geom.normals);
                    geom.indices.forEach(idx => {
                        combinedIndices.push(idx + vertexOffset);
                    });
                    vertexOffset += geom.positions.length / 3;
                });

                geometry = {
                    positions: combinedPositions,
                    normals: combinedNormals,
                    indices: combinedIndices
                };
            }
        }

        if (geometry) {
            geometries.push({
                name: `${countryName}_${featureIdx}`,
                ...geometry,
                color: countryColor
            });
        }
    });

    const totalVertices = geometries.reduce((sum, g) => sum + g.positions.length / 3, 0);
    console.log(`  ✓ ${countryName}: ${geometries.length} geometries, ${totalVertices} vertices`);

    return { countryName, geometries, color: countryColor };
}

// Main build function
async function buildGlobe() {
    console.log('Starting globe build...\n');

    // Get all country files
    const countryFiles = fs.readdirSync(COUNTRIES_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(COUNTRIES_DIR, file))
        .sort();

    console.log(`Found ${countryFiles.length} countries\n`);

    // Create GLTF document
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene();

    // Process each country
    let totalVertices = 0;
    let totalCountries = 0;

    for (const countryFile of countryFiles) {
        try {
            const { countryName, geometries } = processCountry(countryFile);

            geometries.forEach(geom => {
                // Create accessor for positions
                const positionAccessor = doc.createAccessor()
                    .setType('VEC3')
                    .setArray(new Float32Array(geom.positions))
                    .setBuffer(buffer);

                // Create accessor for indices
                const indicesAccessor = doc.createAccessor()
                    .setType('SCALAR')
                    .setArray(new Uint32Array(geom.indices))
                    .setBuffer(buffer);

                // Create vertex colors (same color for all vertices in this geometry)
                const vertexCount = geom.positions.length / 3;
                const colors = new Float32Array(vertexCount * 3);
                for (let i = 0; i < vertexCount; i++) {
                    colors[i * 3] = geom.color[0];
                    colors[i * 3 + 1] = geom.color[1];
                    colors[i * 3 + 2] = geom.color[2];
                }

                const colorAccessor = doc.createAccessor()
                    .setType('VEC3')
                    .setArray(colors)
                    .setBuffer(buffer);

                // Create accessor for normals
                const normalAccessor = doc.createAccessor()
                    .setType('VEC3')
                    .setArray(new Float32Array(geom.normals))
                    .setBuffer(buffer);

                // Create primitive
                const primitive = doc.createPrimitive()
                    .setMode(4) // TRIANGLES
                    .setAttribute('POSITION', positionAccessor)
                    .setAttribute('NORMAL', normalAccessor)
                    .setAttribute('COLOR_0', colorAccessor)
                    .setIndices(indicesAccessor);

                // Create mesh
                const mesh = doc.createMesh(geom.name)
                    .addPrimitive(primitive);

                // Create node and add to scene
                const node = doc.createNode(geom.name)
                    .setMesh(mesh);

                scene.addChild(node);

                totalVertices += geom.positions.length / 3;
            });

            totalCountries++;
        } catch (error) {
            console.error(`  ✗ Error processing ${path.basename(countryFile)}: ${error.message}`);
        }
    }

    console.log(`\n✓ Processed ${totalCountries} countries`);
    console.log(`✓ Total vertices: ${totalVertices.toLocaleString()}`);

    // Apply optimizations
    console.log('\nApplying optimizations...');
    await doc.transform(
        prune(),
        dedup()
        // Draco compression disabled for now - complex encoder setup required
        // File size will be larger but loading/parsing will be faster
        // TODO: Re-enable with proper encoder setup if needed
        // draco({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 })
    );

    // Write GLB file
    console.log(`\nWriting to ${OUTPUT_FILE}...`);
    const io = new NodeIO();
    io.registerExtensions(ALL_EXTENSIONS);

    await io.write(OUTPUT_FILE, doc);

    const stats = fs.statSync(OUTPUT_FILE);
    console.log(`✓ Complete! File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

// Run build
buildGlobe().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
});
