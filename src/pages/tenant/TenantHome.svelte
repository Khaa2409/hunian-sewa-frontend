<script>
  import { currentUser } from '../../stores/auth.js';
  import LogoutButton from '../../components/LogoutButton.svelte';
</script>

<main>
  <h1>Halaman Penyewa Hunify</h1>

  {#if $currentUser}
    <h2>Selamat datang, {$currentUser.name}!</h2>
    <p>Email: {$currentUser.email}</p>
    <p>Role: {$currentUser.role}</p>
    <LogoutButton />
  {/if}
</main>