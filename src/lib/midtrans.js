const SNAP_SCRIPT_ID = "midtrans-snap";

/**
 * Muat snap.js dari Midtrans bila client key tersedia.
 * @returns {Promise<any | null>}
 */
export function loadSnap() {
  if (typeof window === "undefined") return Promise.resolve(null);

  const existingSnap = /** @type {any} */ (window).snap;
  if (existingSnap && typeof existingSnap.pay === "function") {
    return Promise.resolve(existingSnap);
  }

  const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY || "";
  if (!clientKey) return Promise.resolve(null);

  return new Promise((resolve) => {
    const script = document.getElementById(SNAP_SCRIPT_ID);
    if (script && script.getAttribute("data-failed") !== "true") {
      script.addEventListener("load", () => resolve(/** @type {any} */ (window).snap || null), { once: true });
      script.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    if (script) script.remove();

    const production = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === "true";
    const element = document.createElement("script");
    element.id = SNAP_SCRIPT_ID;
    element.src = production
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";
    element.setAttribute("data-client-key", clientKey);
    element.onload = () => resolve(/** @type {any} */ (window).snap || null);
    element.onerror = () => {
      element.setAttribute("data-failed", "true");
      resolve(null);
    };
    document.head.appendChild(element);
  });
}
