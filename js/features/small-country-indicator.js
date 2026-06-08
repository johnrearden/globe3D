/**
 * Small-country indicator — a semi-opaque white disc plus a yellow pointer
 * arrow, placed at label height over tiny countries that are otherwise hard to
 * spot at a grazing angle. Owns the marker mesh and its lifecycle.
 */

const THREE = window.THREE;

const SMALL_INDICATOR_RADIUS = 1.0045;

export class SmallCountryIndicator {
    constructor({ globeManager, smallCountries } = {}) {
        this.globeManager = globeManager;
        this.smallCountries = smallCountries; // Set of country names
        this.mesh = null;                     // current marker group, or null
    }

    /** Show the marker for `countryName` (no-op unless it's a small country). */
    update(countryName) {
        this.remove();

        if (!this.smallCountries.has(countryName)) return;

        const record = this.globeManager.getCountryByName(countryName);
        if (!record || !record.centroid) return;

        const direction = record.centroid.clone().normalize();
        const group = new THREE.Group();
        group.position.copy(direction.clone().multiplyScalar(SMALL_INDICATOR_RADIUS));
        // Face outward from the globe centre: local +Z points at the camera,
        // +X is screen-right, +Y is screen-up.
        group.lookAt(direction.clone().multiplyScalar(SMALL_INDICATOR_RADIUS + 1));

        // Semi-opaque white filled disc.
        const discRadius = 0.02;
        const disc = new THREE.Mesh(
            new THREE.CircleGeometry(discRadius, 48),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.5,
                depthWrite: false
            })
        );
        disc.renderOrder = 0;
        group.add(disc);

        group.add(this._buildPointerArrow(discRadius));

        this.mesh = group;
        this.globeManager.getGlobe().add(group);
    }

    /** Remove and dispose the current marker, if any. */
    remove() {
        if (this.mesh) {
            this.globeManager.getGlobe().remove(this.mesh);
            this._dispose(this.mesh);
            this.mesh = null;
        }
    }

    _dispose(obj) {
        obj.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }

    // Yellow arrow lying in the local tangent (XY) plane, tip just outside the
    // disc edge and tail up-and-to-the-left at ~30° above horizontal. The parent
    // group is oriented so local +X is screen-right and +Y is screen-up.
    _buildPointerArrow(discRadius) {
        const arrow = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });

        const angle = Math.PI * 5 / 6;                 // 150° → upper-left
        const outward = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
        const tipDist = discRadius * 0.15;             // near the disc centre
        const shaftLen = discRadius * 0.65;            // stays inside the disc
        const headLen = 0.006;
        const headWidth = 0.006;
        const shaftWidth = 0.002;

        const tip = outward.clone().multiplyScalar(tipDist);
        const tail = outward.clone().multiplyScalar(tipDist + shaftLen);
        const dir = tip.clone().sub(tail).normalize();  // points at the country
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        // Shaft (thin box) from the tail to the base of the head.
        const headBase = tip.clone().add(dir.clone().multiplyScalar(-headLen));
        const shaftCenter = tail.clone().add(headBase).multiplyScalar(0.5);
        const shaft = new THREE.Mesh(
            new THREE.BoxGeometry(shaftWidth, shaftLen - headLen, 0.0005),
            mat
        );
        shaft.position.copy(shaftCenter);
        shaft.quaternion.copy(quat);
        shaft.renderOrder = 1;

        // Head (cone) with its apex at the tip.
        const head = new THREE.Mesh(
            new THREE.ConeGeometry(headWidth / 2, headLen, 16),
            mat
        );
        head.position.copy(tip.clone().add(dir.clone().multiplyScalar(-headLen / 2)));
        head.quaternion.copy(quat);
        head.renderOrder = 1;

        arrow.add(shaft);
        arrow.add(head);
        arrow.position.z = 0.001;  // float just above the disc, toward the camera
        return arrow;
    }
}
