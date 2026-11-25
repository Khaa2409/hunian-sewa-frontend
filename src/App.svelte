<script>
  import { onMount } from 'svelte';

  import Router from 'svelte-spa-router';
  import routes from './lib/routes.js';

  import { hasToken } from './services/token.js';
  import { logout } from './services/auth.js';

  import { replace } from 'svelte-spa-router';

  import {
    loadCurrentUser,
    clearCurrentUser
  } from './stores/auth.js';

  let checkingSession = true;

  // Mengalihkan pengguna jika akses halaman ditolak
  function handleConditionsFailed() {
    replace('/login');
  }

  // Memeriksa sesi sebelum halaman ditampilkan
  onMount(async () => {
    if (hasToken()) {
      try {
        await loadCurrentUser();
      } catch (error) {
        if (error.status === 401) {
          logout();
          clearCurrentUser();
        }
      }
    }

    checkingSession = false;
  });
</script>

{#if checkingSession}
  <main>
    <p>Memeriksa sesi pengguna...</p>
  </main>
{:else}
  <main>
    <Router
    {routes}
    onConditionsFailed={handleConditionsFailed}
    />
  </main>
{/if}