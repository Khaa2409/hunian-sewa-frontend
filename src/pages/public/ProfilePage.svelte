<script>
  import { onMount } from "svelte";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  /**
   * @param {any} user
   * @returns {string}
   */
  function getUserPhone(user) {
    return user?.phone || user?.whatsapp || "";
  }

  let nameInput = $state($currentUser?.name || "");
  let phoneInput = $state(getUserPhone($currentUser));
  let roomInput = $state("");
  let relationInput = $state("");

  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");

  let showCurrentPassword = $state(false);
  let showNewPassword = $state(false);
  let showConfirmPassword = $state(false);

  let savingProfile = $state(false);
  let savingPassword = $state(false);

  let profileFeedback = $state("");
  let profileError = $state(false);

  let passwordFeedback = $state("");
  let passwordError = $state(false);

  let normalizedRole = $derived.by(() => {
    const r = String($currentUser?.role || "").toLowerCase();
    if (r === "guardian" || r === "wali") return "guardian";
    if (r === "tenant" || r === "penyewa") return "tenant";
    if (r === "owner" || r === "pemilik") return "owner";
    if (r === "caretaker" || r === "manager" || r === "pengelola") {
      return "caretaker";
    }
    return r;
  });

  let showRoomAndRelation = $derived(
    normalizedRole === "guardian" || normalizedRole === "tenant",
  );

  let relationLabel = $derived(
    normalizedRole === "guardian" ? "Penyewa" : "Wali",
  );

  /**
   * @param {any} user
   * @param {any} summaryPayload
   */
  function syncRoomAndRelation(user, summaryPayload) {
    const root =
      summaryPayload?.data && typeof summaryPayload.data === "object"
        ? summaryPayload.data
        : summaryPayload;
    const wards = Array.isArray(root?.wards) ? root.wards : [];
    const firstWard = wards[0] || null;

    const roomVal =
      user?.room_number ||
      user?.room?.room_number ||
      user?.room?.name ||
      user?.contract?.room_number ||
      user?.active_contract?.room_number ||
      root?.room_number ||
      root?.room?.room_number ||
      firstWard?.room_number ||
      firstWard?.room?.room_number ||
      "";

    roomInput = String(roomVal || "").trim() || "-";

    if (normalizedRole === "guardian") {
      const wardNames = wards
        .map((/** @type {any} */ w) => w?.name || w?.tenant_name)
        .filter(Boolean);
      const wardVal =
        user?.ward_name ||
        user?.tenant_name ||
        user?.ward?.name ||
        (wardNames.length > 0 ? wardNames.join(", ") : "") ||
        root?.ward_name ||
        "";
      relationInput = String(wardVal || "").trim() || "-";
    } else if (normalizedRole === "tenant") {
      const guardianVal =
        user?.guardian_name ||
        user?.wali_name ||
        user?.guardian?.name ||
        user?.wali?.name ||
        user?.contract?.guardian_name ||
        root?.guardian_name ||
        "";
      relationInput = String(guardianVal || "").trim() || "-";
    } else {
      relationInput = "";
    }
  }

  $effect(() => {
    if ($currentUser) {
      nameInput = $currentUser.name || "";
      phoneInput = getUserPhone($currentUser);
      syncRoomAndRelation($currentUser, null);
    }
  });

  onMount(async () => {
    if (!showRoomAndRelation) return;
    try {
      const [meRes, summaryRes] = await Promise.allSettled([
        apiRequest("/api/me", { method: "GET" }),
        apiRequest("/api/dashboard/summary", { method: "GET" }),
      ]);

      const meVal =
        meRes.status === "fulfilled" ? /** @type {any} */ (meRes.value) : null;
      const userObj =
        meVal?.data?.user ||
        meVal?.data ||
        meVal?.user ||
        meVal ||
        $currentUser ||
        {};
      const sumVal =
        summaryRes.status === "fulfilled"
          ? /** @type {any} */ (summaryRes.value)
          : null;

      syncRoomAndRelation(userObj, sumVal);
    } catch {
      syncRoomAndRelation($currentUser, null);
    }
  });

  /**
   * @param {string | null | undefined} name
   * @returns {string}
   */
  function getInitials(name) {
    if (!name || typeof name !== "string") return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * @param {string | null | undefined} role
   * @returns {string}
   */
  function getRoleLabel(role) {
    switch (String(role || "").toLowerCase()) {
      case "owner":
        return "Pemilik";
      case "caretaker":
        return "Pengelola";
      case "guardian":
        return "Wali";
      case "tenant":
        return "Penyewa";
      default:
        return role || "Pengguna";
    }
  }

  function handleResetProfileForm() {
    nameInput = $currentUser?.name || "";
    phoneInput = getUserPhone($currentUser);
    syncRoomAndRelation($currentUser, null);
    profileFeedback = "";
    profileError = false;
  }

  /**
   * @param {SubmitEvent} event
   */
  async function handleProfileSubmit(event) {
    event.preventDefault();
    profileFeedback = "";
    profileError = false;

    const trimmedName = nameInput.trim();
    const trimmedPhone = phoneInput.trim();

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      profileError = true;
      profileFeedback = "Nama lengkap wajib 2-100 karakter.";
      return;
    }

    if (trimmedPhone && !/^[0-9+\-]{8,20}$/.test(trimmedPhone)) {
      profileError = true;
      profileFeedback =
        "Format nomor telepon tidak valid (8-20 digit, boleh diawali +).";
      return;
    }

    savingProfile = true;
    try {
      /** @type {any} */
      const payload = { name: trimmedName };
      if (trimmedPhone) {
        payload.phone = trimmedPhone;
      }

      /** @type {any} */
      const res = await apiRequest("/api/me", {
        method: "PATCH",
        body: payload,
      });

      const updatedUser =
        res?.data && typeof res.data === "object" ? res.data : res?.user;
      currentUser.update((prev) => ({
        ...(prev || {}),
        ...(updatedUser && typeof updatedUser === "object" ? updatedUser : {}),
        name: updatedUser?.name ?? trimmedName,
        phone: updatedUser?.phone ?? (trimmedPhone || prev?.phone || ""),
      }));

      profileError = false;
      profileFeedback = res?.message || "Profil berhasil diperbarui.";
    } catch (/** @type {any} */ err) {
      profileError = true;
      profileFeedback = err?.message || "Gagal memperbarui profil.";
    } finally {
      savingProfile = false;
    }
  }

  /**
   * @param {SubmitEvent} event
   */
  async function handlePasswordSubmit(event) {
    event.preventDefault();
    passwordFeedback = "";
    passwordError = false;

    if (!currentPassword || !newPassword || !confirmPassword) {
      passwordError = true;
      passwordFeedback =
        "Lengkapi kata sandi lama, kata sandi baru, dan konfirmasi.";
      return;
    }

    if (newPassword.length < 8) {
      passwordError = true;
      passwordFeedback = "Kata sandi baru minimal 8 karakter.";
      return;
    }

    if (newPassword !== confirmPassword) {
      passwordError = true;
      passwordFeedback = "Konfirmasi kata sandi baru tidak cocok.";
      return;
    }

    savingPassword = true;
    try {
      /** @type {any} */
      const res = await apiRequest("/api/me/password", {
        method: "PATCH",
        body: {
          old_password: currentPassword,
          new_password: newPassword,
        },
      });

      currentPassword = "";
      newPassword = "";
      confirmPassword = "";
      passwordError = false;
      passwordFeedback = res?.message || "Password berhasil diubah.";
    } catch (/** @type {any} */ err) {
      passwordError = true;
      passwordFeedback = err?.message || "Gagal mengganti kata sandi.";
    } finally {
      savingPassword = false;
    }
  }
</script>

<DashboardLayout activeKey="">
  <div class="profile-page">
    <div class="profile-header">
      <h1 class="profile-title">Profil Saya</h1>
      <p class="profile-subtitle">Kelola data diri dan kata sandi akun Anda</p>
    </div>

    <div class="profile-layout">
      <!-- KARTU DATA DIRI -->
      <section class="card-main" aria-label="Informasi profil">
        <div class="identity-row">
          <div class="avatar-lg" aria-hidden="true">
            {getInitials(nameInput || $currentUser?.name)}
          </div>
          <div class="identity-text">
            <span class="user-fullname">
              {nameInput || $currentUser?.name || "Pengguna"}
            </span>
            <span class="role-badge">{getRoleLabel($currentUser?.role)}</span>
          </div>
        </div>

        <hr class="card-divider" />

        <form class="form-stack" onsubmit={handleProfileSubmit}>
          <div class="grid-two">
            <div class="field-group">
              <label class="label" for="profile-name">Nama lengkap</label>
              <input
                id="profile-name"
                type="text"
                class="input"
                bind:value={nameInput}
                placeholder="Nama lengkap"
              />
            </div>

            <div class="field-group">
              <label class="label" for="profile-phone">Nomor WA / telepon</label
              >
              <input
                id="profile-phone"
                type="text"
                class="input"
                bind:value={phoneInput}
                placeholder="0812-4444-5555"
              />
            </div>
          </div>

          <div class="grid-two">
            <div class="field-group">
              <label class="label" for="profile-email">Email</label>
              <input
                id="profile-email"
                type="email"
                class="input input-locked"
                value={$currentUser?.email || ""}
                readonly
                disabled
              />
              <span class="helper-text">
                Email dipakai untuk login dan tidak dapat diubah sendiri.{#if showRoomAndRelation}
                  Hubungi Pengelola bila perlu diganti.{/if}
              </span>
            </div>

            <div class="field-group">
              <label class="label" for="profile-role">Peran</label>
              <input
                id="profile-role"
                type="text"
                class="input input-locked"
                value={getRoleLabel($currentUser?.role)}
                readonly
                disabled
              />
            </div>
          </div>

          {#if showRoomAndRelation}
            <div class="grid-two">
              <div class="field-group">
                <label class="label" for="profile-room">Kamar</label>
                <input
                  id="profile-room"
                  type="text"
                  class="input input-locked"
                  value={roomInput}
                  readonly
                  disabled
                />
              </div>

              <div class="field-group">
                <label class="label" for="profile-relation"
                  >{relationLabel}</label
                >
                <input
                  id="profile-relation"
                  type="text"
                  class="input input-locked"
                  value={relationInput}
                  readonly
                  disabled
                />
                <span class="helper-text">
                  Penautan wali diatur oleh Pengelola atau Pemilik.
                </span>
              </div>
            </div>
          {/if}

          {#if profileFeedback}
            <p
              class="feedback-text {profileError ? 'error' : 'success'}"
              role="status"
            >
              {profileFeedback}
            </p>
          {/if}

          <div class="button-row">
            <button type="submit" class="btn-save" disabled={savingProfile}>
              {savingProfile ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
            <button
              type="button"
              class="btn-cancel"
              onclick={handleResetProfileForm}
              disabled={savingProfile}
            >
              Batal
            </button>
          </div>
        </form>
      </section>

      <!-- KARTU GANTI KATA SANDI -->
      <section class="card-side" aria-label="Ganti kata sandi">
        <h2 class="side-title">Ganti Kata Sandi</h2>

        <form class="form-stack" onsubmit={handlePasswordSubmit}>
          <div class="field-group">
            <label class="label" for="current-password">Kata sandi lama</label>
            <div class="input-password-wrapper">
              <input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                class="input input-with-eye"
                bind:value={currentPassword}
                placeholder="Masukkan kata sandi lama"
              />
              <button
                type="button"
                class="btn-eye"
                onclick={() => (showCurrentPassword = !showCurrentPassword)}
                aria-label={showCurrentPassword
                  ? "Sembunyikan kata sandi lama"
                  : "Lihat kata sandi lama"}
              >
                {#if showCurrentPassword}
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
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                {:else}
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
                    <path
                      d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
                    />
                    <path
                      d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
                    />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          <div class="field-group">
            <label class="label" for="new-password">Kata sandi baru</label>
            <div class="input-password-wrapper">
              <input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                class="input input-with-eye"
                bind:value={newPassword}
                placeholder="Minimal 8 karakter"
              />
              <button
                type="button"
                class="btn-eye"
                onclick={() => (showNewPassword = !showNewPassword)}
                aria-label={showNewPassword
                  ? "Sembunyikan kata sandi baru"
                  : "Lihat kata sandi baru"}
              >
                {#if showNewPassword}
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
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                {:else}
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
                    <path
                      d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
                    />
                    <path
                      d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
                    />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          <div class="field-group">
            <label class="label" for="confirm-password"
              >Konfirmasi kata sandi baru</label
            >
            <div class="input-password-wrapper">
              <input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                class="input input-with-eye"
                bind:value={confirmPassword}
                placeholder="Ulangi kata sandi baru"
              />
              <button
                type="button"
                class="btn-eye"
                onclick={() => (showConfirmPassword = !showConfirmPassword)}
                aria-label={showConfirmPassword
                  ? "Sembunyikan konfirmasi kata sandi"
                  : "Lihat konfirmasi kata sandi"}
              >
                {#if showConfirmPassword}
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
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                {:else}
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
                    <path
                      d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
                    />
                    <path
                      d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
                    />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          {#if passwordFeedback}
            <p
              class="feedback-text {passwordError ? 'error' : 'success'}"
              role="status"
            >
              {passwordFeedback}
            </p>
          {/if}

          <button
            type="submit"
            class="btn-save btn-block"
            disabled={savingPassword}
          >
            {savingPassword ? "Menyimpan..." : "Ganti Kata Sandi"}
          </button>

          <p class="side-footnote">
            Setelah diganti, Anda tetap masuk di perangkat ini.
          </p>
        </form>
      </section>
    </div>
  </div>
</DashboardLayout>

<style>
  .profile-page,
  .profile-page :global(input),
  .profile-page :global(button),
  .profile-page :global(label) {
    font-family: "Inter", sans-serif;
  }

  .profile-header {
    margin-bottom: 24px;
  }

  .profile-title {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
    color: #261a14;
    letter-spacing: -0.01em;
  }

  .profile-subtitle {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .profile-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(310px, 0.95fr);
    gap: 24px;
    align-items: start;
  }

  .card-main,
  .card-side {
    padding: 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .identity-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .avatar-lg {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 999px;
    background-color: #efe6dc;
    color: #5c432d;
    font-size: 15px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .identity-text {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .user-fullname {
    font-size: 17px;
    font-weight: 700;
    color: #261a14;
  }

  .role-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    background-color: #f3ece4;
    color: #6b4e38;
    font-size: 11px;
    font-weight: 600;
  }

  .card-divider {
    border: none;
    border-top: 1px solid #f0e8df;
    margin: 20px 0;
  }

  .form-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .grid-two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label {
    font-size: 12px;
    font-weight: 600;
    color: #261a14;
  }

  .input {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 13px;
    box-sizing: border-box;
  }

  .input::placeholder {
    color: #b0a092;
  }

  .input:focus {
    outline: none;
    border-color: #684b36;
  }

  .input-locked {
    background-color: #f4efe9;
    color: #968577;
    cursor: not-allowed;
  }

  .helper-text {
    font-size: 11px;
    color: #a88f7a;
    line-height: 1.4;
  }

  .feedback-text {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
  }

  .feedback-text.success {
    color: #15803d;
  }

  .feedback-text.error {
    color: #c62828;
  }

  .button-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }

  .btn-save {
    height: 38px;
    padding: 0 18px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-save:hover:not(:disabled) {
    background-color: #553c2a;
  }

  .btn-save:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn-block {
    width: 100%;
    margin-top: 4px;
  }

  .btn-cancel {
    height: 38px;
    padding: 0 16px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-cancel:hover:not(:disabled) {
    background-color: #faf7f2;
  }

  .side-title {
    margin: 0 0 18px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .input-password-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-with-eye {
    padding-right: 38px;
  }

  .btn-eye {
    position: absolute;
    right: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: #8c7b6e;
    cursor: pointer;
  }

  .btn-eye:hover {
    color: #261a14;
  }

  .side-footnote {
    margin: 2px 0 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  @media (max-width: 960px) {
    .profile-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .profile-header {
      margin-bottom: 18px;
    }

    .profile-title {
      font-size: 22px;
      margin-bottom: 4px;
    }
  }

  @media (max-width: 640px) {
    .grid-two {
      grid-template-columns: 1fr;
    }

    .card-main,
    .card-side {
      padding: 18px;
    }
  }
</style>
