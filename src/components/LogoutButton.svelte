<script>
  import { logout } from '../services/auth.js';
  import { clearCurrentUser } from '../stores/auth.js';
  import { replace } from 'svelte-spa-router';

  function handleLogout() {
    logout();
    clearCurrentUser();
    replace('/login');
  }
</script>

<button onclick={handleLogout}>
  Logout
</button>