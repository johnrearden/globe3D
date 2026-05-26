/**
 * Pinball Animation
 *
 * Triggered when the player finishes a quiz with 100% correct. The
 * globe immediately begins bouncing inside an imaginary box aligned
 * with the camera's view direction — short in the camera-tangent
 * axes (90% of the narrower viewport dimension) and much deeper
 * along the view axis, so the globe is free to recede well past
 * origin. The camera concurrently zooms out so the bouncing reveals
 * itself as it pulls back. On each wall hit the globe squashes along
 * the struck axis (volume-preserving deformation) and picks up a
 * rolling spin whose axis is `n × v_tangent` (in the wall's plane,
 * perpendicular to the tangent velocity component).
 *
 *   idle → bouncing (+ concurrent camera zoom-out) → restoring → idle
 *
 * Box bounds, zoom distance and the view-aligned basis are computed
 * at start() from the current viewport aspect and camera direction,
 * so the layout matches the user's device and current view. A mid-
 * animation resize doesn't refresh those — the animation is short
 * enough that this isn't worth the wiring.
 */

const THREE = window.THREE;

const BOUNCE_SPEED = 21.6;             // units/s, magnitude of velocity
const GLOBE_RADIUS = 1.0008;           // matches country-mesh radius
const CUBE_HALF_FRAC = 0.45;           // 90% / 2 of the narrower viewport
const CUBE_DEPTH_MULTIPLIER = 3.5;     // far-wall depth relative to half-edge
const APPARENT_FRAC = 0.10;            // globe diameter / canvas width
const SQUASH_Y = 0.81;                 // depth of compression at impact
const SQUASH_MS = 110;
const UNSQUASH_MS = 110;
const SPIN_MAGNITUDE = 8.0;            // rad/s applied on each wall hit
const ZOOM_OUT_MS = 700;
const RESTORE_MS = 600;
const RESTORE_CAMERA_DISTANCE = 3.17;  // camera distance to settle at after restore
const MAX_CAMERA_DISTANCE = 10;        // matches OrbitControls.maxDistance
const MAX_FRAME_DT = 0.05;             // clamp dt against tab-suspend spikes

export class PinballAnimation {
    constructor({ globeGroup, camera, controls, renderer, initialCameraDistance }) {
        this.group = globeGroup;
        this.camera = camera;
        this.controls = controls;
        this.renderer = renderer;
        this.initialCameraDistance = initialCameraDistance;

        this.state = 'idle';            // 'bouncing' | 'restoring'
        this.startTime = 0;
        this.cameraStartTime = 0;
        this.lastFrameTime = 0;
        this.bounceDurationMs = Infinity;

        this.restScale = globeGroup.scale.clone();
        this.restPos = globeGroup.position.clone();
        this.restQuaternion = globeGroup.quaternion.clone();

        this.savedCameraPos = camera.position.clone();
        this.zoomedCameraPos = camera.position.clone();
        this._restoreFromCameraPos = camera.position.clone();
        this._restoreFromPos = globeGroup.position.clone();
        this._restoreFromScale = globeGroup.scale.clone();
        this._restoreFromQuaternion = globeGroup.quaternion.clone();

        // View-aligned basis: basisZ points toward the camera. position
        // and velocity are tracked in this local frame so the "depth"
        // axis follows the user's actual view direction.
        this.basisX = new THREE.Vector3(1, 0, 0);
        this.basisY = new THREE.Vector3(0, 1, 0);
        this.basisZ = new THREE.Vector3(0, 0, 1);

        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3(); // world frame

        this.halfX = 1;
        this.halfY = 1;
        this.zNear = 1;                 // +Z bound (toward camera)
        this.zFar = 1;                  // |-Z| bound (away from camera)

        // Squash state — axis is a name in the LOCAL frame ('x' | 'y' | 'z').
        // When the globe has accumulated spin its local axes are rotated
        // relative to the box, so the squash axis is technically misaligned
        // by the spin angle; at the zoom-out distance this is barely visible
        // and reads as a generic "impact deformation".
        this.squashAxis = null;
        this.squashStart = 0;

        // Scratch vectors so update() doesn't allocate every frame.
        this._worldPos = new THREE.Vector3();
        this._deltaQuat = new THREE.Quaternion();
        this._spinAxis = new THREE.Vector3();
    }

    get running() {
        return this.state !== 'idle';
    }

    /** Compute the zoom-out distance, view-aligned basis, and box bounds
     *  for the current viewport and camera direction. */
    _computeBounds() {
        const canvas = this.renderer.domElement;
        const canvasW = canvas.clientWidth || window.innerWidth;
        const canvasH = canvas.clientHeight || window.innerHeight;
        const aspect = canvasW / canvasH;
        const fovV = (this.camera.fov * Math.PI) / 180;
        const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);

        // Solve for D such that globe diameter == APPARENT_FRAC of canvas width:
        //   diameter_world / width_world = (2R) / (2D·tan(fovH/2)) = APPARENT_FRAC
        //   ⇒ D = R / (APPARENT_FRAC · tan(fovH/2))
        const targetDist = GLOBE_RADIUS / (APPARENT_FRAC * Math.tan(fovH / 2));
        const D = Math.min(targetDist, MAX_CAMERA_DISTANCE);

        const dir = this.camera.position.clone();
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        this.zoomedCameraPos.copy(dir).multiplyScalar(D);

        // View-aligned basis: basisZ toward the camera. Pick a stable
        // reference for the tangent axes (avoid colinearity if the
        // camera is nearly straight along world up).
        this.basisZ.copy(dir);
        const refUp = Math.abs(this.basisZ.y) > 0.99
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0);
        this.basisX.crossVectors(refUp, this.basisZ).normalize();
        this.basisY.crossVectors(this.basisZ, this.basisX).normalize();

        // Tangent half-edges at depth D (90% of narrower visible dim / 2).
        const worldH = 2 * D * Math.tan(fovV / 2);
        const worldW = aspect * worldH;
        const narrow = Math.min(worldW, worldH);
        const half = CUBE_HALF_FRAC * narrow;
        this.halfX = half;
        this.halfY = half;
        // Asymmetric depth: small extent toward camera (keeps the globe
        // from punching through), large extent away (the "much deeper").
        this.zNear = half;
        this.zFar = half * CUBE_DEPTH_MULTIPLIER;
    }

    /** Transform a local-frame vector into world coords, writing into `out`. */
    _localToWorld(local, out) {
        return out.set(0, 0, 0)
            .addScaledVector(this.basisX, local.x)
            .addScaledVector(this.basisY, local.y)
            .addScaledVector(this.basisZ, local.z);
    }

    /** @param {number} [durationMs] If supplied, the animation auto-restores
     *  after that many ms in the `bouncing` state. Omit for indefinite
     *  bouncing (caller is responsible for calling restore()). */
    start(durationMs) {
        if (this.state !== 'idle') return;
        this.bounceDurationMs = (typeof durationMs === 'number') ? durationMs : Infinity;

        // Snapshot rest state so restore() always returns exactly here.
        // savedCameraPos is the *target* the restore eases to; we set it
        // to RESTORE_CAMERA_DISTANCE along the current view direction so
        // the camera always settles at the same zoom regardless of where
        // the user happened to be looking from.
        this.restScale.copy(this.group.scale);
        this.restPos.copy(this.group.position);
        this.restQuaternion.copy(this.group.quaternion);
        const camDir = this.camera.position.clone();
        if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, 1);
        camDir.normalize();
        this.savedCameraPos.copy(camDir).multiplyScalar(RESTORE_CAMERA_DISTANCE);

        this._computeBounds();

        // Uniformly-random unit direction in the local (view-aligned)
        // frame × constant speed.
        const u = Math.random();
        const w = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * w - 1);
        this.velocity.set(
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta)
        ).multiplyScalar(BOUNCE_SPEED);
        this.position.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.squashAxis = null;

        this.startTime = performance.now();
        this.cameraStartTime = this.startTime;
        this.lastFrameTime = this.startTime;
        this.state = 'bouncing';
    }

    restore() {
        if (this.state === 'idle' || this.state === 'restoring') return;
        this._restoreFromCameraPos.copy(this.camera.position);
        this._restoreFromPos.copy(this.group.position);
        this._restoreFromScale.copy(this.group.scale);
        this._restoreFromQuaternion.copy(this.group.quaternion);
        this.startTime = performance.now();
        this.state = 'restoring';
    }

    /** Per-axis scale multipliers for the current squash state. Returns
     *  (1,1,1) when no squash is active. Auto-clears squashAxis once the
     *  squash+unsquash window has elapsed. */
    _squashScale(now, out) {
        out.set(1, 1, 1);
        if (!this.squashAxis) return out;

        const t = now - this.squashStart;
        let scaleAxis;
        if (t < SQUASH_MS) {
            const u = t / SQUASH_MS;
            const eased = 1 - Math.pow(1 - u, 2);
            scaleAxis = 1 + (SQUASH_Y - 1) * eased;
        } else if (t < SQUASH_MS + UNSQUASH_MS) {
            const u = (t - SQUASH_MS) / UNSQUASH_MS;
            const eased = u * u;
            scaleAxis = SQUASH_Y + (1 - SQUASH_Y) * eased;
        } else {
            this.squashAxis = null;
            return out;
        }
        const xz = 1 / Math.sqrt(scaleAxis);
        if (this.squashAxis === 'x') out.set(scaleAxis, xz, xz);
        else if (this.squashAxis === 'y') out.set(xz, scaleAxis, xz);
        else out.set(xz, xz, scaleAxis);
        return out;
    }

    /** Detect wall crossings (in local frame), clamp position, reflect
     *  velocity, trigger squash on the hit axis, and set an angular
     *  velocity whose axis is parallel to the wall (n × v_tangent). */
    _resolveCollisions(now) {
        const bounds = [
            { axis: 'x', min: -this.halfX + GLOBE_RADIUS, max: this.halfX - GLOBE_RADIUS },
            { axis: 'y', min: -this.halfY + GLOBE_RADIUS, max: this.halfY - GLOBE_RADIUS },
            { axis: 'z', min: -this.zFar + GLOBE_RADIUS, max: this.zNear - GLOBE_RADIUS }
        ];
        for (const b of bounds) {
            let normalSign = 0;
            if (this.position[b.axis] > b.max && this.velocity[b.axis] > 0) {
                this.position[b.axis] = b.max;
                this.velocity[b.axis] = -this.velocity[b.axis];
                normalSign = -1;
            } else if (this.position[b.axis] < b.min && this.velocity[b.axis] < 0) {
                this.position[b.axis] = b.min;
                this.velocity[b.axis] = -this.velocity[b.axis];
                normalSign = 1;
            }
            if (normalSign !== 0) {
                this.squashAxis = b.axis;
                this.squashStart = now;
                this._applySpin(b.axis, normalSign);
            }
        }
    }

    /** Set angular velocity to a rolling-spin axis: perpendicular to both
     *  the wall normal and the tangent velocity, lying in the wall plane.
     *  In local frame: spin_local = n × v_tangent. Converted to world. */
    _applySpin(axis, normalSign) {
        // Local-frame normal & tangent velocity. (velocity has already been
        // reflected, but its tangent component matches the pre-reflection
        // tangent — reflection only negates the normal component.)
        const nx = axis === 'x' ? normalSign : 0;
        const ny = axis === 'y' ? normalSign : 0;
        const nz = axis === 'z' ? normalSign : 0;
        const vDotN = this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz;
        const vtx = this.velocity.x - nx * vDotN;
        const vty = this.velocity.y - ny * vDotN;
        const vtz = this.velocity.z - nz * vDotN;
        // Cross product n × v_tangent.
        const sx = ny * vtz - nz * vty;
        const sy = nz * vtx - nx * vtz;
        const sz = nx * vty - ny * vtx;
        const len = Math.hypot(sx, sy, sz);
        if (len < 1e-6) {
            this.angularVelocity.set(0, 0, 0);
            return;
        }
        this._spinAxis.set(sx / len, sy / len, sz / len);
        // Convert local-frame spin axis into world frame for application
        // to the group's quaternion.
        this._localToWorld(this._spinAxis, this.angularVelocity);
        this.angularVelocity.multiplyScalar(SPIN_MAGNITUDE);
    }

    update() {
        if (this.state === 'idle') return;
        const now = performance.now();

        if (this.state === 'bouncing') {
            // Auto-restore once the configured duration has elapsed.
            if (now - this.startTime >= this.bounceDurationMs) {
                this.restore();
                return;
            }
            // Camera zoom-out runs concurrently with the bouncing physics
            // for the first ZOOM_OUT_MS, then sits at the final pose.
            const camU = Math.min(1, (now - this.cameraStartTime) / ZOOM_OUT_MS);
            const camEased = 1 - Math.pow(1 - camU, 3);
            this.camera.position.lerpVectors(this.savedCameraPos, this.zoomedCameraPos, camEased);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();

            const dt = Math.min(MAX_FRAME_DT, (now - this.lastFrameTime) / 1000);
            this.lastFrameTime = now;

            this.position.addScaledVector(this.velocity, dt);
            this._resolveCollisions(now);

            // Integrate rotation by the current world-frame angular velocity.
            const angSpeed = this.angularVelocity.length();
            if (angSpeed > 1e-6 && dt > 0) {
                this._spinAxis.copy(this.angularVelocity).divideScalar(angSpeed);
                this._deltaQuat.setFromAxisAngle(this._spinAxis, angSpeed * dt);
                this.group.quaternion.premultiply(this._deltaQuat);
            }

            // Local position → world; apply to group along with squash scale.
            this._localToWorld(this.position, this._worldPos);
            this.group.position.copy(this._worldPos);

            const sq = this._squashScale(now, this._spinAxis); // reuse scratch
            this.group.scale.set(
                this.restScale.x * sq.x,
                this.restScale.y * sq.y,
                this.restScale.z * sq.z
            );
            return;
        }

        if (this.state === 'restoring') {
            const t = now - this.startTime;
            if (t >= RESTORE_MS) {
                this.group.scale.copy(this.restScale);
                this.group.position.copy(this.restPos);
                this.group.quaternion.copy(this.restQuaternion);
                this.camera.position.copy(this.savedCameraPos);
                this.camera.lookAt(0, 0, 0);
                this.controls.update();
                this.state = 'idle';
                this.squashAxis = null;
                return;
            }
            const u = t / RESTORE_MS;
            const eased = 1 - Math.pow(1 - u, 2);
            this.group.position.lerpVectors(this._restoreFromPos, this.restPos, eased);
            this.group.scale.set(
                this._restoreFromScale.x + (this.restScale.x - this._restoreFromScale.x) * eased,
                this._restoreFromScale.y + (this.restScale.y - this._restoreFromScale.y) * eased,
                this._restoreFromScale.z + (this.restScale.z - this._restoreFromScale.z) * eased
            );
            this.group.quaternion.slerpQuaternions(
                this._restoreFromQuaternion, this.restQuaternion, eased
            );
            this.camera.position.lerpVectors(this._restoreFromCameraPos, this.savedCameraPos, eased);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();
        }
    }
}
