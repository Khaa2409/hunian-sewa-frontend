const TOKEN_KEY = 'hunify_token';

/**
 * Menyimpan JWT ke localStorage
 * @param {string} token
 * @returns {void}
 */
export function setToken(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Token tidak boleh kosong');
    }

    localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Mengambil JWT dari localStorage
 * @returns {string | null}
 */
export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Menghapus JWT dari localStorage
 * @returns {void}
 */
export function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
}

/**
 * Memeriksa apakah token tersedia
 * @returns {boolean}
 */
export function hasToken() {
    return Boolean(getToken());
}