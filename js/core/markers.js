/**
 * Marker Layer — reusable point markers at arbitrary lat/lng on the globe.
 *
 * Each marker is a small dot sprite (a black dot ringed by a circle) that lives
 * inside the globe group so it rotates with the surface, plus an optional
 * always-legible name label (also a sprite, so it stays upright at any zoom).
 * General-purpose; the capitals quiz uses it to mark a capital's location.
 */

import { canvasFont } from '../utils/theme.js';

import * as THREE from 'three';

// Drop the dot just above the country mesh (radius 1.0008) so it never sinks
// into the fill. Values carried over from the previous inline capital marker.
const DOT_HEIGHT = 0.015;
const DOT_SCALE = 0.0055;

// The name label sits at the same surface point as the dot. Its sprite is
// bottom-anchored (center.y = 0) so the text floats above the dot. Sized to
// roughly match a medium country label (height 0.05, 4:1 canvas → width 0.20).
const LABEL_HEIGHT = 0.05;
const LABEL_ASPECT = 512 / 128;

export class MarkerLayer {
    /**
     * @param {import('./globe.js').GlobeManager} globeManager - owns getGlobe()
     *        and latLngToVector3().
     */
    constructor(globeManager) {
        this.globeManager = globeManager;
        this.markers = [];        // [{lat, lng, dot, labelSprite}]
        this._last = null;        // most recently placed marker (target of convenience methods)
        this._dotTexture = null;  // shared, built once
    }

    /**
     * Place a dot marker at a lat/lng. Returns a marker handle (also tracked as
     * the layer's "last" marker so the convenience label methods can target it).
     * @param {number} lat
     * @param {number} lng
     * @param {{label?: string}} [opts] - optional name label to show immediately
     * @returns {Object|null} marker handle, or null if the globe isn't ready
     */
    place(lat, lng, { label = null } = {}) {
        const globe = this.globeManager.getGlobe();
        if (!globe) return null;

        const material = new THREE.SpriteMaterial({
            map: this._dot(),
            depthTest: false,
            transparent: true
        });
        const dot = new THREE.Sprite(material);
        dot.scale.setScalar(DOT_SCALE);
        dot.renderOrder = 999; // draw on top of the country fills
        dot.position.copy(this.globeManager.latLngToVector3(lat, lng, 1.0, DOT_HEIGHT));
        globe.add(dot);

        const marker = { lat, lng, dot, labelSprite: null };
        this.markers.push(marker);
        this._last = marker;

        if (label) this.setLabel(label, marker);
        return marker;
    }

    /**
     * Set (or replace) a marker's name label. Defaults to the last placed marker.
     * The label is created hidden — call showLabel() to reveal it.
     * @param {string} text
     * @param {Object} [marker]
     */
    setLabel(text, marker = this._last) {
        if (!marker) return;
        const globe = this.globeManager.getGlobe();
        if (!globe) return;

        if (marker.labelSprite) {
            if (marker.labelSprite.material.map) marker.labelSprite.material.map.dispose();
            marker.labelSprite.material.dispose();
            globe.remove(marker.labelSprite);
            marker.labelSprite = null;
        }

        const material = new THREE.SpriteMaterial({
            map: this._textTexture(text),
            depthTest: false,
            transparent: true
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(LABEL_HEIGHT * LABEL_ASPECT, LABEL_HEIGHT, 1);
        // Bottom-anchor so the label floats above the dot rather than over it.
        sprite.center.set(0.5, 0);
        sprite.renderOrder = 1000;
        sprite.position.copy(this.globeManager.latLngToVector3(marker.lat, marker.lng, 1.0, DOT_HEIGHT));
        sprite.visible = false;
        globe.add(sprite);
        marker.labelSprite = sprite;
    }

    /** Reveal a marker's name label (default: the last placed marker). */
    showLabel(marker = this._last) {
        if (marker && marker.labelSprite) marker.labelSprite.visible = true;
    }

    /** Hide a marker's name label (default: the last placed marker). */
    hideLabel(marker = this._last) {
        if (marker && marker.labelSprite) marker.labelSprite.visible = false;
    }

    /** Remove every marker (dots + labels) from the globe and dispose them. */
    clear() {
        const globe = this.globeManager.getGlobe();
        this.markers.forEach(({ dot, labelSprite }) => {
            for (const obj of [dot, labelSprite]) {
                if (!obj) continue;
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
                if (globe) globe.remove(obj);
            }
        });
        this.markers = [];
        this._last = null;
    }

    /** Alias for clear(). */
    clearAll() {
        this.clear();
    }

    /**
     * Build (once) the dot texture: a small filled dot ringed by a circle.
     */
    _dot() {
        if (this._dotTexture) return this._dotTexture;
        const S = 64;
        const c = S / 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';

        // Outer ring with a transparent gap to the inner dot.
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(c, c, 24, 0, Math.PI * 2);
        ctx.stroke();

        // Inner filled dot.
        ctx.beginPath();
        ctx.arc(c, c, 9, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        this._dotTexture = tex;
        return tex;
    }

    /**
     * Render label text to a canvas texture. Mirrors LabelManager.createTextLabel:
     * white 32px Arial on a 512×128 transparent canvas, no mipmaps (mipmapping
     * antialiased text produces visible halos at distance).
     */
    _textTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = canvasFont(32);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }
}
