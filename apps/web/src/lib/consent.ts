/**
 * Re-open Google's consent message so a reader can change their choice.
 *
 * GDPR needs a way back to the banner, and the CMP only shows it unprompted
 * once. Best-effort: works once the Funding Choices loader has run AND a
 * revocation message exists in the "Privacy & messaging" dashboard. Never
 * throws — consent UI must not break the app.
 */
import { CMP_PUBLISHER_ID } from '../../../../js/data/site-config.js';

/** Is there a CMP on this page to re-open? Static tags exist only in production. */
export function consentConfigured(): boolean {
    return import.meta.env.PROD && !!CMP_PUBLISHER_ID;
}

interface GoogleFc {
    callbackQueue?: Array<Record<string, () => void>>;
    showRevocationMessage?: () => void;
}

export function manageConsent(): void {
    try {
        const w = window as unknown as { googlefc?: GoogleFc };
        w.googlefc = w.googlefc || {};
        w.googlefc.callbackQueue = w.googlefc.callbackQueue || [];
        w.googlefc.callbackQueue.push({
            CONSENT_DATA_READY: () => w.googlefc?.showRevocationMessage?.(),
        });
    } catch {
        // swallow
    }
}
