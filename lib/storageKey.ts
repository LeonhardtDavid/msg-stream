/**
 * The localStorage key settings live under. Its own module, with no imports,
 * because the pre-paint theme script needs it at build time — and importing
 * the store for one string would pull the whole app into the Vite config.
 */
export const STORAGE_KEY = "msg-stream";
