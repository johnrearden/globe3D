/**
 * Flag wave animation for the Identify-the-Flag quiz.
 *
 * Displaces a flag plane's vertices along Z with Perlin noise. Uses the global
 * `window.noise` (the inline Perlin library set up in index.html). Injected into
 * IdentifyFlagQuiz, which owns the flag mesh.
 */

export function animateFlagWave(mesh, originalPositions, time) {
    if (!mesh || !originalPositions) return;

    const noise = window.noise;
    if (!noise) return;

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
            noise.perlin2(
                x * (gap / coeff) + time,
                y * (gap / coeff2)
            );
    }

    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
}
