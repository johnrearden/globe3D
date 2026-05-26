/**
 * Bounce Animation
 *
 * Drops the globe group ~100 px under gravity, squashes it on impact,
 * then rebounds in a damped sequence (3 bounces) before settling back
 * to rest. Operates entirely on the parent group's transform
 * (position + non-uniform scale) so labels, axis lines and country
 * mesh deform together.
 *
 * The squash is classic cartoon squash-and-stretch: Y is compressed and
 * X/Z expand to preserve apparent volume. A downward translation offsets
 * the squash so the bottom of the sphere appears to hold against the
 * "ground" while the top compresses down toward it — the visual cue of
 * "lower section compressing".
 *
 * Trigger: `B` key, or window.bounceGlobe().
 */

const FALL_PIXELS = 100;
const FALL_MS_AT_1G = 500;       // baseline drop time at "natural" gravity
const GRAVITY_MULTIPLIER = 2;    // doubled gravity → t scales by 1/sqrt(2)
const BASE_DROP_MS = FALL_MS_AT_1G / Math.sqrt(GRAVITY_MULTIPLIER); // ≈354
const SQUASH_MS = 110;
const UNSQUASH_MS = 110;

// Peak heights between bounces, as fractions of FALL_PIXELS above the
// ground line. First entry is the starting peak (rest). The globe drops
// from each peak to the ground, squashes, then rises to the next peak.
// Last entry brings the globe back to rest so it doesn't end mid-air.
const BOUNCE_PEAKS = [1.0, 0.55, 0.30, 1.0];

const SQUASH_Y = 0.81;       // Y-scale at peak compression (~19% squash)
const SPHERE_RADIUS = 1.0008; // matches the country-mesh radius

// Camera settles here while the bounce plays, and stays here afterward.
const TARGET_CAMERA_DISTANCE = 3.17;
const ZOOM_MS = 700;         // camera ease into TARGET_CAMERA_DISTANCE

export class BounceAnimation {
    constructor({ globeGroup, camera, renderer, controls }) {
        this.group = globeGroup;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;

        this.running = false;
        this.startTime = 0;
        this.fallDistWorld = 0;
        this.phases = [];

        // Capture rest pose so we always restore exactly, even if
        // something else has nudged position/scale between bounces.
        this.restY = globeGroup.position.y;
        this.restScale = globeGroup.scale.clone();

        // Camera zoom state — the bounce zooms to TARGET_CAMERA_DISTANCE
        // along the user's current view direction at start, then stays
        // there once the animation completes.
        this.fromCameraPos = camera.position.clone();
        this.targetCameraPos = camera.position.clone();
    }

    /** Convert a vertical pixel distance into scene units at the given
     *  camera distance, so the bounce reads as ~100 px regardless of zoom. */
    _pixelsToWorld(px, dist) {
        const fovRad = (this.camera.fov * Math.PI) / 180;
        const worldHeightAtGlobe = 2 * dist * Math.tan(fovRad / 2);
        const canvasHeight = this.renderer.domElement.clientHeight || window.innerHeight;
        return (px / canvasHeight) * worldHeightAtGlobe;
    }

    /** Build the sequence of phases for the full damped bounce.
     *  Each phase has: kind, duration, end (cumulative), and for
     *  drop/rise also from/to (height fractions of FALL_PIXELS). */
    _buildPhases() {
        const phases = [];
        for (let i = 0; i < BOUNCE_PEAKS.length - 1; i++) {
            const from = BOUNCE_PEAKS[i];
            const to = BOUNCE_PEAKS[i + 1];
            phases.push({ kind: 'drop', from, to: 0 });
            phases.push({ kind: 'squash' });
            phases.push({ kind: 'unsquash' });
            phases.push({ kind: 'rise', from: 0, to });
        }
        // Duration ∝ sqrt(height) under constant gravity.
        let t = 0;
        for (const p of phases) {
            if (p.kind === 'drop' || p.kind === 'rise') {
                p.duration = BASE_DROP_MS * Math.sqrt(Math.abs(p.to - p.from));
            } else if (p.kind === 'squash') {
                p.duration = SQUASH_MS;
            } else {
                p.duration = UNSQUASH_MS;
            }
            t += p.duration;
            p.end = t;
        }
        return phases;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.startTime = performance.now();
        // Fall is sized for the settled camera distance so the bounce
        // reads as ~100 px once the camera has eased in.
        this.fallDistWorld = this._pixelsToWorld(FALL_PIXELS, TARGET_CAMERA_DISTANCE);
        // Refresh rest pose in case the group moved since construction.
        this.restY = this.group.position.y;
        this.restScale.copy(this.group.scale);
        this.phases = this._buildPhases();

        // Snapshot the camera's current pose and compute the settle target
        // along the same view direction.
        this.fromCameraPos.copy(this.camera.position);
        const dir = this.camera.position.clone();
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        this.targetCameraPos.copy(dir).multiplyScalar(TARGET_CAMERA_DISTANCE);
    }

    /** Per-frame update. Call from the render loop. */
    update() {
        if (!this.running) return;

        const elapsed = performance.now() - this.startTime;

        // Camera lerp from fromCameraPos to targetCameraPos over the first
        // ZOOM_MS, then snap and stop touching the camera. Camera stays at
        // TARGET_CAMERA_DISTANCE after the bounce completes.
        if (elapsed <= ZOOM_MS) {
            const u = Math.min(1, elapsed / ZOOM_MS);
            const eased = 1 - Math.pow(1 - u, 3);
            this.camera.position.lerpVectors(this.fromCameraPos, this.targetCameraPos, eased);
            this.camera.lookAt(0, 0, 0);
            if (this.controls) this.controls.update();
        }

        // Locate current phase.
        let phaseStart = 0;
        let phase = null;
        for (const p of this.phases) {
            if (elapsed < p.end) {
                phase = p;
                break;
            }
            phaseStart = p.end;
        }

        if (!phase) {
            this.group.position.y = this.restY;
            this.group.scale.copy(this.restScale);
            this.running = false;
            return;
        }

        const u = (elapsed - phaseStart) / phase.duration;
        let heightFrac = 1; // 0 = ground, 1 = rest height
        let scaleY = 1;
        let scaleXZ = 1;

        if (phase.kind === 'drop') {
            // Accelerating fall: ease-in (quadratic) — gravity.
            const eased = u * u;
            heightFrac = phase.from + (phase.to - phase.from) * eased;
        } else if (phase.kind === 'rise') {
            // Decelerating rise: ease-out — gravity again, but inverted.
            const eased = 1 - Math.pow(1 - u, 2);
            heightFrac = phase.from + (phase.to - phase.from) * eased;
        } else if (phase.kind === 'squash') {
            // Compress at ground: scale Y 1 -> SQUASH_Y, X/Z preserve volume.
            const eased = 1 - Math.pow(1 - u, 2);
            scaleY = 1 + (SQUASH_Y - 1) * eased;
            scaleXZ = 1 / Math.sqrt(scaleY);
            heightFrac = 0;
        } else { // unsquash
            const eased = u * u;
            scaleY = SQUASH_Y + (1 - SQUASH_Y) * eased;
            scaleXZ = 1 / Math.sqrt(scaleY);
            heightFrac = 0;
        }

        let yOffset = -this.fallDistWorld * (1 - heightFrac);
        if (phase.kind === 'squash' || phase.kind === 'unsquash') {
            // Hold the bottom against the floor as the sphere compresses.
            yOffset -= SPHERE_RADIUS * (1 - scaleY);
        }

        this.group.position.y = this.restY + yOffset;
        this.group.scale.set(
            this.restScale.x * scaleXZ,
            this.restScale.y * scaleY,
            this.restScale.z * scaleXZ
        );
    }
}
