<script>
  import { currentUser, clearCurrentUser } from '../stores/auth.js';
  import { logout } from '../services/auth.js';
  import { replace } from 'svelte-spa-router';

  /**
   * @typedef {Object} NavbarProps
   * @property {() => void} [onToggleMobileMenu]
   * @property {(() => void) | null} [onOpenProfile]
   */

  /** @type {NavbarProps} */
  let { onToggleMobileMenu = () => {}, onOpenProfile = null } = $props();

  let dropdownOpen = $state(false);

  /**
   * @param {string | null | undefined} name
   * @returns {string}
   */
  function getInitials(name) {
    if (!name || typeof name !== 'string') return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * @param {string | null | undefined} role
   * @returns {string}
   */
  function getRoleLabel(role) {
    switch (role) {
      case 'owner':
        return 'Pemilik';
      case 'caretaker':
        return 'Penjaga Kos';
      case 'guardian':
        return 'Wali';
      case 'tenant':
        return 'Penyewa';
      default:
        return role || 'Pengguna';
    }
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }

  function handleOpenProfile() {
    dropdownOpen = false;
    if (typeof onOpenProfile === 'function') {
      onOpenProfile();
    }
  }

  function handleLogoutClick() {
    dropdownOpen = false;
    logout();
    clearCurrentUser();
    replace('/login');
  }
</script>

<header class="topbar">
  <!-- Bagian Kiri: Hanya tampil di Mobile sesuai desain -->
  <div class="mobile-left">
    <button
      type="button"
      class="hamburger-btn"
      onclick={onToggleMobileMenu}
      aria-label="Buka menu navigasi"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>

    <div class="mobile-brand">
      <div class="mobile-brand-icon" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 3L3 10v11h6v-6h6v6h6V10l-9-7z" />
        </svg>
      </div>
      <span class="mobile-brand-name">Hunify</span>
    </div>
  </div>

  <!-- Bagian Kanan: Info Akun & Dropdown -->
  <div class="account-area">
    <button
      type="button"
      class="account-trigger"
      onclick={toggleDropdown}
      aria-expanded={dropdownOpen}
      aria-haspopup="menu"
    >
      <span class="avatar-circle" aria-hidden="true">
        {getInitials($currentUser?.name)}
      </span>

      <span class="account-meta">
        <span class="account-name">{$currentUser?.name || 'Pengguna'}</span>
        <span class="account-role">{getRoleLabel($currentUser?.role)}</span>
      </span>

      <svg
        class="chevron-icon"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    {#if dropdownOpen}
      <button
        type="button"
        class="dropdown-backdrop"
        aria-label="Tutup menu akun"
        onclick={() => (dropdownOpen = false)}
      ></button>

      <div class="account-dropdown" role="menu">
        <button
          type="button"
          class="dropdown-item profile-btn"
          role="menuitem"
          onclick={handleOpenProfile}
        >
          Buka Profil
        </button>

        <button
          type="button"
          class="dropdown-item logout-btn"
          role="menuitem"
          onclick={handleLogoutClick}
        >
          Log Out
        </button>
      </div>
    {/if}
  </div>
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 72px;
    padding: 12px 32px;
    background-color: #faf7f2;
    border-bottom: 1px solid #ede4da;
  }

  .mobile-left {
    display: none;
    align-items: center;
    gap: 12px;
  }

  .hamburger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #261a14;
    cursor: pointer;
  }

  .hamburger-btn:hover {
    background-color: #efe7de;
  }

  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .mobile-brand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
  }

  .mobile-brand-name {
    font-size: 18px;
    font-weight: 700;
    color: #261a14;
  }

  .account-area {
    position: relative;
  }

  .account-trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: #261a14;
    cursor: pointer;
  }

  .account-trigger:hover {
    background-color: #f1e9e0;
  }

  .avatar-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    background-color: #efe6dc;
    color: #5c432d;
    font-size: 13px;
    font-weight: 700;
  }

  .account-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.25;
  }

  .account-name {
    font-size: 13px;
    font-weight: 600;
    color: #261a14;
  }

  .account-role {
    font-size: 11px;
    color: #9e8b7c;
  }

  .chevron-icon {
    color: #7c6858;
  }

  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 25;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    cursor: default;
  }

  .account-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 176px;
    padding: 10px;
    border: 1px solid #e7ddd3;
    border-radius: 10px;
    background-color: #ffffff;
    box-shadow: 0 8px 24px rgba(38, 26, 20, 0.08);
  }

  .dropdown-item {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
  }

  .profile-btn {
    border: 1px solid #e5ddd3;
    background-color: #ffffff;
    color: #261a14;
  }

  .profile-btn:hover {
    background-color: #faf7f2;
  }

  .logout-btn {
    border: none;
    background-color: #e53935;
    color: #ffffff;
  }

  .logout-btn:hover {
    background-color: #c62828;
  }

  @media (max-width: 768px) {
    .topbar {
      justify-content: space-between;
      padding: 12px 18px;
      background-color: #ffffff;
    }

    .mobile-left {
      display: flex;
    }

    .account-meta,
    .chevron-icon {
      display: none;
    }

    .avatar-circle {
      width: 38px;
      height: 38px;
    }
  }
</style>