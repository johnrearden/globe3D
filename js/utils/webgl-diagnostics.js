/**
 * WebGL Renderer Creation + Diagnostics
 *
 * Three.js (r128) throws a bare `Error creating WebGL context.` when both
 * canvas.getContext('webgl2') and getContext('webgl') return null — with no hint of
 * *why* the browser refused. Chrome carries the real reason on a
 * `webglcontextcreationerror` DOM event's `statusMessage`, but Three never reads it, so
 * it's lost. This module wraps renderer construction so a failure logs an actionable
 * diagnostic report to the console (the browser's statusMessage plus GPU/driver/env
 * info) instead of a mystery error.
 *
 * Console output only — a developer diagnostic aid, no user-facing UI. On success the
 * behaviour is identical to `new THREE.WebGLRenderer(options)`; we merely pre-create the
 * <canvas> ourselves so the creation-error listener is attached before the failing
 * getContext runs (Three makes its own canvas too late for us to observe the event).
 *
 * Complements js/core/context-recovery.js, which handles context *loss after* a
 * successful creation — the gap this module does not cover; this one covers the initial
 * creation failure.
 */

import * as THREE from 'three';

// Context types probed (in preference order) when diagnosing a failure.
const PROBE_TYPES = ['webgl2', 'webgl', 'experimental-webgl'];

// Count of renderers successfully created this page load. The app makes a separate
// WebGL context per flag panel and per quiz, and Chrome caps live contexts (~16) per
// page; a high count at failure time is the tell for context exhaustion — which fits
// the "clears on a browser restart" symptom.
let sessionOk = 0;

/**
 * Create a THREE.WebGLRenderer, emitting a console diagnostic report if the WebGL
 * context can't be created.
 *
 * @param {object} [options] Options forwarded to THREE.WebGLRenderer (antialias, alpha, …).
 * @param {{ label?: string }} [meta] Short tag identifying the call site in the report.
 * @returns {THREE.WebGLRenderer}
 * @throws re-throws with a message that now names the real failure reason.
 */
export function createWebGLRenderer(options = {}, meta = {}) {
    const label = meta.label || 'webgl';

    // Our own canvas, so the creation-error listener is in place before getContext runs.
    const canvas = document.createElement('canvas');
    const messages = [];
    const onCreationError = (event) => {
        // event.statusMessage is the browser's human-readable reason (may be empty in
        // some browsers). Chrome fires this once per attempted context type.
        if (event && event.statusMessage) messages.push(event.statusMessage);
    };
    canvas.addEventListener('webglcontextcreationerror', onCreationError, false);

    try {
        const renderer = new THREE.WebGLRenderer({ canvas, ...options });
        sessionOk += 1;
        return renderer;
    } catch (err) {
        // Guard the diagnostics themselves so a bug here can never mask the real error.
        try {
            const diag = collectDiagnostics(messages, { label, attributes: options });
            console.error(formatReport(diag));
            console.error('[webgl-diagnostics] raw report:', diag);
        } catch (diagErr) {
            console.error('[webgl-diagnostics] failed while collecting diagnostics:', diagErr);
        }
        console.error('[webgl-diagnostics] original error:', err);
        throw new Error(
            `WebGL context creation failed [${label}]: ` +
            `${messages[0] || 'no statusMessage reported by browser'} ` +
            '— see console for full diagnostics',
            { cause: err }
        );
    } finally {
        canvas.removeEventListener('webglcontextcreationerror', onCreationError, false);
    }
}

/**
 * Gather everything useful for diagnosing why context creation failed.
 * @param {string[]} statusMessages - browser reasons captured for the failed request.
 * @param {{ label: string, attributes: object }} meta
 */
function collectDiagnostics(statusMessages, meta) {
    return {
        label: meta.label,
        attributes: meta.attributes,
        statusMessages: statusMessages.slice(),
        probe: probeContexts(),
        constructors: {
            // 'undefined' here ⇒ WebGL is compiled out / disabled entirely, as opposed
            // to present-but-refused (constructor exists, getContext still returns null).
            WebGL2RenderingContext: typeof window.WebGL2RenderingContext,
            WebGLRenderingContext: typeof window.WebGLRenderingContext,
        },
        session: { renderersCreatedOk: sessionOk },
        env: {
            userAgent: navigator.userAgent,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            devicePixelRatio: window.devicePixelRatio,
        },
    };
}

/**
 * Independently attempt each context type on a fresh throwaway canvas, capturing
 * availability, any statusMessage, and GPU details. Probe contexts are released via
 * WEBGL_lose_context so the diagnostic doesn't itself consume a browser context slot.
 */
function probeContexts() {
    const results = {};
    for (const type of PROBE_TYPES) {
        const canvas = document.createElement('canvas');
        const probeMessages = [];
        const onErr = (e) => { if (e && e.statusMessage) probeMessages.push(e.statusMessage); };
        canvas.addEventListener('webglcontextcreationerror', onErr, false);

        let gl = null;
        try {
            gl = canvas.getContext(type);
        } catch (e) {
            probeMessages.push(String((e && e.message) || e));
        }
        canvas.removeEventListener('webglcontextcreationerror', onErr, false);

        const entry = { available: !!gl };
        if (probeMessages.length) entry.statusMessages = probeMessages;
        if (gl) {
            entry.info = describeContext(gl);
            const lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        }
        results[type] = entry;
    }
    return results;
}

/** Read identifying parameters (incl. unmasked GPU strings) from a live GL context. */
function describeContext(gl) {
    const info = {};
    try {
        info.version = gl.getParameter(gl.VERSION);
        info.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
        info.vendor = gl.getParameter(gl.VENDOR);
        info.renderer = gl.getParameter(gl.RENDERER);
        info.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
            info.unmaskedVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
            info.unmaskedRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        }
    } catch (e) {
        info.error = String((e && e.message) || e);
    }
    return info;
}

/** Render the diagnostics object as a readable multi-line console block. */
function formatReport(diag) {
    const lines = [];
    lines.push('════════ WebGL context creation FAILED ════════');
    lines.push(`call site      : ${diag.label}`);
    lines.push(`requested attrs: ${JSON.stringify(diag.attributes)}`);
    lines.push(
        `browser reason : ${diag.statusMessages.length ? diag.statusMessages.join(' | ') : '(none reported)'}`
    );
    lines.push(
        `constructors   : WebGL2=${diag.constructors.WebGL2RenderingContext}, ` +
        `WebGL1=${diag.constructors.WebGLRenderingContext}`
    );
    lines.push(`renderers OK so far this session: ${diag.session.renderersCreatedOk}`);
    lines.push('context probe  :');
    for (const [type, entry] of Object.entries(diag.probe)) {
        let line = `  ${type.padEnd(18)}${entry.available ? 'OK' : 'unavailable'}`;
        if (entry.statusMessages) line += ` — ${entry.statusMessages.join(' | ')}`;
        lines.push(line);
        if (entry.info) {
            const i = entry.info;
            if (i.unmaskedRenderer || i.renderer) {
                lines.push(`      gpu: ${i.unmaskedRenderer || i.renderer} (${i.unmaskedVendor || i.vendor || 'vendor?'})`);
            }
            if (i.version) lines.push(`      ${i.version}`);
            if (i.maxTextureSize) lines.push(`      MAX_TEXTURE_SIZE: ${i.maxTextureSize}`);
        }
    }
    lines.push(`env            : dpr=${diag.env.devicePixelRatio}, cores=${diag.env.hardwareConcurrency}, mem=${diag.env.deviceMemory}`);
    lines.push(`               : ${diag.env.userAgent}`);
    lines.push('═══════════════════════════════════════════════');
    return lines.join('\n');
}
