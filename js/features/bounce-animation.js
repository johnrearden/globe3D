/**
 * Bounce Animation
 *
 * Drops the globe group ~100 px under gravity, squashes it on impact,
 * then rebounds back to rest. Operates entirely on the parent group's
 * transform (position + non-uniform scale) so labels, axis lines and
 * country mesh deform together.
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
const FALL_MS = 500;     // gravity-accelerated drop
const SQUASH_MS = 110;   // peak compression
const UNSQUASH_MS = 110; // expand back to round
const RISE_MS = 480;     // launch back up, decelerating

const SQUASH_Y = 0.81;       // Y-scale at peak compression (~19% squash)
const SPHERE_RADIUS = 1.0008; // matches the country-mesh radius

export class BounceAnimation {
    constructor({ globeGroup, camera, renderer }) {
        this.group = globeGroup;
        this.camera = camera;
        this.renderer = renderer;

        this.running = false;
        this.startTime = 0;
        this.fallDistWorld = 0;

        // Capture rest pose so we always restore exactly, even if
        // something else has nudged position/scale between bounces.
        this.restY = globeGroup.position.y;
        this.restScale = globeGroup.scale.clone();
    }

    /** Convert a vertical pixel distance into scene units at the current
     *  camera distance, so the bounce reads as ~100 px regardless of zoom. */
    _pixelsToWorld(px) {
        const dist = this.camera.position.length();
        const fovRad = (this.camera.fov * Math.PI) / 180;
        const worldHeightAtGlobe = 2 * dist * Math.tan(fovRad / 2);
        const canvasHeight = this.renderer.domElement.clientHeight || window.innerHeight;
        return (px / canvasHeight) * worldHeightAtGlobe;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.startTime = performance.now();
        this.fallDistWorld = this._pixelsToWorld(FALL_PIXELS);
        // Refresh rest pose in case the group moved since construction.
        this.restY = this.group.position.y;
        this.restScale.copy(this.group.scale);
    }

    /** Per-frame update. Call from the render loop. */
    update() {
        if (!this.running) return;

        const elapsed = performance.now() - this.startTime;
        const tFall = FALL_MS;
        const tSquash = tFall + SQUASH_MS;
        const tUnsquash = tSquash + UNSQUASH_MS;
        const tRise = tUnsquash + RISE_MS;

        let yOffset = 0;
        let scaleY = 1;
        let scaleXZ = 1;

        if (elapsed < tFall) {
            // Fall: ease-in (quadratic) — accelerating like gravity.
            const u = elapsed / tFall;
            yOffset = -this.fallDistWorld * (u * u);
        } else if (elapsed < tSquash) {
            // Compress: scale Y 1 -> SQUASH_Y, X/Z grow to preserve volume.
            // Hold the bottom of the sphere at -fallDist so the visual impression
            // is the top coming down to meet a flattened lower hemisphere.
            const u = (elapsed - tFall) / SQUASH_MS;
            const eased = 1 - Math.pow(1 - u, 2); // ease-out
            scaleY = 1 + (SQUASH_Y - 1) * eased;
            scaleXZ = 1 / Math.sqrt(scaleY);
            yOffset = -this.fallDistWorld - SPHERE_RADIUS * (1 - scaleY);
        } else if (elapsed < tUnsquash) {
            // Decompress: scale back to 1 (sphere becomes round again).
            const u = (elapsed - tSquash) / UNSQUASH_MS;
            const eased = u * u; // ease-in
            scaleY = SQUASH_Y + (1 - SQUASH_Y) * eased;
            scaleXZ = 1 / Math.sqrt(scaleY);
            yOffset = -this.fallDistWorld - SPHERE_RADIUS * (1 - scaleY);
        } else if (elapsed < tRise) {
            // Rise: ease-out — launches fast, decelerates to rest.
            const u = (elapsed - tUnsquash) / RISE_MS;
            const eased = 1 - Math.pow(1 - u, 2);
            yOffset = -this.fallDistWorld * (1 - eased);
        } else {
            // Done.
            this.group.position.y = this.restY;
            this.group.scale.copy(this.restScale);
            this.running = false;
            return;
        }

        this.group.position.y = this.restY + yOffset;
        this.group.scale.set(
            this.restScale.x * scaleXZ,
            this.restScale.y * scaleY,
            this.restScale.z * scaleXZ
        );
    }
}
