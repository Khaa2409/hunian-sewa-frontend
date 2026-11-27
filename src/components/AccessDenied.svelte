<script>
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import DashboardLayout from "../layouts/DashboardLayout.svelte";
  import { currentUser } from "../stores/auth.js";

  /**
   * @type {{
   *   variant?: "denied" | "not-found",
   *   pageTitle?: string,
   *   activeKey?: string,
   *   title?: string,
   *   mobileTitle?: string,
   *   subtitle?: string,
   *   description?: string,
   *   mobileDescription?: string,
   *   homeRoute?: string
   * }}
   */
  let {
    variant = "denied",
    pageTitle = "Akses Terbatas",
    activeKey = "home",
    title = "Halaman ini khusus Pengelola & Pemilik",
    mobileTitle = "Akses Terbatas",
    subtitle = "Anda tidak memiliki izin untuk membuka halaman ini",
    description = "Halaman pengelola dan pemilik tidak dapat diakses oleh Penyewa maupun Wali. Hubungi Pengelola bila Anda memerlukan bantuan.",
    mobileDescription = "Halaman ini hanya dapat diakses oleh Pengelola atau Pemilik hunian.",
    homeRoute = "",
  } = $props();

  let isMobileViewport = $state(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );

  let normalizedRole = $derived(
    String($currentUser?.role || "").toLowerCase(),
  );

  let resolvedHomeRoute = $derived.by(() => {
    if (homeRoute) return homeRoute;
    if (normalizedRole === "owner") return "/owner";
    if (normalizedRole === "caretaker") return "/caretaker";
    if (normalizedRole === "guardian") return "/guardian";
    if (normalizedRole === "tenant") return "/tenant";
    return "/login";
  });

  let displayName = $derived.by(() => {
    if ($currentUser?.name) return $currentUser.name;
    if (normalizedRole === "owner") return "Pemilik";
    if (normalizedRole === "caretaker") return "Pengelola";
    if (normalizedRole === "guardian") return "Wali";
    if (normalizedRole === "tenant") return "Penyewa";
    return "Pengguna";
  });

  let displayRole = $derived.by(() => {
    if (normalizedRole === "caretaker") return "Pengelola";
    if (normalizedRole === "owner") return "Pemilik";
    if (normalizedRole === "guardian") return "Wali";
    if (normalizedRole === "tenant") return "Penyewa";
    return $currentUser?.role || "";
  });

  onMount(() => {
    const syncViewport = () => {
      isMobileViewport = window.innerWidth <= 768;
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  });

  function goToRoute(/** @type {string} */ rawPath) {
    const target = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (typeof window !== "undefined") {
      const nextHash = `#${target}`;
      if (window.location.hash === nextHash) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else {
        window.location.hash = nextHash;
      }
      return;
    }
    push(target);
  }

  function handleBackHome() {
    goToRoute(resolvedHomeRoute);
  }

  /** @param {{ href?: string }} item */
  function handleNavigate(item) {
    if (item?.href) {
      goToRoute(item.href);
    }
  }
</script>

<DashboardLayout
  {activeKey}
  role={normalizedRole}
  ownerName={displayName}
  ownerRole={displayRole}
  onNavigate={handleNavigate}
>
  <div class="restricted-page">
    <div class="page-header">
      <h1 class="page-title">{pageTitle}</h1>
      <p class="page-subtitle">{subtitle}</p>
    </div>

    <div class="restricted-center-wrap">
      <div class="restricted-card">
        <div class="lock-circle" aria-hidden="true">
          {#if variant === "not-found"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
              />
            </svg>
          {/if}
        </div>

        <h2 class="restricted-card-title">
          {isMobileViewport ? mobileTitle : title}
        </h2>

        <p class="restricted-card-desc">
          {isMobileViewport ? mobileDescription : description}
        </p>

        {#if !isMobileViewport}
          <button type="button" class="btn-back-brown" onclick={handleBackHome}>
            Kembali ke Beranda
          </button>
        {/if}
      </div>

      {#if isMobileViewport}
        <button type="button" class="btn-back-mobile" onclick={handleBackHome}>
          Kembali ke Beranda
        </button>
      {/if}
    </div>
  </div>
</DashboardLayout>

<style>
  .restricted-page,
  .restricted-page :global(button) {
    font-family: "Inter", sans-serif;
  }

  .restricted-page {
    min-height: calc(100vh - 110px);
    display: flex;
    flex-direction: column;
  }

  .page-header {
    margin-bottom: 22px;
  }

  .page-title {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: #261a14;
  }

  .page-subtitle {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .restricted-center-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
  }

  .restricted-card {
    width: 100%;
    max-width: 420px;
    padding: 32px 24px;
    border-radius: 12px;
    border: 1px solid #ece3d9;
    background-color: #ffffff;
    text-align: center;
    box-sizing: border-box;
  }

  .lock-circle {
    width: 44px;
    height: 44px;
    margin: 0 auto 14px;
    border-radius: 999px;
    background-color: #f3ede6;
    color: #684b36;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .restricted-card-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .restricted-card-desc {
    margin: 0 auto;
    max-width: 300px;
    font-size: 12px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .btn-back-brown {
    margin-top: 18px;
    height: 36px;
    padding: 0 18px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-back-brown:hover {
    background-color: #553c2a;
  }

  .btn-back-mobile {
    width: 100%;
    margin-top: 12px;
    height: 42px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-back-mobile:hover {
    background-color: #faf7f2;
  }

  @media (max-width: 768px) {
    .page-title {
      font-size: 26px;
      line-height: 1.25;
    }

    .page-subtitle {
      font-size: 12px;
      line-height: 1.5;
    }
  }
</style>
