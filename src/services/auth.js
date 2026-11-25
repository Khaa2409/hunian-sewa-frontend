import { apiRequest } from './api.js';
import { setToken, removeToken } from './token.js';

/**
 * Login pengguna Hunify
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<any>}
 */
export async function login(email, password) {

    // Kirim email dan password ke backend
    const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: {
            email,
            password
        }
    });

    // Periksa keberhasilan login
    if (!response.success) {
        throw new Error(response.message || 'Login gagal');
    }

    // Pastikan token dan data pengguna tersedia
    if (!response.token || !response.user) {
        throw new Error('Respons login tidak lengkap');
    }

    // Simpan JWT
    setToken(response.token);

    // Kembalikan informasi pengguna
    return response.user;
}

/**
 * Logout pengguna
 */
export function logout() {
    removeToken();
}

/**
 * Mengambil profil pengguna yang sedang login
 *
 * @returns {Promise<any>}
 */
export async function getProfile() {
    const response = await apiRequest('/api/me', {
        method: 'GET'
    });

    if (!response.success || !response.data) {
        throw new Error(
            response.pesan ||
            response.message ||
            'Gagal mengambil profil pengguna'
        );
    }

    return response.data;
}