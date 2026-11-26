<script>
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import Router, { replace } from "svelte-spa-router";
  import routes from "./lib/routes.js";

  import { hasToken } from "./services/token.js";
  import { logout } from "./services/auth.js";
  import {
    loadCurrentUser,
    clearCurrentUser,
    isAuthenticated,
    currentUser,
  } from "./stores/auth.js";

  import AccessDenied from "./components/AccessDenied.svelte";

  let checkingSession = $state(true);
  let accessDenied = $state(false);

  let activeUserRole = $derived(String($currentUser?.role || "").toLowerCase());

  let deniedProps = $derived.by(() => {
    if (activeUserRole === "tenant" || activeUserRole === "guardian") {
      return {
        pageTitle: "Akses Terbatas",
        title: "Halaman ini khusus Pengelola & Pemilik",
        mobileTitle: "Akses Terbatas",
        subtitle: "Anda tidak memiliki izin untuk membuka halaman ini",
        description:
          "Halaman pengelola dan pemilik tidak dapat diakses oleh Penyewa maupun Wali. Hubungi Pengelola bila Anda memerlukan bantuan.",
        mobileDescription:
          "Halaman ini hanya dapat diakses oleh Pengelola atau Pemilik hunian.",
        homeRoute: activeUserRole === "guardian" ? "/guardian" : "/tenant",
      };
    }

    if (activeUserRole === "caretaker") {
      return {
        pageTitle: "Laporan Keuangan",
        title: "Halaman ini khusus Pemilik",
        mobileTitle: "Akses Terbatas",
        subtitle: "Halaman ini hanya untuk Pemilik",
        description:
          "Laporan keuangan hanya dapat dilihat oleh Pemilik hunian. Hubungi Pemilik bila Anda perlu rekap penerimaan.",
        mobileDescription:
          "Menu Laporan Keuangan hanya dapat diakses langsung oleh Pemilik kos.",
        homeRoute: "/caretaker",
      };
    }

    return {
      pageTitle: "Akses Terbatas",
      title: "Akses Halaman Ditolak",
      mobileTitle: "Akses Terbatas",
      subtitle: "Peran akun Anda tidak sesuai untuk halaman ini",
      description:
        "Anda tidak memiliki izin untuk membuka halaman yang diminta. Kembali ke beranda sesuai peran akun Anda.",
      mobileDescription:
        "Peran akun Anda tidak memiliki izin untuk membuka halaman ini.",
      homeRoute: activeUserRole === "owner" ? "/owner" : "/login",
    };
  });

  function handleConditionsFailed() {
    if (!get(isAuthenticated)) {
      accessDenied = false;
      replace("/login");
      return;
    }

    accessDenied = true;
  }

  function handleRouteLoaded() {
    accessDenied = false;
  }

  async function initSession() {
    if (hasToken()) {
      try {
        await loadCurrentUser();
      } catch (/** @type {any} */ error) {
        if (error?.status === 401) {
          logout();
          clearCurrentUser();
        }
      }
    }

    checkingSession = false;
  }

  onMount(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("conditionsFailed", handleConditionsFailed);
      window.addEventListener("routeLoaded", handleRouteLoaded);
    }

    initSession();
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("conditionsFailed", handleConditionsFailed);
      window.removeEventListener("routeLoaded", handleRouteLoaded);
    }
  });
</script>

{#if checkingSession}
  <main>
    <p>Memeriksa sesi pengguna...</p>
  </main>
{:else}
  <main>
    {#if accessDenied}
      <AccessDenied
        pageTitle={deniedProps.pageTitle}
        title={deniedProps.title}
        mobileTitle={deniedProps.mobileTitle}
        subtitle={deniedProps.subtitle}
        description={deniedProps.description}
        mobileDescription={deniedProps.mobileDescription}
        homeRoute={deniedProps.homeRoute}
      />
    {:else}
      <Router {routes} />
    {/if}
  </main>
{/if}
