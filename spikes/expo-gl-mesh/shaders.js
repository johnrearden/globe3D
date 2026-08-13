/**
 * Verbatim copies of the globe's GLSL from js/core/globe.js.
 *
 * Copied rather than imported: the point of the spike is to find out whether
 * expo-gl compiles and runs the *real* shaders (custom attributes, a palette
 * texture lookup, a fragment-shader `discard`), and a simplified stand-in would
 * prove nothing. If the answer is yes, these move into the shared globe engine
 * behind GlobeBridge (stage A6) and this file goes away.
 */

export const VERTEX_SHADER = /* glsl */`
attribute float aCountryId;
varying float vCountryId;
varying vec3 vViewPos;
varying vec3 vViewNormal;
varying vec3 vLocalPos;

void main() {
    vCountryId = aCountryId;
    vLocalPos = position;
    vec3 nrmLocal = normalize(position);
    vViewNormal = normalize(normalMatrix * nrmLocal);
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = viewPos.xyz;
    gl_Position = projectionMatrix * viewPos;
}
`;

export const FRAGMENT_SHADER = /* glsl */`
precision highp float;

uniform sampler2D uPaletteTex;
uniform float uPaletteW;
uniform float uSelectedId;
uniform vec3 uSelectedColor;
uniform float uSelGradient;
uniform vec3 uSelectedCentroid;
uniform float uSelectedRadius;
uniform float uFlashId;
uniform vec3 uFlashColor;
uniform float uFlashAlpha;
uniform float uShowCountries;
uniform vec3 uOceanColor;
uniform vec3 uAmbient;
uniform float uDiffuse;
uniform vec3 uLightDir;
uniform float uSpecStrength;
uniform float uShininess;
uniform vec3 uSpecColor;
uniform float uOceanSpecBoost;

varying float vCountryId;
varying vec3 vViewPos;
varying vec3 vViewNormal;
varying vec3 vLocalPos;

void main() {
    float id = vCountryId;

    vec3 color = uOceanColor;
    if (id > 0.5) {
        vec4 entry = texture2D(uPaletteTex, vec2((id + 0.5) / uPaletteW, 0.5));
        color = mix(uOceanColor, entry.rgb, entry.a);
    }

    if (uShowCountries < 0.5) {
        color = uOceanColor;
    }

    float sel = (id > 0.5 && uSelectedId > 0.5 && abs(id - uSelectedId) < 0.5) ? 1.0 : 0.0;
    color = mix(color, uSelectedColor, sel);

    float gradT = clamp(distance(vLocalPos, uSelectedCentroid) / (max(uSelectedRadius, 0.03) * 0.82), 0.0, 1.0);
    color *= mix(1.0, mix(1.12, 0.28, gradT), sel * uSelGradient);

    if (id > 0.5 && uFlashId > 0.5 && abs(id - uFlashId) < 0.5) {
        color = mix(color, uFlashColor, uFlashAlpha);
    }

    vec3 N = normalize(vViewNormal);
    vec3 V = normalize(-vViewPos);
    vec3 L = normalize(uLightDir);
    float ndotl = max(dot(N, L), 0.0);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), uShininess) * ndotl;
    float specStrength = (id < 0.5) ? uSpecStrength * uOceanSpecBoost : uSpecStrength;

    vec3 lit = color * (uAmbient + uDiffuse * ndotl) + uSpecColor * (spec * specStrength);

    gl_FragColor = vec4(lit, 1.0);
}
`;

export const BORDER_DEPTH_BIAS = 0.00015;

export const BORDER_VERTEX_SHADER = /* glsl */`
uniform float uDepthBias;
varying float vFacing;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(world.xyz), normalize(cameraPosition - world.xyz));
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    clip.z -= uDepthBias * clip.w;
    gl_Position = clip;
}
`;

export const BORDER_FRAGMENT_SHADER = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vFacing;
void main() {
    if (vFacing < 0.0) discard;
    gl_FragColor = vec4(uColor, uOpacity);
}
`;
