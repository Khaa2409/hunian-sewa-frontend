<script>
  import { onMount } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  let selectedRole = $state("all"); // 'all' | 'tenant' | 'guardian' | 'manager' | 'owner'
  let searchQuery = $state("");

  // --- STATE DATA API & PAGINATION ---
  let loading = $state(true);
  let errorMsg = $state("");
  /** @type {any[]} */
  let users = $state([]);
  /** @type {any[]} */
  let guardianOptions = $state([]);
  let allUsersCount = $state(0);

  let currentPage = $state(1);
  const perPage = 10;

  // Menyimpan password sementara per user.id selama halaman ini aktif
  /** @type {Record<string, string>} */
  let sessionTempPasswords = $state({});
  /** @type {string | null} */
  let copiedRowUserId = $state(null);

  let roleCounts = $state({
    all: 0,
    tenant: 0,
    guardian: 0,
    manager: 0,
    owner: 0,
  });

  // --- OVERLAY / DRAWER & MODAL STATE ---
  /** @type {'create' | 'edit' | 'deactivate' | 'activate' | 'reset-password' | null} */
  let activeOverlay = $state(null);
  /** @type {any} */
  let targetUser = $state(null);

  let isSubmitting = $state(false);
  let formError = $state("");
  let createdTempPassword = $state("");
  let createdUserName = $state("");
  let resetTempPassword = $state("");
  let resetInfoMessage = $state("");
  let copiedTempPass = $state(false);

  // Form Daftarkan Akun Baru
  let newName = $state("");
  let newEmail = $state("");
  let newPhone = $state("");
  let newRole = $state("tenant");
  let newGuardianId = $state("");

  // Form Ubah Akun
  let editName = $state("");
  let editEmail = $state("");
  let editPhone = $state("");
  let editRole = $state("tenant");
  let editGuardianId = $state("");

  let displayOwnerName = $derived($currentUser?.name || "Bu Ratna");
  let displayOwnerRole = $derived.by(() => {
    const role = ($currentUser?.role || "owner").toLowerCase();
    if (role === "owner") return "Pemilik";
    return $currentUser?.role || "Pemilik";
  });

  /**
   * @param {string} roleKey
   */
  function getRolePriority(roleKey) {
    /** @type {Record<string, number>} */
    const rank = {
      tenant: 1,
      guardian: 2,
      manager: 3,
      owner: 4,
    };
    return rank[String(roleKey || "").toLowerCase()] ?? 99;
  }

  /**
   * @param {any[]} items
   */
  function sortUsersByRoleOrder(items) {
    return [...items].sort((a, b) => {
      const rankDiff = getRolePriority(a.role) - getRolePriority(b.role);
      if (rankDiff !== 0) return rankDiff;
      return String(a.name || "").localeCompare(String(b.name || ""), "id", {
        sensitivity: "base",
      });
    });
  }

  let filteredUsers = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    const baseList = !q
      ? users
      : users.filter((/** @type {any} */ u) => {
          return (
            String(u.name || "")
              .toLowerCase()
              .includes(q) ||
            String(u.email || "")
              .toLowerCase()
              .includes(q) ||
            String(u.phone || "")
              .toLowerCase()
              .includes(q) ||
            String(u.roleLabel || "")
              .toLowerCase()
              .includes(q) ||
            String(u.roleShort || "")
              .toLowerCase()
              .includes(q) ||
            String(u.guardian || "")
              .toLowerCase()
              .includes(q)
          );
        });

    return sortUsersByRoleOrder(baseList);
  });

  let totalPages = $derived.by(() => {
    return Math.max(1, Math.ceil(filteredUsers.length / perPage));
  });

  let pagedUsers = $derived.by(() => {
    const start = (currentPage - 1) * perPage;
    return filteredUsers.slice(start, start + perPage);
  });

  let startUserIndex = $derived.by(() => {
    if (filteredUsers.length === 0) return 0;
    return (currentPage - 1) * perPage + 1;
  });

  let endUserIndex = $derived.by(() => {
    if (filteredUsers.length === 0) return 0;
    return Math.min(currentPage * perPage, filteredUsers.length);
  });

  /**
   * @param {any} userId
   * @param {string} tempPass
   */
  function setSessionTempPassword(userId, tempPass) {
    if (!userId || !tempPass) return;
    sessionTempPasswords = {
      ...sessionTempPasswords,
      [String(userId)]: tempPass,
    };
  }

  /**
   * @param {any} userId
   * @param {string} tempPass
   * @param {Event} [event]
   */
  async function handleCopyRowPassword(userId, tempPass, event) {
    if (event) event.stopPropagation();
    if (!tempPass) return;

    try {
      await navigator.clipboard.writeText(tempPass);
      copiedRowUserId = String(userId);
      setTimeout(() => {
        if (copiedRowUserId === String(userId)) {
          copiedRowUserId = null;
        }
      }, 2000);
    } catch {
      copiedRowUserId = null;
    }
  }

  /**
   * @param {string} roleKey
   */
  function mapRoleToApi(roleKey) {
    const val = String(roleKey || "").toLowerCase();
    if (val === "manager" || val === "pengelola") return "caretaker";
    return val;
  }

  /**
   * @param {string} roleKey
   */
  function getRoleShortLabel(roleKey) {
    /** @type {Record<string, string>} */
    const map = {
      tenant: "Penyewa",
      guardian: "Wali",
      manager: "Pengelola",
      caretaker: "Pengelola",
      admin: "Pengelola",
      owner: "Pemilik",
    };
    return map[String(roleKey || "").toLowerCase()] || "Penyewa";
  }

  /**
   * @param {any} rawRole
   */
  function normalizeRole(rawRole) {
    const val = String(rawRole || "").toLowerCase();
    if (val === "tenant" || val === "penyewa") return "tenant";
    if (val === "guardian" || val === "wali") return "guardian";
    if (
      val === "manager" ||
      val === "caretaker" ||
      val === "pengelola" ||
      val === "admin"
    )
      return "manager";
    if (val === "owner" || val === "pemilik") return "owner";
    return "tenant";
  }

  /**
   * @param {any} raw
   */
  function normalizeStatus(raw) {
    if (typeof raw?.is_active === "boolean") {
      return raw.is_active ? "active" : "inactive";
    }
    const val = String(raw?.status || "").toLowerCase();
    if (
      val === "inactive" ||
      val === "nonaktif" ||
      val === "disabled" ||
      val === "blocked"
    )
      return "inactive";
    return "active";
  }

  /**
   * @param {any} raw
   * @param {any[]} allRawItems
   */
  function normalizeUserItem(raw, allRawItems = []) {
    const roleKey = normalizeRole(raw.role);
    const roleShort = getRoleShortLabel(roleKey);
    const statusKey = normalizeStatus(raw);
    const roomNum =
      raw.room_number ||
      raw.room?.room_number ||
      raw.contract?.room_number ||
      "";
    const guardianName =
      raw.guardian_name || raw.guardian?.name || raw.guardian || "";
    const guardianId = raw.guardian_id || raw.guardian?.id || "";
    const userName = raw.name || raw.full_name || "Pengguna";

    let roleLabel = roleShort;
    if (roleKey === "tenant") {
      if (roomNum) roleLabel = `${roleShort} · Kamar ${roomNum}`;
      else if (guardianName) roleLabel = `${roleShort} · Wali: ${guardianName}`;
    } else if (roleKey === "guardian") {
      /** @type {string[]} */
      const linkedTenants = [];

      if (Array.isArray(raw.tenants)) {
        for (const t of raw.tenants) {
          const tName = typeof t === "string" ? t : t?.name || t?.full_name;
          if (tName && !linkedTenants.includes(tName))
            linkedTenants.push(tName);
        }
      }

      if (raw.tenant_name && !linkedTenants.includes(raw.tenant_name)) {
        linkedTenants.push(raw.tenant_name);
      }

      for (const candidate of allRawItems) {
        if (normalizeRole(candidate.role) !== "tenant") continue;
        const cGuardianId =
          candidate.guardian_id || candidate.guardian?.id || "";
        const cGuardianName =
          candidate.guardian_name ||
          candidate.guardian?.name ||
          candidate.guardian ||
          "";
        const matchedById =
          raw.id !== undefined &&
          cGuardianId !== "" &&
          String(cGuardianId) === String(raw.id);
        const matchedByName =
          guardianName === "" &&
          cGuardianName &&
          String(cGuardianName).trim().toLowerCase() ===
            String(userName).trim().toLowerCase();

        if (matchedById || matchedByName) {
          const tName = candidate.name || candidate.full_name || "";
          if (tName && !linkedTenants.includes(tName)) {
            linkedTenants.push(tName);
          }
        }
      }

      if (linkedTenants.length > 0) {
        roleLabel = `${roleShort} · Penyewa: ${linkedTenants.join(", ")}`;
      }
    }

    return {
      id: raw.id,
      name: userName,
      email: raw.email || "-",
      phone: raw.phone || raw.phone_number || "-",
      role: roleKey,
      rawRole: raw.role,
      roleShort,
      roleLabel,
      guardian: guardianName,
      guardianId: guardianId,
      status: statusKey,
      statusLabel: statusKey === "active" ? "Aktif" : "Nonaktif",
    };
  }

  /**
   * @param {any} response
   * @param {any[]} items
   */
  function applyCountsFromResponse(response, items) {
    const countsObj =
      response?.counts || response?.meta?.counts || response?.summary;
    if (countsObj && typeof countsObj === "object") {
      const tVal = Number(countsObj.tenant ?? countsObj.penyewa ?? 0);
      const gVal = Number(countsObj.guardian ?? countsObj.wali ?? 0);
      const mVal = Number(
        countsObj.caretaker ?? countsObj.manager ?? countsObj.pengelola ?? 0,
      );
      const oVal = Number(countsObj.owner ?? countsObj.pemilik ?? 0);
      const allVal = Number(
        countsObj.all ?? countsObj.total ?? tVal + gVal + mVal + oVal,
      );

      if (Number.isFinite(allVal)) {
        allUsersCount = allVal;
      }

      roleCounts = {
        all: Number.isFinite(allVal) ? allVal : allUsersCount,
        tenant: Number.isFinite(tVal) ? tVal : roleCounts.tenant,
        guardian: Number.isFinite(gVal) ? gVal : roleCounts.guardian,
        manager: Number.isFinite(mVal) ? mVal : roleCounts.manager,
        owner: Number.isFinite(oVal) ? oVal : roleCounts.owner,
      };
      return;
    }

    if (selectedRole === "all") {
      const apiTotal = Number(
        response?.meta?.total ?? response?.total ?? items.length,
      );
      allUsersCount = Number.isFinite(apiTotal) ? apiTotal : items.length;
      roleCounts = {
        all: allUsersCount,
        tenant: items.filter((/** @type {any} */ u) => u.role === "tenant")
          .length,
        guardian: items.filter((/** @type {any} */ u) => u.role === "guardian")
          .length,
        manager: items.filter((/** @type {any} */ u) => u.role === "manager")
          .length,
        owner: items.filter((/** @type {any} */ u) => u.role === "owner")
          .length,
      };
    } else {
      roleCounts = {
        ...roleCounts,
        all: allUsersCount,
      };
    }
  }

  async function fetchUsers() {
    loading = true;
    errorMsg = "";

    try {
      const params = new URLSearchParams();
      if (selectedRole !== "all") {
        params.set("role", mapRoleToApi(selectedRole));
      }
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }

      const queryStr = params.toString();
      const endpoint = queryStr ? `/api/users?${queryStr}` : "/api/users";
      /** @type {any} */
      const response = await apiRequest(endpoint);

      const rawItems = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.users)
          ? response.users
          : Array.isArray(response)
            ? response
            : [];

      const normalized = sortUsersByRoleOrder(
        rawItems.map((/** @type {any} */ item) =>
          normalizeUserItem(item, rawItems),
        ),
      );
      users = normalized;

      const guardians = normalized
        .filter((/** @type {any} */ u) => u.role === "guardian")
        .map((/** @type {any} */ u) => ({ id: u.id, name: u.name }));
      if (guardians.length > 0) {
        guardianOptions = guardians;
      }

      applyCountsFromResponse(response, normalized);
    } catch (/** @type {any} */ err) {
      errorMsg = err?.message || "Gagal memuat daftar pengguna.";
      users = [];
      roleCounts = { all: 0, tenant: 0, guardian: 0, manager: 0, owner: 0 };
    } finally {
      loading = false;
    }
  }

  /**
   * @param {string} roleKey
   */
  function selectRoleTab(roleKey) {
    selectedRole = roleKey;
    currentPage = 1;
    fetchUsers();
  }

  function handlePrevUserPage() {
    if (currentPage > 1) {
      currentPage -= 1;
    }
  }

  function handleNextUserPage() {
    if (currentPage < totalPages) {
      currentPage += 1;
    }
  }

  function openCreateOverlay() {
    formError = "";
    createdTempPassword = "";
    createdUserName = "";
    copiedTempPass = false;
    targetUser = null;
    newName = "";
    newEmail = "";
    newPhone = "";
    newRole = "tenant";
    newGuardianId = "";
    activeOverlay = "create";
  }

  /**
   * @param {any} user
   */
  function openEditOverlay(user) {
    formError = "";
    targetUser = user;
    editName = user.name;
    editEmail = user.email;
    editPhone = user.phone !== "-" ? user.phone : "";
    editRole = user.role;
    editGuardianId = user.guardianId ? String(user.guardianId) : "";
    activeOverlay = "edit";
  }

  /**
   * @param {any} user
   */
  function openDeactivateOverlay(user) {
    if (user.role === "owner") return;
    formError = "";
    targetUser = user;
    activeOverlay = "deactivate";
  }

  /**
   * @param {any} user
   */
  function openActivateOverlay(user) {
    formError = "";
    targetUser = user;
    activeOverlay = "activate";
  }

  /**
   * @param {any} user
   */
  function openResetPasswordOverlay(user) {
    formError = "";
    resetTempPassword = "";
    resetInfoMessage = "";
    copiedTempPass = false;
    targetUser = user;
    activeOverlay = "reset-password";
  }

  function closeOverlay() {
    if (isSubmitting) return;
    activeOverlay = null;
    targetUser = null;
    formError = "";
    createdTempPassword = "";
    createdUserName = "";
    resetTempPassword = "";
    resetInfoMessage = "";
    copiedTempPass = false;
  }

  /**
   * @param {string} val
   */
  async function copyPasswordValue(val) {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      copiedTempPass = true;
      setTimeout(() => {
        copiedTempPass = false;
      }, 2000);
    } catch {
      copiedTempPass = false;
    }
  }

  /**
   * @param {SubmitEvent} e
   */
  async function handleCreateSubmit(e) {
    e.preventDefault();
    formError = "";
    createdTempPassword = "";
    createdUserName = "";
    copiedTempPass = false;

    const cleanName = newName.trim();
    const cleanEmail = newEmail.trim();
    const cleanPhone = newPhone.trim();

    if (!cleanName || !cleanEmail || !cleanPhone) {
      formError = "Nama, email, nomor telepon, dan peran wajib diisi.";
      return;
    }

    isSubmitting = true;
    try {
      /** @type {any} */
      const payload = {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        role: mapRoleToApi(newRole),
      };

      if (newRole === "tenant" && newGuardianId) {
        payload.guardian_id = Number(newGuardianId);
      }

      /** @type {any} */
      const res = await apiRequest("/api/users", {
        method: "POST",
        body: payload,
      });

      const createdId = res?.data?.id;
      const tempPass = res?.temporary_password || "";

      if (createdId && tempPass) {
        setSessionTempPassword(createdId, tempPass);
      }

      if (tempPass) {
        createdTempPassword = tempPass;
        createdUserName = res?.data?.name || cleanName;
      }

      await fetchUsers();
      if (!createdTempPassword) {
        closeOverlay();
      }
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal mendaftarkan akun baru.";
    } finally {
      isSubmitting = false;
    }
  }

  /**
   * @param {SubmitEvent} e
   */
  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!targetUser) return;
    formError = "";

    const cleanName = editName.trim() || targetUser.name;
    const cleanPhone = editPhone.trim();

    isSubmitting = true;
    try {
      /** @type {any} */
      const payload = {
        name: cleanName,
        phone: cleanPhone,
      };

      if (editRole === "tenant") {
        payload.guardian_id = editGuardianId ? Number(editGuardianId) : null;
      }

      await apiRequest(`/api/users/${targetUser.id}`, {
        method: "PATCH",
        body: payload,
      });

      closeOverlay();
      await fetchUsers();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal memperbarui data pengguna.";
    } finally {
      isSubmitting = false;
    }
  }

  async function handleConfirmDeactivate() {
    if (!targetUser || targetUser.role === "owner") return;
    formError = "";
    isSubmitting = true;

    try {
      await apiRequest(`/api/users/${targetUser.id}/deactivate`, {
        method: "PATCH",
      });

      closeOverlay();
      await fetchUsers();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal menonaktifkan akun.";
    } finally {
      isSubmitting = false;
    }
  }

  async function handleConfirmActivate() {
    if (!targetUser) return;
    formError = "";
    isSubmitting = true;

    try {
      await apiRequest(`/api/users/${targetUser.id}/activate`, {
        method: "PATCH",
      });

      closeOverlay();
      await fetchUsers();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal mengaktifkan akun.";
    } finally {
      isSubmitting = false;
    }
  }

  async function handleConfirmResetPassword() {
    if (!targetUser) return;
    formError = "";
    resetTempPassword = "";
    resetInfoMessage = "";
    copiedTempPass = false;
    isSubmitting = true;

    try {
      /** @type {any} */
      const res = await apiRequest(
        `/api/users/${targetUser.id}/reset-password`,
        {
          method: "PATCH",
        },
      );

      const tempPass = res?.temporary_password || "";
      if (tempPass) {
        setSessionTempPassword(targetUser.id, tempPass);
      }

      resetTempPassword = tempPass;
      resetInfoMessage =
        res?.message ||
        `Password akun ${targetUser.name} berhasil direset. Salin dan berikan ke pengguna untuk diganti di profil.`;
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal mereset password akun.";
    } finally {
      isSubmitting = false;
    }
  }

  onMount(() => {
    fetchUsers();
  });
</script>

<DashboardLayout
  activeKey="users"
  ownerName={displayOwnerName}
  ownerRole={displayOwnerRole}
>
  <div class="users-page" in:fly={{ y: 16, duration: 250, easing: cubicOut }}>
    <!-- HEADER HALAMAN -->
    <div class="users-top-bar">
      <div>
        <h1 class="users-title">Kelola Pengguna</h1>
        <p class="users-subtitle">
          <span class="desktop-only"
            >Kelola akun pengguna, password awal/sementara, dan status akses
            sistem</span
          >
          <span class="mobile-only"
            >Daftar akun Pemilik, Pengelola, Penyewa, dan Wali.</span
          >
        </p>
      </div>

      <button
        type="button"
        class="btn-create-user desktop-only"
        onclick={openCreateOverlay}
      >
        Daftarkan Akun
      </button>
    </div>

    <!-- MOBILE CONTROLS -->
    <div class="mobile-only mobile-controls-stack">
      <button
        type="button"
        class="btn-mobile-create-full"
        onclick={openCreateOverlay}
      >
        Daftarkan Akun
      </button>

      <div
        class="role-pills-wrap"
        role="tablist"
        aria-label="Filter peran pengguna mobile"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "all"}
          class="role-pill {selectedRole === 'all' ? 'active' : ''}"
          onclick={() => selectRoleTab("all")}
        >
          Semua ({roleCounts.all})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "tenant"}
          class="role-pill {selectedRole === 'tenant' ? 'active' : ''}"
          onclick={() => selectRoleTab("tenant")}
        >
          Penyewa ({roleCounts.tenant})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "guardian"}
          class="role-pill {selectedRole === 'guardian' ? 'active' : ''}"
          onclick={() => selectRoleTab("guardian")}
        >
          Wali ({roleCounts.guardian})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "manager"}
          class="role-pill {selectedRole === 'manager' ? 'active' : ''}"
          onclick={() => selectRoleTab("manager")}
        >
          Pengelola ({roleCounts.manager})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "owner"}
          class="role-pill {selectedRole === 'owner' ? 'active' : ''}"
          onclick={() => selectRoleTab("owner")}
        >
          Pemilik ({roleCounts.owner})
        </button>
      </div>

      <div class="mobile-search-box">
        <svg
          class="mobile-search-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          class="mobile-search-input"
          bind:value={searchQuery}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              currentPage = 1;
              fetchUsers();
            }
          }}
          placeholder="Cari nama atau email..."
          aria-label="Cari nama atau email"
        />
      </div>
    </div>

    <!-- DESKTOP FILTER + SEARCH -->
    <div class="desktop-filter-row desktop-only">
      <div class="role-tabs" role="tablist" aria-label="Filter peran pengguna">
        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "all"}
          class="role-tab {selectedRole === 'all' ? 'active' : ''}"
          onclick={() => selectRoleTab("all")}
        >
          Semua ({roleCounts.all})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "tenant"}
          class="role-tab {selectedRole === 'tenant' ? 'active' : ''}"
          onclick={() => selectRoleTab("tenant")}
        >
          Penyewa ({roleCounts.tenant})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "guardian"}
          class="role-tab {selectedRole === 'guardian' ? 'active' : ''}"
          onclick={() => selectRoleTab("guardian")}
        >
          Wali ({roleCounts.guardian})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "manager"}
          class="role-tab {selectedRole === 'manager' ? 'active' : ''}"
          onclick={() => selectRoleTab("manager")}
        >
          Pengelola ({roleCounts.manager})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedRole === "owner"}
          class="role-tab {selectedRole === 'owner' ? 'active' : ''}"
          onclick={() => selectRoleTab("owner")}
        >
          Pemilik ({roleCounts.owner})
        </button>
      </div>

      <div class="desktop-search-wrap">
        <svg
          class="desktop-search-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          class="desktop-search-input"
          bind:value={searchQuery}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              currentPage = 1;
              fetchUsers();
            }
          }}
          placeholder="Cari nama atau email"
          aria-label="Cari nama atau email"
        />
      </div>
    </div>

    {#if loading}
      <div class="state-card" in:fade={{ duration: 160 }}>
        Memuat data pengguna...
      </div>
    {:else if errorMsg}
      <div class="state-card error" in:fade={{ duration: 160 }}>
        <span>{errorMsg}</span>
        <button type="button" class="btn-retry" onclick={fetchUsers}
          >Coba Lagi</button
        >
      </div>
    {:else if filteredUsers.length === 0}
      <div class="state-card" in:fade={{ duration: 160 }}>
        {searchQuery.trim()
          ? `Tidak ada pengguna yang cocok dengan "${searchQuery.trim()}".`
          : "Belum ada akun pengguna yang ditemukan."}
      </div>
    {:else}
      <!-- MOBILE CARD LIST -->
      <div class="mobile-only user-card-list" in:fade={{ duration: 160 }}>
        {#each pagedUsers as user (user.id)}
          {@const rowTempPass = sessionTempPasswords[String(user.id)]}
          <article class="user-card">
            <div class="user-card-top">
              <div>
                <h2 class="user-name">{user.name}</h2>
                <p class="user-email">{user.email}</p>
              </div>
              <span class="badge-status {user.status}">{user.statusLabel}</span>
            </div>

            <div class="user-card-bottom">
              <div>
                <span class="meta-lbl">Peran</span>
                <span class="meta-val">{user.roleLabel}</span>
              </div>
              <div>
                <span class="meta-lbl">No. HP</span>
                <span class="meta-val">{user.phone}</span>
              </div>
            </div>

            {#if rowTempPass}
              <div
                class="mobile-pass-row"
                role="button"
                tabindex="0"
                onclick={(e) => handleCopyRowPassword(user.id, rowTempPass, e)}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleCopyRowPassword(user.id, rowTempPass, e);
                  }
                }}
              >
                <span class="meta-lbl"
                  >Password Awal / Sementara (klik untuk salin)</span
                >
                <div class="pass-chip-wrap">
                  <code class="table-pass-code">{rowTempPass}</code>
                  <span class="copy-icon-btn" title="Salin password">
                    {#if copiedRowUserId === String(user.id)}
                      <span class="copied-text">Tersalin</span>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"
                        ></rect>
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        ></path>
                      </svg>
                    {/if}
                  </span>
                </div>
              </div>
            {/if}

            <div class="user-card-footer-action">
              <button
                type="button"
                class="btn-link-reset"
                onclick={() => openEditOverlay(user)}
              >
                Ubah
              </button>

              <button
                type="button"
                class="btn-link-reset"
                onclick={() => openResetPasswordOverlay(user)}
              >
                Reset Password
              </button>

              {#if user.role !== "owner"}
                {#if user.status === "active"}
                  <button
                    type="button"
                    class="btn-link-deactivate"
                    onclick={() => openDeactivateOverlay(user)}
                  >
                    Nonaktifkan Akun
                  </button>
                {:else}
                  <button
                    type="button"
                    class="btn-link-activate"
                    onclick={() => openActivateOverlay(user)}
                  >
                    Aktifkan Kembali
                  </button>
                {/if}
              {/if}
            </div>
          </article>
        {/each}

        {#if totalPages > 1}
          <div class="mobile-pagination-wrap">
            <button
              type="button"
              class="page-btn"
              onclick={handlePrevUserPage}
              disabled={currentPage <= 1 || loading}
            >
              Sebelumnya
            </button>
            <span class="pagination-page-info"
              >Hal {currentPage} / {totalPages}</span
            >
            <button
              type="button"
              class="page-btn"
              onclick={handleNextUserPage}
              disabled={currentPage >= totalPages || loading}
            >
              Berikutnya
            </button>
          </div>
        {/if}
      </div>

      <!-- DESKTOP TABLE CARD -->
      <section
        class="desktop-users-card desktop-only"
        aria-label="Daftar akun pengguna"
        in:fade={{ duration: 160 }}
      >
        <div class="desktop-card-header">
          <h2 class="desktop-card-title">Daftar Akun Pengguna</h2>
          <p class="desktop-card-subtitle">
            Klik password yang baru dibuat/direset atau ikon salin di sebelahnya
            untuk menyalin lalu berikan ke pengguna
          </p>
        </div>

        <div class="table-wrap">
          <table class="users-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Peran</th>
                <th>Email</th>
                <th>No. HP</th>
                <th>Password</th>
                <th>Status</th>
                <th class="col-action">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {#each pagedUsers as user (user.id)}
                {@const rowTempPass = sessionTempPasswords[String(user.id)]}
                <tr>
                  <td class="cell-name">{user.name}</td>
                  <td class="cell-role">{user.roleLabel}</td>
                  <td class="cell-muted">{user.email}</td>
                  <td class="cell-muted">{user.phone}</td>
                  <td class="cell-password">
                    {#if rowTempPass}
                      <div
                        class="password-copy-cell"
                        role="button"
                        tabindex="0"
                        title="Klik untuk menyalin password"
                        onclick={(e) =>
                          handleCopyRowPassword(user.id, rowTempPass, e)}
                        onkeydown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleCopyRowPassword(user.id, rowTempPass, e);
                          }
                        }}
                      >
                        <code class="table-pass-code">{rowTempPass}</code>
                        <button
                          type="button"
                          class="copy-icon-btn"
                          title="Salin password"
                          aria-label="Salin password"
                          onclick={(e) =>
                            handleCopyRowPassword(user.id, rowTempPass, e)}
                        >
                          {#if copiedRowUserId === String(user.id)}
                            <span class="copied-text">Tersalin</span>
                          {:else}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-hidden="true"
                            >
                              <rect
                                x="9"
                                y="9"
                                width="13"
                                height="13"
                                rx="2"
                                ry="2"
                              ></rect>
                              <path
                                d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                              ></path>
                            </svg>
                          {/if}
                        </button>
                      </div>
                    {:else}
                      <span class="cell-muted">-</span>
                    {/if}
                  </td>
                  <td>
                    <span class="badge-status {user.status}"
                      >{user.statusLabel}</span
                    >
                  </td>
                  <td class="col-action">
                    <div class="action-btns">
                      <button
                        type="button"
                        class="btn-edit-box"
                        onclick={() => openEditOverlay(user)}
                      >
                        Ubah
                      </button>
                      <button
                        type="button"
                        class="btn-reset-box"
                        onclick={() => openResetPasswordOverlay(user)}
                      >
                        Reset Sandi
                      </button>
                      {#if user.role !== "owner"}
                        {#if user.status === "active"}
                          <button
                            type="button"
                            class="btn-deactivate-red"
                            onclick={() => openDeactivateOverlay(user)}
                          >
                            Nonaktifkan
                          </button>
                        {:else}
                          <button
                            type="button"
                            class="btn-activate-brown"
                            onclick={() => openActivateOverlay(user)}
                          >
                            Aktifkan
                          </button>
                        {/if}
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="pagination-bar">
          <span class="pagination-summary">
            {#if filteredUsers.length > 0}
              Menampilkan {startUserIndex}-{endUserIndex} dari {filteredUsers.length}
              pengguna
            {:else}
              Menampilkan 0 pengguna
            {/if}
          </span>
          <div class="pagination-controls">
            <span class="pagination-page-info"
              >Halaman {currentPage} dari {totalPages || 1}</span
            >
            <button
              type="button"
              class="page-btn"
              onclick={handlePrevUserPage}
              disabled={currentPage <= 1 || loading}
            >
              Sebelumnya
            </button>
            <button
              type="button"
              class="page-btn"
              onclick={handleNextUserPage}
              disabled={currentPage >= (totalPages || 1) || loading}
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>
    {/if}
  </div>

  <!-- DRAWER / BOTTOM SHEET: DAFTARKAN AKUN BARU -->
  {#if activeOverlay === "create"}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeOverlay}
      role="presentation"
    ></div>
    <div
      class="right-sheet sheet-capable"
      role="dialog"
      aria-modal="true"
      aria-label="Daftarkan Akun Baru"
      transition:fly={{ x: 300, duration: 250, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>
      <div class="sheet-top">
        <h2 class="sheet-title">Daftarkan Akun Baru</h2>
        <button
          type="button"
          class="sheet-x"
          onclick={closeOverlay}
          aria-label="Tutup">&times;</button
        >
      </div>

      {#if formError}
        <div class="form-error-banner" in:fade={{ duration: 160 }}>
          {formError}
        </div>
      {/if}

      {#if createdTempPassword}
        <div class="temp-password-box" in:fade={{ duration: 160 }}>
          <strong>Akun {createdUserName || "baru"} berhasil didaftarkan!</strong
          ><br />
          Password dibuat otomatis oleh sistem (juga bisa diklik di kolom Password
          pada tabel):
          <div
            class="modal-pass-copy-row"
            role="button"
            tabindex="0"
            onclick={() => copyPasswordValue(createdTempPassword)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                copyPasswordValue(createdTempPassword);
            }}
          >
            <code class="pass-code">{createdTempPassword}</code>
            <span class="copy-icon-btn" title="Salin password">
              {#if copiedTempPass}
                <span class="copied-text">Tersalin</span>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path
                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                  ></path>
                </svg>
              {/if}
            </span>
          </div>
          <div class="temp-pass-actions">
            <button
              type="button"
              class="btn-copy-pass"
              onclick={() => copyPasswordValue(createdTempPassword)}
            >
              {copiedTempPass ? "Tersalin!" : "Salin Password"}
            </button>
            <button
              type="button"
              class="btn-outline-light"
              onclick={closeOverlay}>Selesai</button
            >
          </div>
        </div>
      {:else}
        <form class="sheet-body" onsubmit={handleCreateSubmit}>
          <div class="field-group">
            <label class="field-lbl" for="reg-name">Nama lengkap</label>
            <input
              id="reg-name"
              type="text"
              class="field-inp"
              bind:value={newName}
              placeholder="Masukkan nama lengkap"
              disabled={isSubmitting}
              required
            />
          </div>

          <div class="field-group">
            <label class="field-lbl" for="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              class="field-inp"
              bind:value={newEmail}
              placeholder="nama@email.com"
              disabled={isSubmitting}
              required
            />
          </div>

          <div class="field-group">
            <label class="field-lbl" for="reg-phone">Nomor WA / telepon</label>
            <input
              id="reg-phone"
              type="text"
              class="field-inp"
              bind:value={newPhone}
              placeholder="Mis. 081234567890"
              disabled={isSubmitting}
              required
            />
          </div>

          <div class="field-group">
            <label class="field-lbl" for="reg-role">Peran</label>
            <select
              id="reg-role"
              class="field-inp"
              bind:value={newRole}
              disabled={isSubmitting}
            >
              <option value="tenant">Penyewa</option>
              <option value="guardian">Wali</option>
              <option value="manager">Pengelola</option>
              <option value="owner">Pemilik</option>
            </select>
            <span class="field-hint"
              >Pemilik dapat membuat akun semua peran.</span
            >
          </div>

          {#if newRole === "tenant"}
            <div class="field-group">
              <label class="field-lbl" for="reg-guardian"
                >Wali (opsional, khusus Penyewa)</label
              >
              <select
                id="reg-guardian"
                class="field-inp"
                bind:value={newGuardianId}
                disabled={isSubmitting}
              >
                <option value="">Pilih akun wali</option>
                {#each guardianOptions as gOpt}
                  <option value={gOpt.id}>{gOpt.name}</option>
                {/each}
              </select>
              <span class="field-hint"
                >Hanya akun berperan Wali yang bisa ditautkan.</span
              >
            </div>
          {/if}

          <div class="password-notice-box">
            Password dibuat otomatis oleh sistem saat akun dibuat. Salin dan
            berikan ke pengguna, lalu pengguna menggantinya sendiri di menu
            Profil.
          </div>

          <div class="sheet-btn-stack">
            <button
              type="submit"
              class="btn-solid-brown"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Mendaftarkan..." : "Daftarkan Akun"}
            </button>
            <button
              type="button"
              class="btn-outline-light"
              onclick={closeOverlay}
              disabled={isSubmitting}>Batal</button
            >
          </div>
        </form>
      {/if}
    </div>
  {/if}

  <!-- DRAWER / BOTTOM SHEET: UBAH AKUN -->
  {#if activeOverlay === "edit" && targetUser}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeOverlay}
      role="presentation"
    ></div>
    <div
      class="right-sheet sheet-capable"
      role="dialog"
      aria-modal="true"
      aria-label="Ubah Akun"
      transition:fly={{ x: 300, duration: 250, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>
      <div class="sheet-top-with-sub">
        <div>
          <h2 class="sheet-title">Ubah Akun</h2>
          <p class="sheet-sub">
            {editName || targetUser.name} · {getRoleShortLabel(editRole)}
          </p>
        </div>
        <button
          type="button"
          class="sheet-x"
          onclick={closeOverlay}
          aria-label="Tutup">&times;</button
        >
      </div>

      {#if formError}
        <div class="form-error-banner" in:fade={{ duration: 160 }}>
          {formError}
        </div>
      {/if}

      <form class="sheet-body" onsubmit={handleEditSubmit}>
        <div class="field-group">
          <label class="field-lbl" for="edit-name">Nama lengkap</label>
          <input
            id="edit-name"
            type="text"
            class="field-inp"
            bind:value={editName}
            disabled={isSubmitting}
            required
          />
        </div>

        <div class="field-group">
          <label class="field-lbl" for="edit-email">Email</label>
          <input
            id="edit-email"
            type="email"
            class="field-inp"
            bind:value={editEmail}
            disabled
          />
        </div>

        <div class="field-group">
          <label class="field-lbl" for="edit-phone">Nomor WA / telepon</label>
          <input
            id="edit-phone"
            type="text"
            class="field-inp"
            bind:value={editPhone}
            disabled={isSubmitting}
            required
          />
        </div>

        <div class="field-group">
          <label class="field-lbl" for="edit-role-readonly">Peran</label>
          <input
            id="edit-role-readonly"
            type="text"
            class="field-inp"
            value={getRoleShortLabel(editRole)}
            disabled
          />
          <span class="field-hint"
            >Peran akun tidak dapat diubah melalui endpoint ubah akun setelah
            dibuat.</span
          >
        </div>

        {#if editRole === "tenant"}
          <div class="field-group">
            <label class="field-lbl" for="edit-guardian"
              >Wali (opsional, khusus Penyewa)</label
            >
            <select
              id="edit-guardian"
              class="field-inp"
              bind:value={editGuardianId}
              disabled={isSubmitting}
            >
              <option value="">Pilih akun wali</option>
              {#each guardianOptions as gOpt}
                <option value={gOpt.id}>{gOpt.name}</option>
              {/each}
            </select>
            <span class="field-hint"
              >Hanya akun berperan Wali yang bisa ditautkan.</span
            >
          </div>
        {/if}

        <div class="sheet-btn-stack">
          <button type="submit" class="btn-solid-brown" disabled={isSubmitting}>
            {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
          <button
            type="button"
            class="btn-outline-light"
            onclick={closeOverlay}
            disabled={isSubmitting}>Batal</button
          >
        </div>
      </form>
    </div>
  {/if}

  <!-- MODAL / BOTTOM SHEET: RESET PASSWORD AKUN -->
  {#if activeOverlay === "reset-password" && targetUser}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeOverlay}
      role="presentation"
    ></div>
    <div
      class="confirm-modal sheet-confirm-capable"
      role="dialog"
      aria-modal="true"
      aria-label="Reset Password Akun"
      transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>

      {#if formError}
        <div
          class="form-error-banner"
          style="margin-bottom: 12px;"
          in:fade={{ duration: 160 }}
        >
          {formError}
        </div>
      {/if}

      {#if resetTempPassword}
        <h2 class="confirm-heading">Password Sementara Baru</h2>
        <div
          class="temp-password-box"
          style="margin-bottom: 14px;"
          in:fade={{ duration: 160 }}
        >
          <p style="margin: 0 0 8px;">{resetInfoMessage}</p>
          <div
            class="modal-pass-copy-row"
            role="button"
            tabindex="0"
            onclick={() => copyPasswordValue(resetTempPassword)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                copyPasswordValue(resetTempPassword);
            }}
          >
            <code class="pass-code">{resetTempPassword}</code>
            <span class="copy-icon-btn" title="Salin password">
              {#if copiedTempPass}
                <span class="copied-text">Tersalin</span>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path
                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                  ></path>
                </svg>
              {/if}
            </span>
          </div>
          <div class="temp-pass-actions">
            <button
              type="button"
              class="btn-copy-pass"
              onclick={() => copyPasswordValue(resetTempPassword)}
            >
              {copiedTempPass ? "Tersalin!" : "Salin Password"}
            </button>
          </div>
        </div>
        <div class="confirm-actions">
          <button type="button" class="btn-solid-brown" onclick={closeOverlay}
            >Selesai</button
          >
        </div>
      {:else}
        <h2 class="confirm-heading">Reset Password Akun?</h2>
        <p class="confirm-text">
          Sistem akan membuatkan password sementara baru untuk akun <strong
            >{targetUser.name}</strong
          >
          ({targetUser.email}). Berikan password tersebut ke pengguna agar bisa
          diganti di profil mereka.
        </p>

        <div class="confirm-actions">
          <button
            type="button"
            class="btn-solid-brown"
            onclick={handleConfirmResetPassword}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : "Ya, reset password"}
          </button>
          <button
            type="button"
            class="btn-outline-light"
            onclick={closeOverlay}
            disabled={isSubmitting}>Batal</button
          >
        </div>
      {/if}
    </div>
  {/if}

  <!-- MODAL / BOTTOM SHEET KONFIRMASI: NONAKTIFKAN AKUN? -->
  {#if activeOverlay === "deactivate" && targetUser}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeOverlay}
      role="presentation"
    ></div>
    <div
      class="confirm-modal sheet-confirm-capable"
      role="dialog"
      aria-modal="true"
      aria-label="Nonaktifkan Akun"
      transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>

      {#if formError}
        <div
          class="form-error-banner"
          style="margin-bottom: 12px;"
          in:fade={{ duration: 160 }}
        >
          {formError}
        </div>
      {/if}

      <h2 class="confirm-heading">Nonaktifkan Akun?</h2>
      <p class="confirm-text">
        Akun {targetUser.name} tidak akan bisa masuk ke sistem sampai diaktifkan
        kembali.
      </p>

      <div class="confirm-actions">
        <button
          type="button"
          class="btn-solid-red"
          onclick={handleConfirmDeactivate}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Memproses..." : "Ya, lanjutkan"}
        </button>
        <button
          type="button"
          class="btn-outline-light"
          onclick={closeOverlay}
          disabled={isSubmitting}>Batal</button
        >
      </div>
    </div>
  {/if}

  <!-- MODAL / BOTTOM SHEET KONFIRMASI: AKTIFKAN KEMBALI AKUN? -->
  {#if activeOverlay === "activate" && targetUser}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeOverlay}
      role="presentation"
    ></div>
    <div
      class="confirm-modal sheet-confirm-capable"
      role="dialog"
      aria-modal="true"
      aria-label="Aktifkan Kembali Akun"
      transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>

      {#if formError}
        <div
          class="form-error-banner"
          style="margin-bottom: 12px;"
          in:fade={{ duration: 160 }}
        >
          {formError}
        </div>
      {/if}

      <h2 class="confirm-heading">Aktifkan Kembali Akun?</h2>
      <p class="confirm-text">
        Akun {targetUser.name} akan dapat masuk kembali ke aplikasi Hunify.
      </p>

      <div class="confirm-actions">
        <button
          type="button"
          class="btn-solid-brown"
          onclick={handleConfirmActivate}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Memproses..." : "Ya, simpan"}
        </button>
        <button
          type="button"
          class="btn-outline-light"
          onclick={closeOverlay}
          disabled={isSubmitting}>Batal</button
        >
      </div>
    </div>
  {/if}
</DashboardLayout>

<style>
  .mobile-only {
    display: none;
  }

  .cell-password {
    white-space: nowrap;
  }

  .password-copy-cell {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 6px;
    background-color: #f4fbf7;
    border: 1px solid #b7ebd0;
    cursor: pointer;
    user-select: none;
  }

  .password-copy-cell:hover {
    background-color: #e6f7ee;
  }

  .modal-pass-copy-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    background-color: #d1fae5;
    cursor: pointer;
  }

  .table-pass-code {
    font-size: 12px;
    font-weight: 700;
    color: #065f46;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
  }

  .copy-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: none;
    background: transparent;
    color: #065f46;
    cursor: pointer;
  }

  .copied-text {
    font-size: 10px;
    font-weight: 700;
    color: #047857;
  }

  .temp-password-box {
    padding: 12px;
    border-radius: 8px;
    background-color: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #065f46;
    font-size: 12px;
    line-height: 1.5;
  }

  .pass-code {
    font-size: 13px;
    font-weight: 700;
    color: #064e3b;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
  }

  .temp-pass-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }

  .btn-copy-pass {
    width: 100%;
    height: 36px;
    border: 1px solid #34d399;
    border-radius: 8px;
    background-color: #ffffff;
    color: #065f46;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-copy-pass:hover {
    background-color: #f0fdf4;
  }

  .state-card {
    padding: 32px 18px;
    text-align: center;
    color: #9e8b7c;
    font-size: 13px;
    background-color: #ffffff;
    border: 1px solid #ece3d9;
    border-radius: 12px;
  }

  .state-card.error {
    color: #c62828;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .btn-retry {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #d9827b;
    border-radius: 6px;
    background-color: #ffffff;
    color: #c62828;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .form-error-banner {
    padding: 10px 12px;
    margin-bottom: 14px;
    border-radius: 8px;
    background-color: #fde8e8;
    border: 1px solid #f8b4b4;
    color: #9b1c1c;
    font-size: 12px;
    line-height: 1.4;
  }

  .users-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .users-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .users-title {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
    color: #261a14;
    letter-spacing: -0.01em;
  }

  .users-subtitle {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .btn-create-user {
    height: 36px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-create-user:hover {
    background-color: #553c2a;
  }

  .desktop-filter-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }

  .role-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .role-tab {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #e6ddd2;
    border-radius: 999px;
    background-color: #ffffff;
    color: #5c4d42;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .role-tab:hover {
    background-color: #f6f1eb;
  }

  .role-tab.active {
    border-color: #5c432d;
    background-color: #5c432d;
    color: #ffffff;
    font-weight: 600;
  }

  .desktop-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    width: 240px;
  }

  .desktop-search-icon {
    position: absolute;
    left: 11px;
    color: #9e8b7c;
    pointer-events: none;
  }

  .desktop-search-input {
    width: 100%;
    height: 34px;
    padding: 0 12px 0 32px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    box-sizing: border-box;
  }

  .desktop-search-input::placeholder {
    color: #b09d8e;
  }

  .desktop-users-card {
    padding: 22px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .desktop-card-header {
    margin-bottom: 16px;
  }

  .desktop-card-title {
    margin: 0 0 3px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .desktop-card-subtitle {
    margin: 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .users-table th {
    padding: 10px 12px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
    white-space: nowrap;
  }

  .users-table td {
    padding: 12px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
    vertical-align: middle;
  }

  .cell-name {
    font-weight: 700;
    color: #261a14;
    white-space: nowrap;
  }

  .cell-role {
    color: #261a14;
    white-space: nowrap;
  }

  .cell-muted {
    color: #8f7c6e;
    white-space: nowrap;
  }

  .badge-status {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .badge-status.active {
    background-color: #dcfce7;
    color: #15803d;
  }

  .badge-status.inactive {
    background-color: #f3efe9;
    color: #7c6858;
  }

  .col-action {
    text-align: right;
    white-space: nowrap;
  }

  .action-btns {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .btn-edit-box {
    height: 28px;
    padding: 0 11px;
    border: 1px solid #e2d8cd;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-edit-box:hover {
    background-color: #faf7f2;
  }

  .btn-reset-box {
    height: 28px;
    padding: 0 11px;
    border: 1px solid #d8c6b4;
    border-radius: 6px;
    background-color: #fbf7f2;
    color: #5c432d;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-reset-box:hover {
    background-color: #f2e8dc;
  }

  .btn-deactivate-red {
    height: 28px;
    padding: 0 11px;
    border: none;
    border-radius: 6px;
    background-color: #e02424;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-deactivate-red:hover {
    background-color: #c81e1e;
  }

  .btn-activate-brown {
    height: 28px;
    padding: 0 11px;
    border: none;
    border-radius: 6px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-activate-brown:hover {
    background-color: #553c2a;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 14px;
    margin-top: 10px;
    border-top: 1px solid #f4ede5;
  }

  .pagination-summary,
  .pagination-page-info {
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .page-btn {
    height: 30px;
    padding: 0 12px;
    border: 1px solid #e2d8cd;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Overlay, Drawer & Modal */
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background-color: rgba(24, 18, 14, 0.45);
  }

  .right-sheet {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 70;
    width: 100%;
    max-width: 420px;
    padding: 24px;
    background-color: #ffffff;
    box-shadow: -8px 0 28px rgba(24, 18, 14, 0.14);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .confirm-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 80;
    width: 92%;
    max-width: 420px;
    padding: 22px 24px;
    border-radius: 12px;
    background-color: #ffffff;
    box-shadow: 0 14px 36px rgba(24, 18, 14, 0.22);
    box-sizing: border-box;
  }

  .confirm-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .confirm-actions .btn-solid-red,
  .confirm-actions .btn-solid-brown,
  .confirm-actions .btn-outline-light {
    width: auto;
    height: 36px;
    padding: 0 16px;
  }

  .sheet-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .sheet-top-with-sub {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .sheet-title {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #261a14;
  }

  .sheet-sub {
    margin: 2px 0 0;
    font-size: 11px;
    color: #a88f7a;
  }

  .sheet-x {
    border: none;
    background: transparent;
    font-size: 22px;
    color: #8c7b6e;
    cursor: pointer;
    line-height: 1;
  }

  .sheet-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-lbl {
    font-size: 12px;
    font-weight: 600;
    color: #261a14;
  }

  .field-inp {
    width: 100%;
    height: 36px;
    padding: 0 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-family: inherit;
    font-size: 12px;
    box-sizing: border-box;
  }

  .field-inp:disabled {
    background-color: #f9f6f2;
    color: #8f7c6e;
  }

  .field-inp::placeholder {
    color: #b09d8e;
  }

  .field-hint {
    font-size: 10px;
    color: #a88f7a;
    line-height: 1.35;
  }

  .password-notice-box {
    padding: 10px 12px;
    border-radius: 8px;
    background-color: #f6f0e9;
    color: #8c7765;
    font-size: 10px;
    line-height: 1.45;
  }

  .confirm-heading {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .confirm-text {
    margin: 0 0 18px;
    font-size: 12px;
    line-height: 1.5;
    color: #8c7b6e;
  }

  .sheet-btn-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }

  .btn-solid-brown {
    width: 100%;
    height: 38px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-solid-brown:hover:not(:disabled) {
    background-color: #553c2a;
  }

  .btn-solid-brown:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-solid-red {
    width: 100%;
    height: 38px;
    border: none;
    border-radius: 8px;
    background-color: #e02424;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-solid-red:hover:not(:disabled) {
    background-color: #c81e1e;
  }

  .btn-solid-red:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-outline-light {
    width: 100%;
    height: 38px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-outline-light:hover:not(:disabled) {
    background-color: #faf7f2;
  }

  .btn-outline-light:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* --- MOBILE RESPONSIVE OVERRIDES --- */
  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: block;
    }

    .users-page {
      gap: 12px;
    }

    .users-top-bar {
      margin-bottom: 18px;
    }

    .users-title {
      font-size: 22px;
      margin-bottom: 4px;
    }

    .users-subtitle {
      font-size: 11px;
    }

    .mobile-controls-stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .btn-mobile-create-full {
      width: 100%;
      height: 40px;
      border: none;
      border-radius: 8px;
      background-color: #684b36;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    /* Formasi 2 di atas, 3 di bawah seperti filter Kontrak Sewa */
    .role-pills-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .role-pill {
      height: 36px;
      padding: 0 10px;
      border: 1px solid #e4dad0;
      border-radius: 999px;
      background-color: #ffffff;
      color: #5c4d42;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      box-sizing: border-box;
    }

    .role-pill:nth-child(-n + 2) {
      flex: 0 0 calc(50% - 4px);
    }

    .role-pill:nth-child(n + 3) {
      flex: 0 0 calc(33.3333% - 5.34px);
    }

    .role-pill.active {
      border-color: #553b27;
      background-color: #553b27;
      color: #ffffff;
      font-weight: 600;
    }

    .mobile-search-box {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }

    .mobile-search-icon {
      position: absolute;
      left: 12px;
      color: #9e8b7c;
      pointer-events: none;
      flex-shrink: 0;
    }

    .mobile-search-input {
      width: 100%;
      height: 38px;
      padding: 0 12px 0 34px;
      border: 1px solid #e4dad0;
      border-radius: 8px;
      background-color: #ffffff;
      color: #261a14;
      font-size: 12px;
      box-sizing: border-box;
    }

    .mobile-search-input::placeholder {
      color: #b09d8e;
    }

    .user-card-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .user-card {
      padding: 13px 14px;
      border: 1px solid #ece3d9;
      border-radius: 10px;
      background-color: #ffffff;
    }

    .user-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .user-name {
      margin: 0 0 2px;
      font-size: 13px;
      font-weight: 700;
      color: #261a14;
    }

    .user-email {
      margin: 0;
      font-size: 11px;
      color: #9e8b7c;
    }

    .user-card-bottom {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .mobile-pass-row {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed #e6ddd2;
      cursor: pointer;
    }

    .pass-chip-wrap {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 6px;
      background-color: #f4fbf7;
      border: 1px solid #b7ebd0;
    }

    .meta-lbl {
      display: block;
      font-size: 10px;
      color: #a88f7a;
      margin-bottom: 2px;
    }

    .meta-val {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #261a14;
    }

    .user-card-footer-action {
      margin-top: 10px;
      padding-top: 9px;
      border-top: 1px solid #f4ede5;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }

    .btn-link-reset {
      padding: 0;
      border: none;
      background: transparent;
      color: #5c432d;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-link-deactivate {
      padding: 0;
      border: none;
      background: transparent;
      color: #e02424;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-link-activate {
      padding: 0;
      border: none;
      background: transparent;
      color: #684b36;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .mobile-pagination-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding-top: 8px;
    }

    .right-sheet.sheet-capable {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 100%;
      max-height: 92vh;
      border-radius: 18px 18px 0 0;
      padding: 14px 18px 22px;
      box-shadow: 0 -8px 28px rgba(24, 18, 14, 0.16);
    }

    .sheet-handle {
      width: 36px;
      height: 4px;
      border-radius: 999px;
      background-color: #dfd5ca;
      margin: 0 auto 14px;
    }

    .confirm-modal.sheet-confirm-capable {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      transform: none;
      width: 100%;
      max-width: 100%;
      border-radius: 18px 18px 0 0;
      padding: 14px 18px 22px;
    }

    .confirm-actions {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .confirm-actions .btn-solid-red,
    .confirm-actions .btn-solid-brown,
    .confirm-actions .btn-outline-light {
      width: 100%;
      height: 38px;
    }
  }
</style>
