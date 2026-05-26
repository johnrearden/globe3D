/**
 * Shatter Animation
 *
 * Triggered when the player finishes a quiz at or below the shatter
 * threshold. The globe instantly bursts into many flat triangular
 * shards which fly outward in all directions, tumbling under a mild
 * downward gravity until they leave the visible frustum.
 *
 *   zooming → exploding (shards in flight) → restoring (shards
 *   converge + globe scales back + camera settles at 3.17) → idle
 *
 * At the end of the explosion the shards reassemble: their parent
 * group's scale eases from 1 → 0, which simultaneously pulls every
 * shard toward the group origin and shrinks them to nothing. The
 * underlying globe scales back up over the same window, so the shards
 * "fold back into" the globe. The camera settles at a fixed
 * RESTORE_CAMERA_DISTANCE rather than wherever the user was looking
 * from, matching the bounce/pinball animations' settle behavior.
 *
 * The camera zooms out along the user's current view direction first
 * so the explosion has room to breathe before the shards leave the
 * frustum. No downward tilt — the burst is 3D, not a flat surface.
 *
 * Each shard is an irregular convex polygon (5–8 perimeter vertices
 * with jittered radii and angles) lying in the tangent plane at a
 * uniformly-random point on the unit sphere, fan-triangulated from a
 * center vertex. All shards share one MeshBasicMaterial whose map is
 * a baked equirectangular snapshot of the globe (same palette + ID
 * buffer the globe itself uses), and each shard's UVs are computed
 * from its vertex spherical coordinates — so the shards read as
 * actual pieces of the globe's surface flying apart.
 */

const THREE = window.THREE;

const SHARD_COUNT = 90;
const SHARD_BASE_SIZE = 0.13;
const SHARD_SIZE_VAR = 0.07;
const SHARD_MIN_VERTS = 5;
const SHARD_MAX_VERTS = 8;
const SHARD_RADIUS_JITTER = 0.55;    // ±55% of nominal radius per vertex
const SHARD_ANGLE_JITTER = 0.55;     // ±55% of inter-vertex step

// Initial burst velocity ranges (units/s)
const SHATTER_BASE_SPEED = 4.5;
const SHATTER_SPEED_VAR = 2.0;
const SHATTER_LATERAL_NOISE = 0.8;
// Angular velocity is kept moderate so the shards tumble lazily like leaves
// rather than spinning frantically.
const SHATTER_ANGULAR_VEL = 4.0;     // max per-axis (rad/s)
// Drag-based physics: velocity decays as exp(-DRAG_K · t). Combined with a
// constant gravity, this gives a terminal vertical speed of GRAVITY / DRAG_K
// (≈1.25 units/s downward at the chosen values). The result is an initial
// outward burst that quickly slows and gives way to a gentle settle.
const SHATTER_GRAVITY = 3.5;
const SHATTER_DRAG_K = 1.2;
// Per-shard sinusoidal wobble — the spiralling sway as it drifts down.
const WOBBLE_AMP_MIN = 0.15;
const WOBBLE_AMP_MAX = 0.35;
const WOBBLE_FREQ_MIN = 2.0;         // rad/s (sway period ≈ 3s)
const WOBBLE_FREQ_MAX = 5.0;         // rad/s (sway period ≈ 1.25s)

const SHATTER_DURATION_S = 4.0;      // when shards auto-begin reassembly
const RESTORE_MS = 600;              // shard reassembly + globe scale-back + camera settle

const ZOOM_OUT_MS = 700;
const ZOOM_OUT_FACTOR = 4.5;         // multiplier on initialCameraDistance
const MAX_CAMERA_DISTANCE = 10;      // matches OrbitControls.maxDistance
const RESTORE_CAMERA_DISTANCE = 3.17; // camera settles here after reassembly

const MAP_TEX_W = 1024;
const MAP_TEX_H = 512;

/** Bake the country-id buffer + palette into a flat equirectangular
 *  texture (world-map view) used as the shard skin. */
function buildGlobeMapTexture(idBytes, idW, idH, paletteBytes, oceanColor) {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_TEX_W;
    canvas.height = MAP_TEX_H;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(MAP_TEX_W, MAP_TEX_H);
    const data = imageData.data;

    const [oR, oG, oB] = oceanColor;

    for (let y = 0; y < MAP_TEX_H; y++) {
        const srcY = Math.min(idH - 1, Math.floor((y / MAP_TEX_H) * idH));
        const srcRowBase = srcY * idW * 2;
        for (let x = 0; x < MAP_TEX_W; x++) {
            const srcX = Math.min(idW - 1, Math.floor((x / MAP_TEX_W) * idW));
            const srcIdx = srcRowBase + srcX * 2;
            // idBytes layout: [idHi, idLo, idHi, idLo, ...] per the picking code.
            const id = idBytes[srcIdx] * 256 + idBytes[srcIdx + 1];

            const di = (y * MAP_TEX_W + x) * 4;
            if (id === 0) {
                data[di] = oR;
                data[di + 1] = oG;
                data[di + 2] = oB;
            } else {
                const pi = id * 4;
                data[di] = paletteBytes[pi];
                data[di + 1] = paletteBytes[pi + 1];
                data[di + 2] = paletteBytes[pi + 2];
            }
            data[di + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

/** Equirectangular UV from a 3D direction. Matches the V orientation
 *  produced by the baked texture above (CanvasTexture default flipY
 *  puts the canvas's row 0 at V=1, so the north pole sits at V=1). */
function dirToUV(p) {
    const norm = p.clone().normalize();
    let lng = Math.atan2(norm.z, norm.x);
    if (lng < 0) lng += 2 * Math.PI;
    const lat = Math.asin(Math.max(-1, Math.min(1, norm.y)));
    return [lng / (2 * Math.PI), lat / Math.PI + 0.5];
}

export class ShatterAnimation {
    constructor({
        globeGroup, scene, camera, controls, initialCameraDistance,
        idBytes, idW, idH, paletteBytes, oceanColor
    }) {
        this.group = globeGroup;
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        this.initialCameraDistance = initialCameraDistance;

        this.idBytes = idBytes;
        this.idW = idW;
        this.idH = idH;
        this.paletteBytes = paletteBytes;
        this.oceanColor = oceanColor;

        this.state = 'idle'; // 'zooming' | 'exploding' | 'restoring'
        this.startTime = 0;

        this.restScale = globeGroup.scale.clone();
        this._restoreFromScale = globeGroup.scale.clone();
        this._restoreFromShardScale = 1;

        this.savedCameraPos = camera.position.clone();
        this.zoomedCameraPos = camera.position.clone();
        // The camera always settles at RESTORE_CAMERA_DISTANCE along the
        // user's view direction, independent of where they were looking
        // from when the shatter triggered.
        this.restoreTargetCameraPos = camera.position.clone();
        this._restoreFromCameraPos = camera.position.clone();

        this._buildShards();
    }

    get running() {
        return this.state !== 'idle';
    }

    _buildShards() {
        this.shardsGroup = new THREE.Group();
        this.shardsGroup.visible = false;

        const mapTexture = buildGlobeMapTexture(
            this.idBytes, this.idW, this.idH, this.paletteBytes, this.oceanColor
        );

        const material = new THREE.MeshBasicMaterial({
            map: mapTexture,
            side: THREE.DoubleSide
        });

        this.shards = [];

        const up = new THREE.Vector3(0, 1, 0);

        for (let i = 0; i < SHARD_COUNT; i++) {
            // Uniformly-distributed random point on the unit sphere.
            const u = Math.random();
            const w = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * w - 1);
            const center = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );

            // Tangent basis at this point on the sphere.
            const t1 = new THREE.Vector3().crossVectors(up, center);
            if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0); // at pole
            t1.normalize();
            const t2 = new THREE.Vector3().crossVectors(center, t1).normalize();

            const rotAngle = Math.random() * Math.PI * 2;
            const size = SHARD_BASE_SIZE + Math.random() * SHARD_SIZE_VAR;

            // Irregular convex polygon in the tangent plane: a center
            // vertex plus N perimeter vertices with jittered radii and
            // angles, fan-triangulated. Varying N (5–8) plus the jitter
            // gives each shard a distinct leaf-like silhouette.
            const vertCount = SHARD_MIN_VERTS +
                Math.floor(Math.random() * (SHARD_MAX_VERTS - SHARD_MIN_VERTS + 1));
            const step = (Math.PI * 2) / vertCount;

            const positions = [center.x, center.y, center.z];
            const uvs = [];
            const [cu, cv] = dirToUV(center);
            uvs.push(cu, cv);

            for (let k = 0; k < vertCount; k++) {
                const a = rotAngle + k * step
                    + (Math.random() - 0.5) * step * SHARD_ANGLE_JITTER;
                const r = size * (1 + (Math.random() - 0.5) * 2 * SHARD_RADIUS_JITTER);
                const vertex = center.clone()
                    .add(t1.clone().multiplyScalar(Math.cos(a) * r))
                    .add(t2.clone().multiplyScalar(Math.sin(a) * r));
                positions.push(vertex.x, vertex.y, vertex.z);
                const [uu, vv] = dirToUV(vertex);
                uvs.push(uu, vv);
            }

            // Fan triangles from center (index 0) around the perimeter
            // ring (indices 1..vertCount), closing back to vertex 1.
            const indices = [];
            for (let k = 1; k < vertCount; k++) indices.push(0, k, k + 1);
            indices.push(0, vertCount, 1);

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geom.setIndex(indices);

            const mesh = new THREE.Mesh(geom, material);
            this.shardsGroup.add(mesh);

            // Outward velocity from the globe center plus a random
            // tangential kick so the shards don't fan out as a perfect
            // radial pattern.
            const speed = SHATTER_BASE_SPEED + Math.random() * SHATTER_SPEED_VAR;
            const velocity = center.clone().multiplyScalar(speed);
            velocity.x += (Math.random() - 0.5) * SHATTER_LATERAL_NOISE;
            velocity.y += (Math.random() - 0.5) * SHATTER_LATERAL_NOISE;
            velocity.z += (Math.random() - 0.5) * SHATTER_LATERAL_NOISE;

            const angularVelocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2 * SHATTER_ANGULAR_VEL,
                (Math.random() - 0.5) * 2 * SHATTER_ANGULAR_VEL,
                (Math.random() - 0.5) * 2 * SHATTER_ANGULAR_VEL
            );

            // Wobble: a horizontal sway axis with per-shard amplitude,
            // frequency and phase, so the falling shards spiral around
            // their drifting centerline without locking in step.
            const wobbleAngle = Math.random() * Math.PI * 2;
            const wobble = {
                axis: new THREE.Vector3(
                    Math.cos(wobbleAngle),
                    (Math.random() - 0.5) * 0.4, // slight vertical component
                    Math.sin(wobbleAngle)
                ).normalize(),
                amp: WOBBLE_AMP_MIN + Math.random() * (WOBBLE_AMP_MAX - WOBBLE_AMP_MIN),
                freq: WOBBLE_FREQ_MIN + Math.random() * (WOBBLE_FREQ_MAX - WOBBLE_FREQ_MIN),
                phase: Math.random() * Math.PI * 2
            };

            this.shards.push({ mesh, velocity, angularVelocity, wobble });
        }

        this.scene.add(this.shardsGroup);
    }

    start() {
        if (this.state !== 'idle') return;

        this.restScale.copy(this.group.scale);

        // Snapshot the current camera pose. savedCameraPos is the zoom-out
        // lerp source; restoreTargetCameraPos is the post-reassembly settle
        // point (constant 3.17 along view direction).
        this.savedCameraPos.copy(this.camera.position);
        const dir = this.camera.position.clone();
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        this.restoreTargetCameraPos.copy(dir).multiplyScalar(RESTORE_CAMERA_DISTANCE);
        const targetDist = Math.min(
            this.initialCameraDistance * ZOOM_OUT_FACTOR,
            MAX_CAMERA_DISTANCE
        );
        this.zoomedCameraPos.copy(dir.multiplyScalar(targetDist));

        // Reset shard transforms ahead of time so the actual shatter
        // moment is one frame's worth of work, not many.
        for (const shard of this.shards) {
            shard.mesh.position.set(0, 0, 0);
            shard.mesh.rotation.set(0, 0, 0);
        }

        // If the user is already at/past the zoom target (e.g. they just
        // restored from a previous shatter), skip the zoom and burst now.
        if (this.camera.position.length() >= this.zoomedCameraPos.length() * 0.95) {
            this._beginExploding();
        } else {
            this.startTime = performance.now();
            this.state = 'zooming';
        }
    }

    _beginExploding() {
        this.group.scale.set(0, 0, 0);
        this.shardsGroup.visible = true;
        // Reset the shards-group scale in case a previous restore shrunk it.
        this.shardsGroup.scale.setScalar(1);
        this.startTime = performance.now();
        this.state = 'exploding';
    }

    /** Begin the reassembly + settle: shards converge to origin (shards-
     *  group scale → 0), globe scales back up, camera eases to the 3.17
     *  settle point. Snapshots the in-progress pose so a mid-zoom or mid-
     *  explosion interrupt still eases back cleanly. */
    restore() {
        if (this.state === 'idle' || this.state === 'restoring') return;
        // Do NOT hide shards — they'll converge + shrink as part of the
        // reassembly. The final hide happens at the end of restoring.
        this._restoreFromScale.copy(this.group.scale);
        this._restoreFromCameraPos.copy(this.camera.position);
        this._restoreFromShardScale = this.shardsGroup.scale.x;
        this.startTime = performance.now();
        this.state = 'restoring';
    }

    update() {
        if (this.state === 'idle') return;

        if (this.state === 'zooming') {
            const elapsed = performance.now() - this.startTime;
            if (elapsed >= ZOOM_OUT_MS) {
                this.camera.position.copy(this.zoomedCameraPos);
                this.camera.lookAt(0, 0, 0);
                this.controls.update();
                this._beginExploding();
                return;
            }
            const u = elapsed / ZOOM_OUT_MS;
            const eased = 1 - Math.pow(1 - u, 3);
            this.camera.position.lerpVectors(this.savedCameraPos, this.zoomedCameraPos, eased);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();
        } else if (this.state === 'exploding') {
            const t = (performance.now() - this.startTime) / 1000;
            // Closed-form drag integral: ∫₀ᵗ exp(-K·τ) dτ.
            // Multiplying a velocity by this gives the displacement under
            // exponential drag from time 0 to t.
            const dragInt = (1 - Math.exp(-SHATTER_DRAG_K * t)) / SHATTER_DRAG_K;
            const terminalY = SHATTER_GRAVITY / SHATTER_DRAG_K;

            for (const shard of this.shards) {
                // Drifting centerline under drag + gravity. The shard
                // bursts outward, decelerates, and settles toward a
                // gentle downward fall at terminal velocity.
                const x = shard.velocity.x * dragInt;
                const z = shard.velocity.z * dragInt;
                const y = (shard.velocity.y + terminalY) * dragInt - terminalY * t;

                // Wobble — spiralling sway around the centerline.
                const wob = Math.sin(t * shard.wobble.freq + shard.wobble.phase) * shard.wobble.amp;
                shard.mesh.position.set(
                    x + shard.wobble.axis.x * wob,
                    y + shard.wobble.axis.y * wob,
                    z + shard.wobble.axis.z * wob
                );

                shard.mesh.rotation.set(
                    shard.angularVelocity.x * t,
                    shard.angularVelocity.y * t,
                    shard.angularVelocity.z * t
                );
            }
            if (t > SHATTER_DURATION_S) {
                // Hand off to the reassembly + settle pass; keeps shards
                // visible so they can converge into the globe.
                this.restore();
            }
        } else if (this.state === 'restoring') {
            const t = performance.now() - this.startTime;
            if (t >= RESTORE_MS) {
                this.group.scale.copy(this.restScale);
                this.shardsGroup.visible = false;
                this.shardsGroup.scale.setScalar(1);
                this.camera.position.copy(this.restoreTargetCameraPos);
                this.camera.lookAt(0, 0, 0);
                this.controls.update();
                this.state = 'idle';
                return;
            }
            const u = t / RESTORE_MS;
            const eased = 1 - Math.pow(1 - u, 2);
            // Shards reassemble: shrinking the parent group's scale pulls
            // every shard toward the group origin (0,0,0) and shrinks them
            // to nothing simultaneously.
            this.shardsGroup.scale.setScalar(this._restoreFromShardScale * (1 - eased));
            this.group.scale.set(
                this._restoreFromScale.x + (this.restScale.x - this._restoreFromScale.x) * eased,
                this._restoreFromScale.y + (this.restScale.y - this._restoreFromScale.y) * eased,
                this._restoreFromScale.z + (this.restScale.z - this._restoreFromScale.z) * eased
            );
            this.camera.position.lerpVectors(this._restoreFromCameraPos, this.restoreTargetCameraPos, eased);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();
        }
    }
}
