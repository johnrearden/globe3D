/**
 * WebGL Context-Loss Recovery
 *
 * Browsers reclaim a tab's WebGL context when it has been backgrounded/frozen for
 * a while (Chrome/Safari "memory saver"). When that happens the globe canvas's GPU
 * context is destroyed; in the cases users hit, the browser does NOT automatically
 * restore it and the app looks dead until a manual page refresh.
 *
 * Three.js (r128) already does the baseline plumbing on its renderer: it calls
 * preventDefault() on 'webglcontextlost' (which permits a later restore), skips
 * rendering while lost, and re-initializes all GL state (re-uploading geometries,
 * textures, shaders from their still-alive JS source data) on 'webglcontextrestored'.
 * So when the browser DOES auto-restore, recovery is essentially free.
 *
 * This module covers the remaining gap — the no-auto-restore case:
 *   - on loss: pause the render loop and show feedback;
 *   - on restore: nudge app-managed textures, resume the loop, hide feedback;
 *   - if no restore arrives within a timeout: reload the page automatically so the
 *     user never has to refresh by hand.
 *
 * Scope is the main globe renderer only. The hover-flag and quiz-flag mini-renderers
 * are transient and rebuilt the next time they open.
 */

const DEFAULT_RELOAD_DELAY_MS = 4000;

/**
 * Attach context-loss recovery to the main globe canvas.
 *
 * @param {SceneManager} sceneManager - owns the renderer + render loop (getRenderer/start/stop).
 * @param {{ globeManager?: object }} [deps] - optional app objects to refresh on restore.
 * @param {{ reloadDelayMs?: number }} [opts] - tunables.
 * @returns {() => void} teardown function that removes the listeners and toast.
 */
export function installContextRecovery(sceneManager, deps = {}, opts = {}) {
    const renderer = sceneManager && sceneManager.getRenderer && sceneManager.getRenderer();
    const canvas = renderer && renderer.domElement;
    if (!canvas) {
        console.warn('installContextRecovery: no renderer canvas available; skipping.');
        return () => {};
    }

    const { globeManager } = deps;
    const reloadDelayMs = opts.reloadDelayMs ?? DEFAULT_RELOAD_DELAY_MS;

    let reloadTimer = null;
    const toast = createToast();

    const onLost = (event) => {
        // Calling preventDefault is what permits the browser to restore the context.
        // Three's renderer also does this; doing it here too is idempotent and keeps
        // recovery working regardless of listener order.
        event.preventDefault();

        console.warn('WebGL context lost — pausing globe and awaiting restore.');
        sceneManager.stop();
        showToast(toast, 'Restoring display…');

        // If the browser never fires 'webglcontextrestored', reload so the user is
        // not left staring at a dead canvas. A backgrounded tab may fire this while
        // hidden — that just means the user returns to a freshly-loaded globe, which
        // is the desired outcome.
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
            console.warn('WebGL context not restored in time — reloading.');
            window.location.reload();
        }, reloadDelayMs);
    };

    const onRestored = () => {
        clearTimeout(reloadTimer);
        reloadTimer = null;

        console.info('WebGL context restored — resuming globe.');

        // Belt-and-suspenders: Three's initGLContext already re-uploads from live
        // source data, but explicitly flag the app-managed textures too.
        if (globeManager && typeof globeManager.markTexturesForUpdate === 'function') {
            globeManager.markTexturesForUpdate();
        }

        sceneManager.start();
        hideToast(toast);
    };

    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);

    return () => {
        clearTimeout(reloadTimer);
        canvas.removeEventListener('webglcontextlost', onLost, false);
        canvas.removeEventListener('webglcontextrestored', onRestored, false);
        toast.remove();
    };
}

function createToast() {
    const el = document.createElement('div');
    el.className = 'context-recovery-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
}

function showToast(el, message) {
    el.textContent = message;
    el.classList.add('is-visible');
}

function hideToast(el) {
    el.classList.remove('is-visible');
}
