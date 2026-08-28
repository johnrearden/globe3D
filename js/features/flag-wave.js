/**
 * Flag wave animation for the Identify-the-Flag quiz.
 *
 * Displaces a flag plane's vertices along Z with Perlin noise. Injected into
 * IdentifyFlagQuiz, which owns the flag mesh.
 *
 * The noise came from a `window.noise` global set by an inline script in
 * index.html, which meant this only worked inside that one document — and the
 * Astro app is where the flag quiz now runs. It is `js/utils/perlin.js` instead.
 */

import { perlin2 } from '../utils/perlin.js';

export function animateFlagWave(mesh, originalPositions, time) {
    if (!mesh || !originalPositions) return;

    const positions = mesh.geometry.attributes.position;
    const coeff = 72;
    const coeff2 = 65;
    const gap = 10;
    const spacing = 30;

    for (let i = 0; i < positions.count; i++) {
        const x = originalPositions[i * 3];
        const y = originalPositions[i * 3 + 1];

        // Perlin noise on Z gives the rippling wave.
        positions.array[i * 3 + 2] = 1 +
            (spacing / 25) *
            perlin2(
                x * (gap / coeff) + time,
                y * (gap / coeff2)
            );
    }

    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
}
