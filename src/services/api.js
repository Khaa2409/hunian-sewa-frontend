import { getToken, removeToken } from './token.js';

/**
 * Base URL Backend Hunify
 */
export const API_BASE_URL = 'http://localhost:3000';

/**
 * Tipe konfigurasi request API
 * @typedef {Omit<RequestInit, 'body'> & {
 *   body?: FormData | Record<string, unknown> | string | null
 * }} ApiRequestOptions
 */

/**
 * Fungsi utama komunikasi dengan backend
 *
 * @param {string} path
 * @param {ApiRequestOptions} [options={}]
 * @returns {Promise<any>}
 */
export async function apiRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});

    headers.set('Accept', 'application/json');

    // Ambil JWT dari localStorage
    const token = getToken();

    // Tambahkan Authorization jika token tersedia
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // Periksa jenis body
    const isFormData = options.body instanceof FormData;

    const isJsonBody =
        options.body !== undefined &&
        options.body !== null &&
        typeof options.body === 'object' &&
        !isFormData;

    // Atur Content-Type
    if (isJsonBody && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    // Siapkan body
    /** @type {BodyInit | null | undefined} */
    let requestBody;

    if (options.body === undefined || options.body === null) {
        requestBody = options.body;
    } else if (
        options.body instanceof FormData ||
        typeof options.body === 'string'
    ) {
        requestBody = options.body;
    } else {
        requestBody = JSON.stringify(options.body);
    }

    // Kirim request ke backend
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        body: requestBody
    });

    // Baca respons backend
    const contentType = response.headers.get('content-type') || '';

    const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    // Tangani HTTP error
    if (!response.ok) {

        // Jika token tidak valid atau kedaluwarsa
        if (response.status === 401) {
            removeToken();
        }

        const message =
            data?.pesan ||
            data?.message ||
            data?.error ||
            `Request gagal dengan status ${response.status}`;

        const error = Object.assign(
            new Error(message),
            {
                status: response.status,
                data: data
            }
        );

        throw error;
    }

    return data;
}