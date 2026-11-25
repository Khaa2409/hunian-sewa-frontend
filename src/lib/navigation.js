export const ROLE_NAV_ITEMS = {
  owner: [
    { key: 'home', label: 'Beranda', path: '/owner' },
    { key: 'announcements', label: 'Pengumuman' },
    { key: 'damage-reports', label: 'Laporan Kerusakan' },
    { key: 'rooms-tenants', label: 'Kamar & Penghuni' },
    { key: 'users', label: 'Pengguna' },
    { key: 'contracts', label: 'Kontrak Sewa' },
    { key: 'financial-reports', label: 'Laporan Keuangan' }
  ],
  caretaker: [
    { key: 'home', label: 'Beranda', path: '/caretaker' },
    { key: 'announcements', label: 'Pengumuman' },
    { key: 'damage-reports', label: 'Laporan Kerusakan' },
    { key: 'rooms-tenants', label: 'Kamar & Penghuni' },
    { key: 'tenants', label: 'Penghuni' },
    { key: 'contracts', label: 'Kontrak Sewa' }
  ],
  tenant: [
    { key: 'home', label: 'Beranda', path: '/tenant' },
    { key: 'announcements', label: 'Pengumuman' },
    { key: 'damage-reports', label: 'Laporan Kerusakan' },
    { key: 'bills-payments', label: 'Tagihan & Pembayaran' }
  ],
  guardian: [
    { key: 'home', label: 'Beranda', path: '/guardian' },
    { key: 'announcements', label: 'Pengumuman' },
    { key: 'bills-payments', label: 'Tagihan & Pembayaran' }
  ]
};

/**
 * Mengambil daftar item navigasi berdasarkan role pengguna.
 * @param {string | null | undefined} role
 * @returns {Array<{ key: string, label: string, path?: string }>}
 */
export function getNavItemsByRole(role) {
  if (!role || typeof role !== 'string') {
    return [];
  }

  if (Object.prototype.hasOwnProperty.call(ROLE_NAV_ITEMS, role)) {
    if (role === 'owner') return ROLE_NAV_ITEMS.owner;
    if (role === 'caretaker') return ROLE_NAV_ITEMS.caretaker;
    if (role === 'tenant') return ROLE_NAV_ITEMS.tenant;
    if (role === 'guardian') return ROLE_NAV_ITEMS.guardian;
  }

  return [];
}