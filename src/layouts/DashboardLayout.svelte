<script>
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import LogoutButton from "../components/LogoutButton.svelte";
  import { currentUser } from "../stores/auth.js";

  /**
   * @typedef {Object} NavItem
   * @property {string} key
   * @property {string} label
   * @property {string} href
   */

  /**
   * @typedef {Object} DashboardLayoutProps
   * @property {string} [activeKey]
   * @property {string} [role]
   * @property {string} [title]
   * @property {string} [ownerName]
   * @property {string} [ownerRole]
   * @property {((item: NavItem) => void) | null} [onNavigate]
   * @property {import('svelte').Snippet} [children]
   */

  /** @type {DashboardLayoutProps} */
  let {
    activeKey = "",
    role = "",
    title = "",
    ownerName = "",
    ownerRole = "",
    onNavigate = null,
    children,
  } = $props();

  let isMobileMenuOpen = $state(false);
  let isProfileMenuOpen = $state(false);
  let isMobileViewport = $state(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );

  /**
   * @param {string | null | undefined} roleValue
   * @returns {string}
   */
  function formatRoleLabel(roleValue) {
    if (!roleValue) return "Pemilik";
    const normalized = String(roleValue).toLowerCase();
    if (normalized === "owner") return "Pemilik";
    if (normalized === "caretaker") return "Pengelola";
    if (normalized === "guardian") return "Wali";
    if (normalized === "tenant") return "Penyewa";
    return roleValue;
  }

  let effectiveRoleKey = $derived.by(() => {
    const raw = role || $currentUser?.role || "owner";
    return String(raw).toLowerCase();
  });

  let isCaretaker = $derived(effectiveRoleKey === "caretaker");
  let isTenant = $derived(effectiveRoleKey === "tenant");
  let isGuardian = $derived(effectiveRoleKey === "guardian");

  let routePrefix = $derived.by(() => {
    if (isTenant) return "/tenant";
    if (isGuardian) return "/guardian";
    if (isCaretaker) return "/caretaker";
    return "/owner";
  });

  let resolvedOwnerName = $derived.by(() => {
    if (ownerName) return ownerName;
    if ($currentUser?.name) return $currentUser.name;
    if (isTenant) return "Penyewa";
    if (isGuardian) return "Wali";
    if (isCaretaker) return "Pengelola";
    return "Bu Ratna";
  });

  let resolvedOwnerRole = $derived.by(() => {
    if (ownerRole) return ownerRole;
    if (role) return formatRoleLabel(role);
    if ($currentUser?.role) return formatRoleLabel($currentUser.role);
    return "Pemilik";
  });

  /**
   * @param {string | null | undefined} raw
   * @returns {string}
   */
  function normalizePath(raw) {
    if (!raw) return routePrefix;
    let cleaned = String(raw).replace(/^#/, "").split("?")[0];
    if (!cleaned.startsWith("/")) cleaned = `/${cleaned}`;
    if (cleaned.length > 1 && cleaned.endsWith("/")) {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned || routePrefix;
  }

  /**
   * @returns {string}
   */
  function getHashPath() {
    if (typeof window === "undefined") return routePrefix;
    return normalizePath(window.location.hash);
  }

  let currentPath = $state(getHashPath());

  const assetModules = import.meta.glob("../assets/hunify-logo-dark.*", {
    eager: true,
    import: "default",
  });
  const nestedAssetModules = import.meta.glob(
    "../../assets/hunify-logo-dark.*",
    {
      eager: true,
      import: "default",
    },
  );

  let logoDark = $derived.by(() => {
    /** @type {Record<string, unknown>} */
    const allEntries = { ...nestedAssetModules, ...assetModules };
    const matchedKey = Object.keys(allEntries).find((k) =>
      k.includes("hunify-logo-dark"),
    );
    const val = matchedKey ? allEntries[matchedKey] : "";
    return typeof val === "string" ? val : "";
  });

  /** @type {NavItem[]} */
  let navItems = $derived.by(() => {
    const prefix = routePrefix;

    if (isTenant) {
      return [
        { key: "dashboard", label: "Beranda", href: prefix },
        {
          key: "announcements",
          label: "Pengumuman",
          href: `${prefix}/announcements`,
        },
        {
          key: "reports",
          label: "Laporan Kerusakan",
          href: `${prefix}/damage-reports`,
        },
        {
          key: "bills",
          label: "Tagihan & Pembayaran",
          href: `${prefix}/bills-payments`,
        },
      ];
    }

    if (isGuardian) {
      return [
        { key: "dashboard", label: "Beranda", href: prefix },
        {
          key: "announcements",
          label: "Pengumuman",
          href: `${prefix}/announcements`,
        },
        {
          key: "bills",
          label: "Tagihan & Pembayaran",
          href: `${prefix}/bills-payments`,
        },
      ];
    }

    /** @type {NavItem[]} */
    const baseItems = [
      { key: "dashboard", label: "Beranda", href: prefix },
      {
        key: "announcements",
        label: "Pengumuman",
        href: `${prefix}/announcements`,
      },
      {
        key: "reports",
        label: "Laporan Kerusakan",
        href: `${prefix}/maintenance`,
      },
      { key: "rooms", label: "Kamar & Penghuni", href: `${prefix}/rooms` },
      { key: "users", label: "Pengguna", href: `${prefix}/users` },
      { key: "contracts", label: "Kontrak Sewa", href: `${prefix}/contracts` },
    ];

    if (!isCaretaker) {
      baseItems.push({
        key: "finance",
        label: "Laporan Keuangan",
        href: `${prefix}/finance`,
      });
    }

    return baseItems;
  });

  $effect(() => {
    if (typeof window === "undefined") return;

    const syncPath = () => {
      currentPath = getHashPath();
    };

    const syncViewport = () => {
      isMobileViewport = window.innerWidth <= 768;
    };

    syncPath();
    syncViewport();
    window.addEventListener("hashchange", syncPath);
    window.addEventListener("popstate", syncPath);
    window.addEventListener("resize", syncViewport);

    return () => {
      window.removeEventListener("hashchange", syncPath);
      window.removeEventListener("popstate", syncPath);
      window.removeEventListener("resize", syncViewport);
    };
  });

  let resolvedActiveKey = $derived.by(() => {
    const path = normalizePath(currentPath);

    if (
      path === "/owner" ||
      path === "/caretaker" ||
      path === "/tenant" ||
      path === "/guardian"
    ) {
      return "dashboard";
    }

    const matched = navItems.find((item) => {
      if (
        item.href === "/owner" ||
        item.href === "/caretaker" ||
        item.href === "/tenant" ||
        item.href === "/guardian"
      ) {
        return false;
      }
      return path === item.href || path.startsWith(`${item.href}/`);
    });

    if (matched) return matched.key;
    if (activeKey === "home") return "dashboard";
    if (activeKey) return activeKey;
    return "dashboard";
  });

  let initials = $derived.by(() => {
    const parts = (resolvedOwnerName || "PK").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  });

  /**
   * @param {MouseEvent | null} event
   * @param {NavItem} item
   */
  function navigateTo(event, item) {
    if (event) event.preventDefault();

    isMobileMenuOpen = false;
    isProfileMenuOpen = false;

    const targetPath = normalizePath(item.href);

    if (typeof onNavigate === "function") {
      onNavigate({ ...item, href: targetPath });
    }

    if (typeof window !== "undefined") {
      window.location.hash = `#${targetPath}`;
      currentPath = targetPath;
    }
  }

  /**
   * @param {MouseEvent | null} e
   */
  function goToProfile(e) {
    if (e) e.preventDefault();
    isProfileMenuOpen = false;
    if (typeof window !== "undefined") {
      window.location.hash = "#/profile";
    }
  }

  function toggleMobileMenu() {
    isMobileMenuOpen = !isMobileMenuOpen;
    if (isMobileMenuOpen) isProfileMenuOpen = false;
  }

  function toggleProfileMenu() {
    isProfileMenuOpen = !isProfileMenuOpen;
  }

  /**
   * @param {KeyboardEvent} e
   */
  function handleBackdropKeydown(e) {
    if (e.key === "Escape") {
      isMobileMenuOpen = false;
    }
  }
</script>

<div
  class="owner-layout"
  data-mobile={isMobileViewport ? "true" : "false"}
  data-page-title={title || undefined}
>
  <!-- 1. NAVBAR ATAS -->
  <header class="navbar-bar" aria-label="Navbar {resolvedOwnerRole}">
    <div class="navbar-brand-group">
      <button
        type="button"
        class="mobile-burger-btn mobile-only"
        aria-label={isMobileMenuOpen
          ? "Tutup menu navigasi"
          : "Buka menu navigasi"}
        aria-expanded={isMobileMenuOpen}
        onclick={toggleMobileMenu}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <a
        href="#{routePrefix}"
        class="navbar-brand-link"
        onclick={(e) => navigateTo(e, navItems[0])}
      >
        {#if logoDark}
          <img src={logoDark} alt="Logo Hunify" class="navbar-logo-icon" />
        {:else}
          <span class="navbar-logo-badge" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 10.5L12 3l9 7.5" />
              <path d="M5 9.5V20h14V9.5" />
              <path d="M10 20v-6h4v6" />
            </svg>
          </span>
        {/if}
        <span class="navbar-brand-name">Hunify</span>
      </a>
    </div>

    <div class="navbar-profile-group">
      <div class="profile-menu-wrap">
        <button
          type="button"
          class="profile-trigger"
          aria-expanded={isProfileMenuOpen}
          onclick={toggleProfileMenu}
        >
          <span class="profile-avatar">{initials}</span>
          <span class="profile-info desktop-only">
            <span class="profile-name">{resolvedOwnerName}</span>
            <span class="profile-role">{resolvedOwnerRole}</span>
          </span>
          <svg
            class="profile-chevron desktop-only"
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {#if isProfileMenuOpen}
          <div
            class="profile-dropdown"
            role="menu"
            transition:fly={{ y: -8, duration: 180, easing: cubicOut }}
          >
            <a
              href="#/profile"
              class="profile-btn-outline"
              onclick={goToProfile}
            >
              Buka Profil
            </a>
            <div class="logout-wrapper">
              <LogoutButton />
            </div>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- 2. AREA BAWAH: SIDEBAR + KONTEN HALAMAN -->
  <div class="workspace-container">
    <aside
      class="sidebar-panel desktop-only"
      aria-label="Sidebar {resolvedOwnerRole}"
    >
      <nav class="sidebar-menu">
        {#each navItems as item (item.key)}
          <a
            href="#{item.href}"
            class="sidebar-item {resolvedActiveKey === item.key
              ? 'active'
              : ''}"
            aria-current={resolvedActiveKey === item.key ? "page" : undefined}
            onclick={(e) => navigateTo(e, item)}
          >
            {item.label}
          </a>
        {/each}
      </nav>
    </aside>

    {#if isMobileMenuOpen}
      <div
        class="mobile-drawer-backdrop mobile-only"
        role="presentation"
        transition:fade={{ duration: 170 }}
        onclick={() => (isMobileMenuOpen = false)}
        onkeydown={handleBackdropKeydown}
      >
        <aside
          class="mobile-drawer-panel"
          aria-label="Menu Navigasi Mobile"
          transition:fly={{ x: -250, duration: 240, easing: cubicOut }}
        >
          <div class="mobile-drawer-header">
            <span class="mobile-drawer-title">Navigasi {resolvedOwnerRole}</span
            >
            <button
              type="button"
              class="mobile-drawer-close"
              aria-label="Tutup menu"
              onclick={() => (isMobileMenuOpen = false)}
            >
              ✕
            </button>
          </div>
          <nav class="sidebar-menu">
            {#each navItems as item (item.key)}
              <a
                href="#{item.href}"
                class="sidebar-item {resolvedActiveKey === item.key
                  ? 'active'
                  : ''}"
                aria-current={resolvedActiveKey === item.key
                  ? "page"
                  : undefined}
                onclick={(e) => navigateTo(e, item)}
              >
                {item.label}
              </a>
            {/each}
          </nav>
        </aside>
      </div>
    {/if}

    <main class="page-content">
      {#key resolvedActiveKey}
        <div class="page-transition-shell">
          {@render children?.()}
        </div>
      {/key}
    </main>
  </div>
</div>

<style>
  @keyframes pageFadeSmooth {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  .owner-layout,
  .owner-layout :global(button),
  .owner-layout :global(input),
  .owner-layout :global(select),
  .owner-layout :global(textarea),
  .owner-layout :global(a) {
    font-family: "Inter", sans-serif;
  }

  .mobile-only {
    display: none;
  }

  .owner-layout {
    min-height: 100vh;
    background-color: #faf7f3;
    color: #261a14;
    display: flex;
    flex-direction: column;
    overflow-x: clip;
  }

  .navbar-bar {
    height: 64px;
    padding: 0 24px 0 0;
    background-color: #ffffff;
    border-bottom: 1px solid #ede4da;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-shrink: 0;
  }

  .navbar-brand-group {
    width: 224px;
    flex-shrink: 0;
    height: 100%;
    padding: 0 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .navbar-brand-link {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: #261a14;
  }

  .navbar-logo-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: block;
    object-fit: cover;
    flex-shrink: 0;
  }

  .navbar-logo-badge {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background-color: #634630;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .navbar-brand-name {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #261a14;
    line-height: 1;
  }

  .navbar-profile-group {
    display: flex;
    align-items: center;
  }

  .profile-menu-wrap {
    position: relative;
  }

  .profile-trigger {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 4px 6px;
    border: 1px solid transparent;
    border-radius: 10px;
    background-color: transparent;
    color: #261a14;
    cursor: pointer;
    text-align: left;
    transition:
      background-color 0.18s ease,
      transform 0.16s ease;
  }

  .profile-trigger:hover {
    background-color: #faf6f1;
  }

  .profile-trigger:active {
    transform: scale(0.98);
  }

  .profile-avatar {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    background-color: #efe7de;
    color: #5c432d;
    font-size: 12px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .profile-info {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  .profile-name {
    font-size: 13px;
    font-weight: 700;
    color: #261a14;
  }

  .profile-role {
    font-size: 11px;
    color: #9e8b7c;
  }

  .profile-chevron {
    color: #8f7c6e;
    margin-left: 2px;
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .profile-trigger[aria-expanded="true"] .profile-chevron {
    transform: rotate(180deg);
  }

  .profile-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    width: 170px;
    padding: 10px;
    border: 1px solid #ede4da;
    border-radius: 14px;
    background-color: #ffffff;
    box-shadow: 0 10px 30px rgba(38, 26, 20, 0.08);
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile-btn-outline {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #e2d9cf;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    box-sizing: border-box;
    transition:
      background-color 0.16s ease,
      transform 0.14s ease;
  }

  .profile-btn-outline:hover {
    background-color: #faf6f1;
  }

  .profile-btn-outline:active {
    transform: scale(0.98);
  }

  .logout-wrapper {
    width: 100%;
  }

  .logout-wrapper :global(button) {
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 8px;
    background-color: #dc2626;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      transform 0.14s ease;
  }

  .logout-wrapper :global(button:hover) {
    background-color: #b91c1c;
  }

  .logout-wrapper :global(button:active) {
    transform: scale(0.98);
  }

  .workspace-container {
    flex: 1;
    display: flex;
    align-items: stretch;
    min-height: calc(100vh - 64px);
  }

  .sidebar-panel {
    width: 224px;
    flex-shrink: 0;
    background-color: #ffffff;
    border-right: 1px solid #ede4da;
    padding: 20px 14px;
  }

  .sidebar-menu {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sidebar-item {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    color: #6f5d50;
    text-decoration: none;
    line-height: 1.35;
    transition:
      background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1),
      color 0.2s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .sidebar-item:hover {
    background-color: #faf6f1;
    color: #261a14;
    transform: translateX(4px);
  }

  .sidebar-item:active {
    transform: translateX(2px) scale(0.99);
  }

  .sidebar-item.active {
    background-color: #efe9e0;
    color: #261a14;
    font-weight: 700;
    transform: translateX(2px);
  }

  .page-content {
    flex: 1;
    min-width: 0;
    padding: 28px 32px;
  }

  .page-transition-shell {
    min-width: 0;
    animation: pageFadeSmooth 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-transition-shell {
      animation: none !important;
    }

    .sidebar-item,
    .profile-trigger,
    .profile-chevron,
    .profile-btn-outline,
    .logout-wrapper :global(button) {
      transition: none !important;
      transform: none !important;
    }
  }

  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: inline-flex;
    }

    .navbar-bar {
      height: 54px;
      padding: 0 14px;
    }

    .navbar-brand-group {
      width: auto;
      padding: 0;
      gap: 10px;
    }

    .navbar-logo-icon,
    .navbar-logo-badge {
      width: 28px;
      height: 28px;
    }

    .navbar-brand-name {
      font-size: 15px;
    }

    .mobile-burger-btn {
      width: 34px;
      height: 34px;
      border: 1px solid #ede4da;
      border-radius: 8px;
      background-color: #ffffff;
      color: #261a14;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition:
        background-color 0.16s ease,
        transform 0.15s ease;
    }

    .mobile-burger-btn:active {
      transform: scale(0.95);
    }

    .workspace-container {
      min-height: calc(100vh - 54px);
    }

    .page-content {
      padding: 20px 16px;
    }

    .mobile-drawer-backdrop {
      position: fixed;
      inset: 54px 0 0 0;
      background-color: rgba(38, 26, 20, 0.35);
      z-index: 35;
      display: flex;
    }

    .mobile-drawer-panel {
      width: 245px;
      max-width: 82vw;
      height: 100%;
      background-color: #ffffff;
      border-right: 1px solid #ede4da;
      padding: 14px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 8px 0 24px rgba(24, 18, 14, 0.12);
    }

    .mobile-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 6px 8px;
      border-bottom: 1px solid #f4ede5;
    }

    .mobile-drawer-title {
      font-size: 12px;
      font-weight: 700;
      color: #261a14;
    }

    .mobile-drawer-close {
      border: none;
      background: transparent;
      color: #6f5d50;
      font-size: 14px;
      cursor: pointer;
      padding: 4px 6px;
    }
  }
</style>
