<script>
  import { onMount } from "svelte";
  import Router from "svelte-spa-router";
  import routes from "./lib/routes.js";

  import { hasToken } from "./services/token.js";
  import { logout } from "./services/auth.js";
  import { loadCurrentUser, clearCurrentUser } from "./stores/auth.js";

  let checkingSession = $state(true);

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
    initSession();
  });
</script>

{#if checkingSession}
  <main>
    <p>Memeriksa sesi pengguna...</p>
  </main>
{:else}
  <main>
    <Router {routes} />
  </main>
{/if}
