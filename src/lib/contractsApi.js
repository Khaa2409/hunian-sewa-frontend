// @ts-check
import { apiRequest } from '../services/api.js';

/**
 * @param {string} path
 * @param {Record<string, string | number | boolean | null | undefined>} [paramsObj]
 */
function buildPathWithQuery(path, paramsObj = {}) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const query = new URLSearchParams();

  Object.entries(paramsObj).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') {
      query.append(key, String(value));
    }
  });

  const qs = query.toString();
  return `${cleanPath}${qs ? `?${qs}` : ''}`;
}

/**
 * @param {{ status?: string; q?: string; page?: number; limit?: number }} [params]
 */
export async function fetchContracts({ status = '', q = '', page = 1, limit = 10 } = {}) {
  const endpoint = buildPathWithQuery('/api/contracts', {
    status: status && status !== 'all' ? status : '',
    q: q.trim(),
    page,
    limit
  });

  return apiRequest(endpoint, { method: 'GET' });
}

/**
 * @param {string | number} id
 */
export async function fetchContractDetail(id) {
  return apiRequest(`/api/contracts/${id}`, { method: 'GET' });
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function createContract(payload) {
  return apiRequest('/api/contracts', {
    method: 'POST',
    body: /** @type {Record<string, unknown>} */ (payload)
  });
}

/**
 * @param {string | number} id
 * @param {Record<string, unknown>} payload
 */
export async function extendContract(id, payload) {
  return apiRequest(`/api/contracts/${id}`, {
    method: 'PATCH',
    body: /** @type {Record<string, unknown>} */ (payload)
  });
}

/**
 * @param {string | number} id
 */
export async function terminateContract(id) {
  return apiRequest(`/api/contracts/${id}/terminate`, {
    method: 'POST'
  });
}

export async function fetchVacantRooms() {
  const endpoint = buildPathWithQuery('/api/rooms', {
    status: 'available',
    limit: 100
  });
  return apiRequest(endpoint, { method: 'GET' });
}

export async function fetchTenantUsers() {
  const endpoint = buildPathWithQuery('/api/users', {
    role: 'tenant',
    limit: 100
  });
  return apiRequest(endpoint, { method: 'GET' });
}