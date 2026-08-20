/**
 * @terragotcha/api-client — the quiz backend client.
 *
 * No DOM and no globals: the API base, the storage behind the device token, and
 * `fetch` are all supplied by the caller, so the same client serves the browser
 * and React Native. The web binding is js/data/api-client.js.
 */

export { ApiClient, ApiError, AUDIT_TOKEN_KEY } from './client.js';
export { DeviceIdentity, DEVICE_TOKEN_KEY, defaultGenerateId } from './identity.js';
export { isLocalDevHost, resolveApiBase } from './host.js';
