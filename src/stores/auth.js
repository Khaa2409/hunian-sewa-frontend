import { writable, derived, get } from 'svelte/store';
import { getProfile } from '../services/auth.js';

/**
 * Struktur data pengguna Hunify
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} phone
 * @property {'tenant' | 'guardian' | 'caretaker' | 'owner'} role
 * @property {string | null} guardian_id
 * @property {boolean} is_active
 * @property {string} created_at
 */

/**
 * Menyimpan informasi pengguna yang sedang login
 * @type {import('svelte/store').Writable<User | null>}
 */
export const currentUser = writable(
    /** @type {User | null} */ (null)
);

// Memeriksa apakah pengguna sudah login
export const isAuthenticated = derived(
    currentUser,
    ($currentUser) => Boolean($currentUser)
);

// Mengambil role pengguna
export const currentRole = derived(
    currentUser,
    ($currentUser) => $currentUser?.role ?? null
);

// Daftar role yang tersedia di Hunify
export const USER_ROLES = {
    TENANT: 'tenant',
    GUARDIAN: 'guardian',
    CARETAKER: 'caretaker',
    OWNER: 'owner'
};

// Menyimpan informasi pengguna
/**
 * @param {User} user
 */
export function setCurrentUser(user) {
    currentUser.set(user);
}

// Menghapus informasi pengguna
export function clearCurrentUser() {
    currentUser.set(null);
}

// Memeriksa role pengguna
/**
 * @param {'tenant' | 'guardian' | 'caretaker' | 'owner'} role
 * @returns {boolean}
 */
export function hasRole(role) {
    return get(currentRole) === role;
}

/**
 * Memuat profil pengguna dari backend
 *
 * @returns {Promise<void>}
 */
export async function loadCurrentUser() {
    const user = await getProfile();
    currentUser.set(user);
}