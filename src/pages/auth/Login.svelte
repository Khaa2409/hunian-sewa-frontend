<script>
  import { login, logout } from "../../services/auth.js";

  import {
    loadCurrentUser,
    currentUser,
    clearCurrentUser,
  } from "../../stores/auth.js";

  import { get } from "svelte/store";
  import { replace } from "svelte-spa-router";

  import logoLight from "../../assets/hunify-logo-light.svg";

  let email = $state("");
  let password = $state("");
  let loading = $state(false);
  let errorMessage = $state("");
  let showPassword = $state(false);

  /**
   * @param {SubmitEvent} event
   */
  async function handleLogin(event) {
    event.preventDefault();

    try {
      loading = true;
      errorMessage = "";

      await login(email, password);
      await loadCurrentUser();

      /** @type {any} */
      const user = get(currentUser);

      password = "";
      showPassword = false;

      switch (user?.role) {
        case "owner":
          replace("/owner");
          break;

        case "caretaker":
          replace("/caretaker");
          break;

        case "guardian":
          replace("/guardian");
          break;

        case "tenant":
          replace("/tenant");
          break;

        default:
          errorMessage = "Role pengguna tidak dikenali.";
          break;
      }
    } catch (/** @type {any} */ error) {
      errorMessage = error?.message || "Gagal masuk ke akun.";

      if (error?.status === 401) {
        clearCurrentUser();
        password = "";
        showPassword = false;
      }
    } finally {
      loading = false;
    }
  }

  function handleLogout() {
    logout();
    clearCurrentUser();
    errorMessage = "";
    password = "";
    showPassword = false;
  }

  function togglePassword() {
    showPassword = !showPassword;
  }
</script>

<main class="login-page">
  <!-- PANEL KIRI (DESKTOP) -->
  <section class="login-info">
    <div class="brand">
      <img src={logoLight} alt="Logo Hunify" class="brand-logo" />

      <span class="brand-name">Hunify</span>
    </div>

    <div class="info-content">
      <h1>Kelola hunian sewa<br />dalam satu tempat.</h1>

      <p class="info-description">
        Pengumuman, laporan kerusakan, dan pembayaran sewa tersedia untuk
        penyewa, wali, pengelola, dan pemilik.
      </p>

      <ul class="info-list">
        <li>Pengumuman resmi dari pengelola</li>
        <li>Laporan kerusakan dengan status yang bisa dipantau</li>
        <li>Tagihan dan pembayaran sewa lewat Payment Gateway</li>
      </ul>
    </div>
  </section>

  <!-- PANEL KANAN -->
  <section class="login-form-section">
    <!-- BRAND KHUSUS MOBILE -->
    <div class="mobile-brand">
      <div class="mobile-brand-icon" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 3L3 10v11h6v-6h6v6h6V10l-9-7z" />
        </svg>
      </div>
      <span class="mobile-brand-name">Hunify</span>
    </div>

    <div class="login-container">
      {#if !$currentUser}
        <div class="login-heading">
          <h2>Masuk ke Akun Anda</h2>
          <p>Masuk untuk melihat pengumuman, laporan, dan tagihan.</p>
        </div>

        <form onsubmit={handleLogin}>
          <!-- EMAIL -->
          <div class="form-group">
            <label for="email">Email</label>

            <input
              id="email"
              type="email"
              bind:value={email}
              placeholder="Masukkan email"
              autocomplete="email"
              required
            />
          </div>

          <!-- PASSWORD -->
          <div class="form-group">
            <label for="password">Kata sandi</label>

            <div class="password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                bind:value={password}
                placeholder="Masukkan kata sandi"
                autocomplete="current-password"
                required
              />

              <button
                type="button"
                class="toggle-password"
                onclick={togglePassword}
                aria-label={showPassword
                  ? "Sembunyikan kata sandi"
                  : "Tampilkan kata sandi"}
                aria-pressed={showPassword}
              >
                {#if showPassword}
                  <!-- ICON EYE OFF (KATA SANDI TERLIHAT) -->
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" />
                    <path
                      d="M16.681 16.673a8.717 8.717 0 0 1-4.681 1.327c-3.6 0-6.6-2-9-6c1.272-2.12 2.712-3.678 4.32-4.674m2.86-1.146a9.055 9.055 0 0 1 1.82-.18c3.6 0 6.6 2 9 6a16.683 16.683 0 0 1-2.13 2.977"
                    />
                  </svg>
                {:else}
                  <!-- ICON EYE (KATA SANDI DISEMBUNYIKAN) -->
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M2.5 12C4.4 7.9 8 5.5 12 5.5C16 5.5 19.6 7.9 21.5 12C19.6 16.1 16 18.5 12 18.5C8 18.5 4.4 16.1 2.5 12Z"
                      stroke="currentColor"
                      stroke-width="2.1"
                      stroke-linejoin="round"
                    />
                    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          <!-- ERROR MESSAGE -->
          {#if errorMessage}
            <p class="error-message">{errorMessage}</p>
          {/if}

          <!-- LOGIN BUTTON -->
          <button class="login-button" type="submit" disabled={loading}>
            {loading ? "Sedang masuk..." : "Masuk"}
          </button>
        </form>

        <p class="login-footer">Belum punya akun? Hubungi pengelola kos.</p>
      {:else}
        <!-- USER PROFILE -->
        <div class="logged-in">
          <h2>Login Berhasil!</h2>

          <p>Nama: {$currentUser.name}</p>
          <p>Email: {$currentUser.email}</p>
          <p>Role: {$currentUser.role}</p>
          <p>ID: {$currentUser.id}</p>

          <button class="login-button" onclick={handleLogout}> Logout </button>
        </div>
      {/if}
    </div>
  </section>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    background-color: #faf7f2;
  }

  /* MAIN LAYOUT */

  .login-page {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 100vh;
    background-color: #faf7f2;
  }

  /* PANEL KIRI */

  .login-info {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background-color: #2f2014;
    color: #ffffff;
    padding: 64px;
  }

  /* BRAND */

  .brand {
    position: absolute;
    top: 48px;
    left: 64px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-logo {
    display: block;
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  .brand-name {
    color: #ffffff;
    font-size: 20px;
    font-weight: 600;
  }

  /* INFORMASI KIRI */

  .info-content {
    max-width: 520px;
  }

  .info-content h1 {
    margin: 0 0 20px;
    font-size: 38px;
    line-height: 1.15;
    font-weight: 700;
    color: #ffffff;
  }

  .info-description {
    margin: 0 0 24px;
    color: #d8cdc3;
    font-size: 16px;
    line-height: 1.6;
  }

  .info-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-left: 18px;
    margin: 0;
    color: #e6ddd5;
    font-size: 14px;
    line-height: 1.5;
  }

  /* PANEL KANAN */

  .login-form-section {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px;
    background-color: #faf7f2;
  }

  /* Brand mobile disembunyikan di desktop */
  .mobile-brand {
    display: none;
  }

  .login-container {
    width: 100%;
    max-width: 400px;
  }

  .login-heading {
    margin-bottom: 28px;
  }

  .login-heading h2 {
    margin: 0 0 8px;
    color: #261a14;
    font-size: 30px;
    font-weight: 700;
  }

  .login-heading p {
    margin: 0;
    color: #9e8b7c;
    font-size: 14px;
    line-height: 1.6;
  }

  /* FORM */

  form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-group label {
    color: #261a14;
    font-size: 14px;
    font-weight: 600;
  }

  .form-group input {
    width: 100%;
    height: 54px;
    padding: 0 16px;
    border: 1px solid #e5ddd3;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s;
  }

  .form-group input::placeholder {
    color: #a39284;
  }

  .form-group input:focus {
    border-color: #684b36;
  }

  /* PASSWORD VISIBILITY */

  .password-wrapper {
    position: relative;
    width: 100%;
  }

  .password-wrapper input {
    padding-right: 48px;
  }

  .toggle-password {
    position: absolute;
    top: 50%;
    right: 14px;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: none;
    background: transparent;
    color: #7c5e47;
    cursor: pointer;
  }

  .toggle-password svg {
    display: block;
    color: #7c5e47;
  }

  .toggle-password:hover,
  .toggle-password:hover svg {
    color: #5c432d;
  }

  .toggle-password:focus-visible {
    outline: 2px solid #684b36;
    outline-offset: 3px;
    border-radius: 4px;
  }

  /* BUTTON */

  .login-button {
    width: 100%;
    height: 52px;
    margin-top: 6px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .login-button:hover {
    background-color: #563d2b;
  }

  .login-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  /* FOOTER DAN ERROR */

  .login-footer {
    margin-top: 18px;
    color: #9e8b7c;
    font-size: 13px;
    text-align: center;
  }

  .error-message {
    margin: 0;
    color: #c0392b;
    font-size: 14px;
  }

  /* LOGGED IN */

  .logged-in h2 {
    color: #261a14;
  }

  .logged-in p {
    color: #5c432d;
  }

  /* RESPONSIVE */

  @media (max-width: 768px) {
    .login-page {
      grid-template-columns: 1fr;
    }

    .login-info {
      display: none;
    }

    .login-form-section {
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      padding: 28px 24px 40px;
    }

    .mobile-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 44px;
    }

    .mobile-brand-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background-color: #684b36;
      color: #ffffff;
    }

    .mobile-brand-name {
      color: #261a14;
      font-size: 18px;
      font-weight: 700;
    }

    .login-container {
      max-width: 100%;
    }

    .login-heading h2 {
      font-size: 28px;
    }
  }
</style>
