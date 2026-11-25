<script>
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { currentUser, clearCurrentUser } from "../stores/auth.js";
  import { logout } from "../services/auth.js";
  import { replace } from "svelte-spa-router";

  /**
   * @typedef {Object} NavItem
   * @property {string} key
   * @property {string} label
   */

  let {
    items = /** @type {NavItem[]} */ ([]),
    activeKey = "",
    mobileOpen = false,
    onSelectItem = /** @type {(item: NavItem) => void} */ (() => {}),
    onCloseMobile = /** @type {() => void} */ (() => {}),
    onOpenProfile = /** @type {(() => void) | null} */ (null),
  } = $props();

  /**
   * @param {string | undefined | null} name
   */
  function getInitials(name) {
    if (!name || typeof name !== "string") return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * @param {string | undefined | null} role
   */
  function getRoleLabel(role) {
    switch (role) {
      case "owner":
        return "Pemilik";
      case "caretaker":
        return "Penjaga Kos";
      case "guardian":
        return "Wali";
      case "tenant":
        return "Penyewa";
      default:
        return role || "Pengguna";
    }
  }

  /**
   * @param {NavItem} item
   */
  function handleMenuClick(item) {
    if (typeof onSelectItem === "function") {
      onSelectItem(item);
    }
    onCloseMobile();
  }

  function handleProfileClick() {
    onCloseMobile();
    if (typeof onOpenProfile === "function") {
      onOpenProfile();
    }
  }

  function handleLogoutClick() {
    onCloseMobile();
    logout();
    clearCurrentUser();
    replace("/login");
  }
</script>

<!-- SIDEBAR DESKTOP -->
<aside class="sidebar-desktop" aria-label="Navigasi utama">
  <div class="sidebar-brand">
    <div class="brand-icon" aria-hidden="true">
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
    <span class="brand-name">Hunify</span>
  </div>

  <nav class="nav-list">
    {#each items as item (item.key)}
      <button
        type="button"
        class="nav-item {activeKey === item.key ? 'active' : ''}"
        aria-current={activeKey === item.key ? "page" : undefined}
        onclick={() => handleMenuClick(item)}
      >
        {item.label}
      </button>
    {/each}
  </nav>
</aside>

<!-- DRAWER SIDEBAR MOBILE -->
{#if mobileOpen}
  <div
    class="mobile-drawer-backdrop"
    transition:fade={{ duration: 160 }}
    onclick={onCloseMobile}
    role="presentation"
  ></div>

  <aside
    class="mobile-drawer"
    aria-label="Menu navigasi mobile"
    transition:fly={{ x: -280, duration: 240, easing: cubicOut }}
  >
    <div class="drawer-header">
      <h2 class="drawer-title">Menu</h2>
      <button
        type="button"
        class="close-drawer-btn"
        onclick={onCloseMobile}
        aria-label="Tutup menu"
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
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="drawer-user">
      <span class="drawer-avatar" aria-hidden="true">
        {getInitials($currentUser?.name)}
      </span>
      <div class="drawer-user-info">
        <span class="drawer-user-name">{$currentUser?.name || "Pengguna"}</span>
        <span class="drawer-user-role">{getRoleLabel($currentUser?.role)}</span>
      </div>
    </div>

    <div class="drawer-divider"></div>

    <nav class="drawer-nav-list">
      {#each items as item (item.key)}
        <button
          type="button"
          class="drawer-nav-item {activeKey === item.key ? 'active' : ''}"
          aria-current={activeKey === item.key ? "page" : undefined}
          onclick={() => handleMenuClick(item)}
        >
          {item.label}
        </button>
      {/each}
    </nav>

    <div class="drawer-footer">
      <div class="drawer-divider"></div>

      <button
        type="button"
        class="drawer-action-btn"
        onclick={handleProfileClick}
      >
        Buka Profil
      </button>

      <button
        type="button"
        class="drawer-action-btn logout-text-btn"
        onclick={handleLogoutClick}
      >
        Keluar
      </button>
    </div>
  </aside>
{/if}

<style>
  /* DESKTOP SIDEBAR */
  .sidebar-desktop {
    width: 224px;
    flex-shrink: 0;
    min-height: 100vh;
    padding: 24px 16px;
    background-color: #ffffff;
    border-right: 1px solid #ede4da;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 28px;
  }

  .brand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
  }

  .brand-name {
    font-size: 18px;
    font-weight: 700;
    color: #261a14;
  }

  .nav-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .nav-item {
    width: 100%;
    padding: 10px 14px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #5c4d42;
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .nav-item:hover {
    background-color: #f7f2ec;
    color: #261a14;
  }

  .nav-item.active {
    background-color: #f2ebe3;
    color: #261a14;
    font-weight: 600;
  }

  /* MOBILE DRAWER */
  .mobile-drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background-color: rgba(24, 18, 14, 0.45);
  }

  .mobile-drawer {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    width: 82%;
    max-width: 310px;
    padding: 22px 18px 28px;
    background-color: #ffffff;
    box-shadow: 8px 0 28px rgba(24, 18, 14, 0.14);
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .drawer-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #261a14;
  }

  .close-drawer-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #6c5b4f;
    cursor: pointer;
  }

  .close-drawer-btn:hover {
    background-color: #f5efe8;
    color: #261a14;
  }

  .drawer-user {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .drawer-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background-color: #efe6dc;
    color: #5c432d;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .drawer-user-info {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .drawer-user-name {
    font-size: 14px;
    font-weight: 700;
    color: #261a14;
  }

  .drawer-user-role {
    font-size: 12px;
    color: #9e8b7c;
  }

  .drawer-divider {
    height: 1px;
    background-color: #ede4da;
    margin: 6px 0 14px;
  }

  .drawer-nav-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .drawer-nav-item {
    width: 100%;
    padding: 12px 14px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #5c4d42;
    font-size: 15px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }

  .drawer-nav-item:hover {
    background-color: #f7f2ec;
    color: #261a14;
  }

  .drawer-nav-item.active {
    background-color: #f2ebe3;
    color: #261a14;
    font-weight: 600;
  }

  .drawer-footer {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .drawer-action-btn {
    width: 100%;
    padding: 10px 14px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #5c4d42;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }

  .drawer-action-btn:hover {
    background-color: #f7f2ec;
  }

  .logout-text-btn {
    color: #e53935;
    font-weight: 600;
  }

  .logout-text-btn:hover {
    background-color: #fdecec;
  }

  @media (max-width: 768px) {
    .sidebar-desktop {
      display: none;
    }
  }
</style>
