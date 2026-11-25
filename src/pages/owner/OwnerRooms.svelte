<script>
  import { onMount } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  let selectedStatus = $state("all"); // 'all' | 'vacant' | 'occupied' | 'maintenance'
  let currentPage = $state(1);
  const perPage = 10;

  // --- STATE DATA API ---
  let loading = $state(true);
  let errorMsg = $state("");
  /** @type {any[]} */
  let rooms = $state([]);
  let totalCount = $state(0);
  let totalPages = $state(1);
  let allRoomsCount = $state(0);
  let tabCounts = $state({
    all: 0,
    vacant: 0,
    occupied: 0,
    maintenance: 0,
  });

  // --- STATE DRAWER / BOTTOM SHEET & MODAL ---
  /** @type {'add' | 'edit' | 'confirm_maintenance' | 'confirm_vacant' | null} */
  let activeDrawerOrModal = $state(null);
  /** @type {any} */
  let targetRoom = $state(null);

  // Form state & state submitting
  let isSubmitting = $state(false);
  let formError = $state("");
  let roomNumberInput = $state("");
  let roomTypeInput = $state("");
  let roomPriceInput = $state("");
  let roomFacilitiesInput = $state("");

  const baseRoomTypes = [
    "Standard",
    "Deluxe",
    "Standar AC",
    "Kamar Mandi Dalam",
  ];

  let availableRoomTypes = $derived.by(() => {
    const set = new Set(baseRoomTypes);
    for (const room of rooms) {
      if (room.type && room.type.trim()) {
        set.add(room.type.trim());
      }
    }
    if (roomTypeInput && roomTypeInput.trim()) {
      set.add(roomTypeInput.trim());
    }
    return Array.from(set);
  });

  let displayOwnerName = $derived($currentUser?.name || "Bu Ratna");
  let displayOwnerRole = $derived.by(() => {
    const role = ($currentUser?.role || "owner").toLowerCase();
    if (role === "owner") return "Pemilik";
    return $currentUser?.role || "Pemilik";
  });

  /**
   * @param {any} amount
   * @returns {string}
   */
  function formatRupiah(amount) {
    if (
      amount === null ||
      amount === undefined ||
      amount === "" ||
      isNaN(amount)
    ) {
      return "Belum diisi";
    }
    const num = Number(amount);
    if (num <= 0) return "Belum diisi";
    return `Rp ${num.toLocaleString("id-ID")}`;
  }

  /**
   * @param {any} value
   * @returns {number | null}
   */
  function parseRupiahInput(value) {
    if (!value && value !== 0) return null;
    const cleanStr = String(value).replace(/[^0-9]/g, "");
    if (!cleanStr) return null;
    const parsed = parseInt(cleanStr, 10);
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  /**
   * @param {any} rawStatus
   * @returns {'occupied' | 'maintenance' | 'vacant'}
   */
  function normalizeStatus(rawStatus) {
    const val = String(rawStatus || "").toLowerCase();
    if (val === "occupied" || val === "terisi" || val === "rented")
      return "occupied";
    if (val === "maintenance" || val === "perbaikan" || val === "repair")
      return "maintenance";
    if (val === "available" || val === "vacant" || val === "kosong")
      return "vacant";
    return "vacant";
  }

  /**
   * @param {string} normalizedStatus
   * @returns {string}
   */
  function mapStatusLabel(normalizedStatus) {
    if (normalizedStatus === "occupied") return "Terisi";
    if (normalizedStatus === "maintenance") return "Maintenance";
    return "Kosong";
  }

  /**
   * @param {any} raw
   * @returns {any}
   */
  function normalizeRoomItem(raw) {
    const status = normalizeStatus(raw.status);
    const roomNum = raw.room_number || raw.number || raw.code || "-";
    const roomType = raw.room_type || raw.type || "Standard";
    const priceNum =
      raw.price !== undefined && raw.price !== null ? Number(raw.price) : null;
    const priceLabel = raw.price_rupiah || formatRupiah(priceNum);
    const occupantName = raw.occupant_name || raw.tenant_name || "-";

    let subText = "Belum ada penghuni";
    if (occupantName !== "-") {
      subText =
        status === "occupied"
          ? `Penghuni: ${occupantName}`
          : `Calon / penghuni terkait: ${occupantName}`;
    } else if (status === "maintenance") {
      subText = "Dalam perawatan / maintenance";
    }

    return {
      id: raw.id,
      number: roomNum,
      mobileTitle: `Kamar ${roomNum} · ${roomType}`,
      mobileSub: subText,
      type: roomType,
      priceLabel: priceLabel,
      priceNumber: priceNum,
      status: status,
      statusLabel: mapStatusLabel(status),
      tenant: occupantName,
      facilities: raw.facilities || "-",
    };
  }

  /**
   * @param {any} response
   * @param {any[]} items
   * @param {number} apiTotal
   */
  function applyCountsFromResponse(response, items, apiTotal) {
    const countsObj =
      response?.counts || response?.meta?.counts || response?.summary;
    if (countsObj && typeof countsObj === "object") {
      const vacantVal = Number(
        countsObj.available ?? countsObj.vacant ?? countsObj.kosong ?? 0,
      );
      const occupiedVal = Number(countsObj.occupied ?? countsObj.terisi ?? 0);
      const mainVal = Number(countsObj.maintenance ?? countsObj.perbaikan ?? 0);
      const allVal = Number(
        countsObj.all ?? countsObj.total ?? vacantVal + occupiedVal + mainVal,
      );

      if (Number.isFinite(allVal)) {
        allRoomsCount = allVal;
      }

      tabCounts = {
        all: Number.isFinite(allVal) ? allVal : allRoomsCount,
        vacant: Number.isFinite(vacantVal) ? vacantVal : tabCounts.vacant,
        occupied: Number.isFinite(occupiedVal)
          ? occupiedVal
          : tabCounts.occupied,
        maintenance: Number.isFinite(mainVal) ? mainVal : tabCounts.maintenance,
      };
      return;
    }

    if (selectedStatus === "all") {
      allRoomsCount = apiTotal;
      tabCounts = {
        all: apiTotal,
        vacant: items.filter((r) => r.status === "vacant").length,
        occupied: items.filter((r) => r.status === "occupied").length,
        maintenance: items.filter((r) => r.status === "maintenance").length,
      };
    } else {
      tabCounts = {
        ...tabCounts,
        all: allRoomsCount,
      };
    }
  }

  async function fetchRooms() {
    loading = true;
    errorMsg = "";

    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(perPage));

      if (selectedStatus !== "all") {
        const apiStatus =
          selectedStatus === "vacant" ? "available" : selectedStatus;
        params.set("status", apiStatus);
      }

      /** @type {any} */
      const response = await apiRequest(`/api/rooms?${params.toString()}`);
      const rawItems = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.rooms)
          ? response.rooms
          : Array.isArray(response)
            ? response
            : [];

      const normalized = rawItems.map(normalizeRoomItem);
      rooms = normalized;

      const pagination = response?.pagination || response?.meta || {};
      const apiTotal = Number(
        pagination.total ?? response?.total ?? normalized.length,
      );
      totalCount = Number.isFinite(apiTotal) ? apiTotal : normalized.length;
      totalPages = Math.max(
        1,
        Number(
          pagination.total_pages ??
            pagination.last_page ??
            Math.ceil(totalCount / perPage) ??
            1,
        ),
      );

      applyCountsFromResponse(response, normalized, totalCount);
    } catch (/** @type {any} */ err) {
      errorMsg = err?.message || "Gagal memuat daftar kamar.";
      rooms = [];
      totalCount = 0;
      totalPages = 1;
    } finally {
      loading = false;
    }
  }

  /**
   * @param {string} statusKey
   */
  function selectStatusTab(statusKey) {
    selectedStatus = statusKey;
    currentPage = 1;
    fetchRooms();
  }

  function openAddDrawer() {
    formError = "";
    targetRoom = null;
    roomNumberInput = "";
    roomTypeInput = "Standard";
    roomPriceInput = "";
    roomFacilitiesInput = "";
    activeDrawerOrModal = "add";
  }

  /**
   * @param {any} room
   */
  function openEditDrawer(room) {
    formError = "";
    targetRoom = room;
    roomNumberInput = room.number;
    roomTypeInput = room.type || "Standard";
    roomPriceInput =
      room.priceNumber !== null &&
      room.priceNumber !== undefined &&
      Number(room.priceNumber) > 0
        ? String(room.priceNumber)
        : "";
    roomFacilitiesInput = room.facilities !== "-" ? room.facilities : "";
    activeDrawerOrModal = "edit";
  }

  /**
   * @param {any} room
   */
  function openMaintenanceConfirm(room) {
    formError = "";
    targetRoom = room;
    activeDrawerOrModal = "confirm_maintenance";
  }

  /**
   * @param {any} room
   */
  function openVacantConfirm(room) {
    formError = "";
    targetRoom = room;
    activeDrawerOrModal = "confirm_vacant";
  }

  function closeAllOverlays() {
    if (isSubmitting) return;
    activeDrawerOrModal = null;
    targetRoom = null;
    formError = "";
  }

  /**
   * @param {SubmitEvent} event
   */
  async function handleAddRoomSubmit(event) {
    event.preventDefault();
    formError = "";

    const cleanNumber = roomNumberInput.trim();
    const cleanType = roomTypeInput.trim();

    if (!cleanNumber || !cleanType) {
      formError = "Nomor kamar dan tipe kamar wajib diisi.";
      return;
    }

    const priceParsed = parseRupiahInput(roomPriceInput);

    /** @type {any} */
    const payload = {
      room_number: cleanNumber,
      room_type: cleanType,
      facilities: roomFacilitiesInput.trim() || null,
    };

    if (priceParsed !== null) {
      payload.price = priceParsed;
    }

    isSubmitting = true;
    try {
      await apiRequest("/api/rooms", {
        method: "POST",
        body: payload,
      });

      closeAllOverlays();
      await fetchRooms();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal menambahkan kamar baru.";
    } finally {
      isSubmitting = false;
    }
  }

  /**
   * @param {SubmitEvent} event
   */
  async function handleEditRoomSubmit(event) {
    event.preventDefault();
    if (!targetRoom) return;
    formError = "";

    const cleanNumber = roomNumberInput.trim();
    const cleanType = roomTypeInput.trim();

    if (!cleanNumber || !cleanType) {
      formError = "Nomor kamar dan tipe kamar wajib diisi.";
      return;
    }

    const priceParsed = parseRupiahInput(roomPriceInput);

    /** @type {any} */
    const payload = {
      room_number: cleanNumber,
      room_type: cleanType,
      facilities: roomFacilitiesInput.trim() || null,
    };

    if (priceParsed !== null) {
      payload.price = priceParsed;
    }

    isSubmitting = true;
    try {
      await apiRequest(`/api/rooms/${targetRoom.id}`, {
        method: "PATCH",
        body: payload,
      });

      closeAllOverlays();
      await fetchRooms();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal memperbarui data kamar.";
    } finally {
      isSubmitting = false;
    }
  }

  async function handleConfirmMaintenance() {
    if (!targetRoom) return;
    formError = "";
    isSubmitting = true;

    try {
      await apiRequest(`/api/rooms/${targetRoom.id}`, {
        method: "PATCH",
        body: { status: "maintenance" },
      });

      isSubmitting = false;
      closeAllOverlays();
      await fetchRooms();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal mengubah status kamar ke maintenance.";
      isSubmitting = false;
    }
  }

  async function handleSetVacantFromMaintenance() {
    if (!targetRoom) return;
    formError = "";
    isSubmitting = true;

    try {
      await apiRequest(`/api/rooms/${targetRoom.id}`, {
        method: "PATCH",
        body: { status: "available" },
      });

      isSubmitting = false;
      closeAllOverlays();
      await fetchRooms();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal mengembalikan status kamar ke Kosong.";
      isSubmitting = false;
    }
  }

  function handlePrevPage() {
    if (currentPage > 1) {
      currentPage -= 1;
      fetchRooms();
    }
  }

  function handleNextPage() {
    if (currentPage < totalPages) {
      currentPage += 1;
      fetchRooms();
    }
  }

  onMount(() => {
    fetchRooms();
  });
</script>

<DashboardLayout
  activeKey="rooms"
  ownerName={displayOwnerName}
  ownerRole={displayOwnerRole}
>
  <div in:fly={{ y: 16, duration: 250, easing: cubicOut }}>
    <!-- HEADER HALAMAN -->
    <div class="rooms-top-bar">
      <div>
        <h1 class="page-title">Kamar &amp; Penghuni</h1>
        <p class="page-subtitle">Data kamar, status, dan penghuni saat ini</p>
      </div>

      <button
        type="button"
        class="btn-add-room desktop-only"
        onclick={openAddDrawer}
      >
        Tambah Kamar
      </button>
    </div>

    <!-- TOMBOL TAMBAH KAMAR PENUH LEBAR (MOBILE) -->
    <div class="mobile-only mobile-add-wrap">
      <button type="button" class="btn-mobile-add-full" onclick={openAddDrawer}>
        Tambah Kamar
      </button>
    </div>

    <!-- FILTER STATUS KAMAR -->
    <div class="status-tabs" role="tablist" aria-label="Filter status kamar">
      <button
        type="button"
        role="tab"
        aria-selected={selectedStatus === "all"}
        class="status-tab {selectedStatus === 'all' ? 'active' : ''}"
        onclick={() => selectStatusTab("all")}
      >
        Semua ({tabCounts.all})
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={selectedStatus === "vacant"}
        class="status-tab {selectedStatus === 'vacant' ? 'active' : ''}"
        onclick={() => selectStatusTab("vacant")}
      >
        Kosong ({tabCounts.vacant})
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={selectedStatus === "occupied"}
        class="status-tab {selectedStatus === 'occupied' ? 'active' : ''}"
        onclick={() => selectStatusTab("occupied")}
      >
        Terisi ({tabCounts.occupied})
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={selectedStatus === "maintenance"}
        class="status-tab {selectedStatus === 'maintenance' ? 'active' : ''}"
        onclick={() => selectStatusTab("maintenance")}
      >
        Maintenance ({tabCounts.maintenance})
      </button>
    </div>

    {#if loading}
      <div class="state-card" in:fade={{ duration: 160 }}>
        Memuat data kamar...
      </div>
    {:else if errorMsg}
      <div class="state-card error" in:fade={{ duration: 160 }}>
        <span>{errorMsg}</span>
        <button type="button" class="btn-retry" onclick={fetchRooms}
          >Coba Lagi</button
        >
      </div>
    {:else if rooms.length === 0}
      <div class="state-card" in:fade={{ duration: 160 }}>
        Belum ada data kamar yang ditemukan.
      </div>
    {:else}
      <!-- DAFTAR KARTU KAMAR (MOBILE) -->
      <div class="mobile-only mobile-rooms-list" in:fade={{ duration: 160 }}>
        {#each rooms as room (room.id)}
          <article class="mobile-room-card">
            <div class="mobile-room-top">
              <div>
                <h2 class="mobile-room-title">
                  {room.mobileTitle || `Kamar ${room.number} · ${room.type}`}
                </h2>
                <p class="mobile-room-sub">
                  {room.mobileSub ||
                    (room.tenant !== "-"
                      ? `Penghuni: ${room.tenant}`
                      : "Belum ada penghuni")}
                </p>
              </div>
              <span class="room-status-pill {room.status}"
                >{room.statusLabel}</span
              >
            </div>

            <div class="mobile-room-meta-grid">
              <div>
                <span class="mobile-room-meta-label">Tarif / bulan</span>
                <span class="mobile-room-meta-value">{room.priceLabel}</span>
              </div>
              <div>
                <span class="mobile-room-meta-label">Fasilitas</span>
                <span class="mobile-room-meta-value">{room.facilities}</span>
              </div>
            </div>

            <div class="mobile-room-footer">
              <button
                type="button"
                class="btn-edit-room btn-mobile-edit"
                onclick={() => openEditDrawer(room)}
              >
                Ubah Kamar
              </button>
            </div>
          </article>
        {/each}
      </div>

      <!-- KARTU DAFTAR KAMAR (DESKTOP) -->
      <section
        class="rooms-card desktop-only"
        aria-label="Daftar kamar"
        in:fade={{ duration: 160 }}
      >
        <div class="rooms-card-header">
          <h2 class="rooms-card-title">Daftar Kamar</h2>
          <p class="rooms-card-subtitle">
            10 kamar per halaman, urut nomor kamar
          </p>
        </div>

        <div class="table-wrap">
          <table class="rooms-table">
            <thead>
              <tr>
                <th>Nomor Kamar</th>
                <th>Tipe</th>
                <th>Tarif / Bulan</th>
                <th>Status</th>
                <th>Penghuni</th>
                <th class="col-action">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {#each rooms as room (room.id)}
                <tr>
                  <td class="cell-number">{room.number}</td>
                  <td class="cell-type">{room.type}</td>
                  <td
                    class="cell-price {room.priceLabel === 'Belum diisi'
                      ? 'is-empty'
                      : ''}"
                  >
                    {room.priceLabel}
                  </td>
                  <td>
                    <span class="room-status-pill {room.status}"
                      >{room.statusLabel}</span
                    >
                  </td>
                  <td
                    class="cell-tenant {room.tenant === '-' ? 'is-dash' : ''}"
                  >
                    {room.tenant}
                  </td>
                  <td class="col-action">
                    <button
                      type="button"
                      class="btn-edit-room"
                      onclick={() => openEditDrawer(room)}
                    >
                      Ubah
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <p class="card-footnote">
          Status Terisi/Kosong mengikuti kontrak aktif. Maintenance hanya manual
          dan wajib konfirmasi. Harga hanya dapat diubah Pemilik.
        </p>

        <div class="pagination-bar">
          <span class="pagination-summary">
            Menampilkan {(currentPage - 1) * perPage + 1}–{Math.min(
              currentPage * perPage,
              totalCount,
            )} dari {totalCount} kamar
          </span>

          <div class="pagination-controls">
            <span class="pagination-page-info"
              >Halaman {currentPage} dari {totalPages}</span
            >
            <button
              type="button"
              class="page-btn"
              onclick={handlePrevPage}
              disabled={currentPage <= 1}
            >
              Sebelumnya
            </button>
            <button
              type="button"
              class="page-btn"
              onclick={handleNextPage}
              disabled={currentPage >= totalPages}
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>
    {/if}
  </div>

  <!-- DRAWER / BOTTOM SHEET TAMBAH KAMAR BARU -->
  {#if activeDrawerOrModal === "add"}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeAllOverlays}
      role="presentation"
    ></div>
    <aside
      class="room-drawer sheet-capable"
      aria-label="Tambah Kamar Baru"
      transition:fly={{ x: 300, duration: 250, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>
      <div class="drawer-header">
        <h2 class="drawer-title">Tambah Kamar Baru</h2>
        <button
          type="button"
          class="drawer-close-btn"
          onclick={closeAllOverlays}
          aria-label="Tutup panel tambah kamar"
        >
          &times;
        </button>
      </div>

      {#if formError}
        <div class="form-error-banner" in:fade={{ duration: 160 }}>
          {formError}
        </div>
      {/if}

      <form class="drawer-form" onsubmit={handleAddRoomSubmit}>
        <div class="form-field">
          <label class="field-label" for="add-room-number">Nomor Kamar</label>
          <input
            id="add-room-number"
            type="text"
            class="field-input"
            bind:value={roomNumberInput}
            placeholder="C01"
            disabled={isSubmitting}
            required
          />
          <span class="field-hint desktop-only"
            >Format bebas, mis. A05 atau B12. Harus unik.</span
          >
        </div>

        <div class="form-field">
          <label class="field-label" for="add-room-type">Tipe Kamar</label>
          <select
            id="add-room-type"
            class="field-input"
            bind:value={roomTypeInput}
            disabled={isSubmitting}
          >
            {#each availableRoomTypes as roomTypeOption}
              <option value={roomTypeOption}>{roomTypeOption}</option>
            {/each}
          </select>
        </div>

        <div class="form-field">
          <label class="field-label" for="add-room-price"
            >Tarif Sewa per Bulan (Rp)</label
          >
          <input
            id="add-room-price"
            type="text"
            class="field-input"
            bind:value={roomPriceInput}
            placeholder="1500000"
            disabled={isSubmitting}
          />
          <span class="field-hint desktop-only">
            Kosongkan bila harga belum ditetapkan. Kamar tanpa harga belum bisa
            dikontrakkan.
          </span>
        </div>

        <div class="form-field">
          <label class="field-label" for="add-room-facilities">Fasilitas</label>
          <textarea
            id="add-room-facilities"
            class="field-textarea"
            rows="4"
            bind:value={roomFacilitiesInput}
            placeholder="AC, Kasur Springbed, Meja Belajar"
            disabled={isSubmitting}></textarea>
          <span class="field-hint">Pisahkan dengan koma.</span>
        </div>

        <div class="drawer-info-banner desktop-only">
          Status Terisi/Kosong diatur otomatis dari kontrak aktif. Kamar baru
          selalu Kosong sampai ada kontrak lunas pertama.
        </div>

        <div class="drawer-actions">
          <button
            type="submit"
            class="btn-brown-primary"
            disabled={isSubmitting}
          >
            <span class="desktop-only"
              >{isSubmitting ? "Menyimpan..." : "Tambah Kamar"}</span
            >
            <span class="mobile-only"
              >{isSubmitting ? "Menyimpan..." : "Simpan Kamar"}</span
            >
          </button>
          <button
            type="button"
            class="btn-white-outline"
            onclick={closeAllOverlays}
            disabled={isSubmitting}>Batal</button
          >
        </div>
      </form>
    </aside>
  {/if}

  <!-- DRAWER / BOTTOM SHEET UBAH KAMAR -->
  {#if activeDrawerOrModal === "edit" && targetRoom}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeAllOverlays}
      role="presentation"
    ></div>
    <aside
      class="room-drawer sheet-capable"
      aria-label="Ubah Kamar"
      transition:fly={{ x: 300, duration: 250, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>
      <div class="drawer-header">
        <h2 class="drawer-title">
          <span class="desktop-only">Ubah Kamar {targetRoom.number}</span>
          <span class="mobile-only">Ubah Data Kamar {targetRoom.number}</span>
        </h2>
        <button
          type="button"
          class="drawer-close-btn"
          onclick={closeAllOverlays}
          aria-label="Tutup panel ubah kamar"
        >
          &times;
        </button>
      </div>

      {#if formError}
        <div class="form-error-banner" in:fade={{ duration: 160 }}>
          {formError}
        </div>
      {/if}

      <form class="drawer-form" onsubmit={handleEditRoomSubmit}>
        <div class="form-field">
          <label class="field-label" for="edit-room-number">Nomor Kamar</label>
          <input
            id="edit-room-number"
            type="text"
            class="field-input"
            bind:value={roomNumberInput}
            disabled={isSubmitting || targetRoom.status === "occupied"}
            required
          />
          {#if targetRoom.status === "occupied"}
            <span class="field-hint"
              >Nomor kamar tidak dapat diubah saat terisi.</span
            >
          {:else}
            <span class="field-hint desktop-only"
              >Format bebas, mis. A05 atau B12. Harus unik.</span
            >
          {/if}
        </div>

        <div class="form-field">
          <label class="field-label" for="edit-room-type">Tipe Kamar</label>
          <select
            id="edit-room-type"
            class="field-input"
            bind:value={roomTypeInput}
            disabled={isSubmitting}
          >
            {#each availableRoomTypes as roomTypeOption}
              <option value={roomTypeOption}>{roomTypeOption}</option>
            {/each}
          </select>
        </div>

        <div class="form-field">
          <label class="field-label" for="edit-room-price"
            >Tarif Sewa per Bulan (Rp)</label
          >
          <input
            id="edit-room-price"
            type="text"
            class="field-input"
            bind:value={roomPriceInput}
            disabled={isSubmitting}
          />
          <span class="field-hint desktop-only"
            >Perubahan harga berlaku untuk tagihan yang terbit berikutnya.</span
          >
        </div>

        <div class="form-field">
          <label class="field-label" for="edit-room-facilities">Fasilitas</label
          >
          <textarea
            id="edit-room-facilities"
            class="field-textarea"
            rows="4"
            bind:value={roomFacilitiesInput}
            disabled={isSubmitting}></textarea>
          <span class="field-hint">Pisahkan dengan koma.</span>
        </div>

        <div class="drawer-actions">
          <button
            type="submit"
            class="btn-brown-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
          {#if targetRoom.status === "maintenance"}
            <button
              type="button"
              class="btn-soft-beige"
              onclick={() => openVacantConfirm(targetRoom)}
              disabled={isSubmitting}
            >
              Kembalikan ke Kosong
            </button>
          {:else if targetRoom.status !== "occupied"}
            <button
              type="button"
              class="btn-soft-beige"
              onclick={() => openMaintenanceConfirm(targetRoom)}
              disabled={isSubmitting}
            >
              Set Status Maintenance
            </button>
          {/if}
          <button
            type="button"
            class="btn-white-outline"
            onclick={closeAllOverlays}
            disabled={isSubmitting}>Batal</button
          >
        </div>
      </form>
    </aside>
  {/if}

  <!-- MODAL / BOTTOM SHEET KONFIRMASI SET MAINTENANCE -->
  {#if activeDrawerOrModal === "confirm_maintenance" && targetRoom}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeAllOverlays}
      role="presentation"
    ></div>
    <div
      class="confirm-modal sheet-confirm-capable"
      role="dialog"
      aria-modal="true"
      aria-label="Konfirmasi set maintenance"
      transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>

      <div class="mobile-only mobile-confirm-header">
        <h3 class="mobile-confirm-top-title">Ubah Status ke Maintenance?</h3>
        <button
          type="button"
          class="drawer-close-btn"
          onclick={closeAllOverlays}>&times;</button
        >
      </div>

      {#if formError}
        <div
          class="form-error-banner"
          style="margin-bottom: 12px;"
          in:fade={{ duration: 160 }}
        >
          {formError}
        </div>
      {/if}

      <div class="mobile-confirm-inner-card">
        <h3 class="confirm-modal-title">
          Set Kamar {targetRoom.number} ke Maintenance?
        </h3>
        <p class="confirm-modal-desc">
          <span class="desktop-only">
            Kamar maintenance tidak dapat dikontrakkan sampai status
            dikembalikan ke Kosong. Kamar yang masih terisi tidak dapat diubah
            ke maintenance.
          </span>
          <span class="mobile-only">
            Perubahan akan langsung terlihat oleh pengguna lain.
          </span>
        </p>

        <div class="confirm-modal-actions">
          <button
            type="button"
            class="btn-modal-cancel desktop-only"
            onclick={closeAllOverlays}
            disabled={isSubmitting}>Batal</button
          >
          <button
            type="button"
            class="btn-modal-danger desktop-only"
            onclick={handleConfirmMaintenance}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : "Ya, lanjutkan"}
          </button>

          <button
            type="button"
            class="btn-brown-primary mobile-only"
            onclick={handleConfirmMaintenance}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : "Ya, simpan"}
          </button>
          <button
            type="button"
            class="btn-white-outline mobile-only"
            onclick={closeAllOverlays}
            disabled={isSubmitting}
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- MODAL / BOTTOM SHEET KONFIRMASI KEMBALIKAN KE KOSONG -->
  {#if activeDrawerOrModal === "confirm_vacant" && targetRoom}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeAllOverlays}
      role="presentation"
    ></div>
    <div
      class="confirm-modal sheet-confirm-capable"
      role="dialog"
      aria-modal="true"
      aria-label="Konfirmasi kembalikan ke kosong"
      transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>

      <div class="mobile-only mobile-confirm-header">
        <h3 class="mobile-confirm-top-title">Kembalikan Kamar ke Kosong?</h3>
        <button
          type="button"
          class="drawer-close-btn"
          onclick={closeAllOverlays}>&times;</button
        >
      </div>

      {#if formError}
        <div
          class="form-error-banner"
          style="margin-bottom: 12px;"
          in:fade={{ duration: 160 }}
        >
          {formError}
        </div>
      {/if}

      <div class="mobile-confirm-inner-card">
        <h3 class="confirm-modal-title">
          Kembalikan Kamar {targetRoom.number} ke Kosong?
        </h3>
        <p class="confirm-modal-desc">
          <span class="desktop-only">
            Kamar {targetRoom.number} akan berstatus Kosong dan dapat dikontrakkan
            kembali.
          </span>
          <span class="mobile-only">
            Kamar {targetRoom.number} akan kembali berstatus Kosong dan siap dikontrakkan.
          </span>
        </p>

        <div class="confirm-modal-actions confirm-modal-actions--save-first">
          <button
            type="button"
            class="btn-brown-primary btn-modal-save desktop-only"
            onclick={handleSetVacantFromMaintenance}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Menyimpan..." : "Ya, simpan"}
          </button>
          <button
            type="button"
            class="btn-modal-cancel desktop-only"
            onclick={closeAllOverlays}
            disabled={isSubmitting}
          >
            Batal
          </button>

          <button
            type="button"
            class="btn-brown-primary mobile-only"
            onclick={handleSetVacantFromMaintenance}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Menyimpan..." : "Ya, simpan"}
          </button>
          <button
            type="button"
            class="btn-white-outline mobile-only"
            onclick={closeAllOverlays}
            disabled={isSubmitting}
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  {/if}
</DashboardLayout>

<style>
  .mobile-only {
    display: none;
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

  .rooms-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .page-title {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
    color: #261a14;
    letter-spacing: -0.01em;
  }

  .page-subtitle {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .btn-add-room {
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

  .btn-add-room:hover {
    background-color: #553c2a;
  }

  .status-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  .status-tab {
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

  .status-tab:hover {
    background-color: #f6f1eb;
  }

  .status-tab.active {
    border-color: #5c432d;
    background-color: #5c432d;
    color: #ffffff;
    font-weight: 600;
  }

  .rooms-card {
    padding: 22px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .rooms-card-header {
    margin-bottom: 16px;
  }

  .rooms-card-title {
    margin: 0 0 3px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .rooms-card-subtitle {
    margin: 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .rooms-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .rooms-table th {
    padding: 10px 12px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
    white-space: nowrap;
  }

  .rooms-table td {
    padding: 13px 12px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
    vertical-align: middle;
  }

  .cell-number {
    font-weight: 700;
    color: #261a14;
    white-space: nowrap;
  }

  .cell-type {
    color: #261a14;
    white-space: nowrap;
  }

  .cell-price {
    color: #261a14;
    white-space: nowrap;
  }

  .cell-price.is-empty {
    color: #b09a86;
  }

  .cell-tenant {
    color: #261a14;
    white-space: nowrap;
  }

  .cell-tenant.is-dash {
    color: #9e8b7c;
  }

  .room-status-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .room-status-pill.occupied {
    background-color: #f3ece4;
    color: #6b4e38;
  }

  .room-status-pill.vacant {
    background-color: #dcfce7;
    color: #15803d;
  }

  .room-status-pill.maintenance {
    background-color: #fef3c7;
    color: #b45309;
  }

  .col-action {
    text-align: right;
    white-space: nowrap;
  }

  .btn-edit-room {
    height: 28px;
    padding: 0 12px;
    border: 1px solid #e2d8cd;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-edit-room:hover {
    background-color: #faf7f2;
  }

  .card-footnote {
    margin: 14px 0 16px;
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 4px;
  }

  .pagination-summary,
  .pagination-page-info {
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 8px;
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

  .page-btn:hover:not(:disabled) {
    background-color: #faf7f2;
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- OVERLAY, DRAWER & MODAL --- */
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background-color: rgba(24, 18, 14, 0.45);
  }

  .room-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    width: 100%;
    max-width: 440px;
    padding: 24px 26px;
    background-color: #ffffff;
    box-shadow: -8px 0 28px rgba(24, 18, 14, 0.14);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    font-family: inherit;
    box-sizing: border-box;
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .drawer-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #261a14;
  }

  .drawer-close-btn {
    border: none;
    background: transparent;
    font-size: 22px;
    color: #8c7b6e;
    cursor: pointer;
    line-height: 1;
  }

  .drawer-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 12px;
    font-weight: 600;
    color: #261a14;
  }

  .field-input,
  .field-textarea {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.45;
    box-sizing: border-box;
  }

  .field-textarea {
    min-height: 92px;
    resize: vertical;
  }

  .field-input:focus,
  .field-textarea:focus {
    outline: none;
    border-color: #684b36;
  }

  .field-hint {
    font-size: 11px;
    color: #a88f7a;
    line-height: 1.4;
  }

  .drawer-info-banner {
    padding: 12px 14px;
    border-radius: 8px;
    background-color: #f6f0e8;
    color: #684b36;
    font-size: 11px;
    line-height: 1.45;
  }

  .drawer-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }

  .btn-brown-primary {
    height: 38px;
    width: 100%;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-brown-primary:hover:not(:disabled) {
    background-color: #553c2a;
  }

  .btn-brown-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-soft-beige {
    height: 38px;
    width: 100%;
    border: 1px solid #efe6dc;
    border-radius: 8px;
    background-color: #f7f1ea;
    color: #261a14;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-soft-beige:hover:not(:disabled) {
    background-color: #efe7dd;
  }

  .btn-soft-beige:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-white-outline {
    height: 38px;
    width: 100%;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-white-outline:hover:not(:disabled) {
    background-color: #faf7f2;
  }

  .btn-white-outline:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .confirm-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 70;
    width: 90%;
    max-width: 440px;
    padding: 24px;
    border-radius: 12px;
    background-color: #ffffff;
    box-shadow: 0 12px 32px rgba(24, 18, 14, 0.2);
    box-sizing: border-box;
  }

  .confirm-modal-title {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .confirm-modal-desc {
    margin: 0 0 20px;
    font-size: 12px;
    line-height: 1.5;
    color: #8c7b6e;
  }

  .confirm-modal-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .confirm-modal-actions--save-first {
    justify-content: flex-start;
  }

  .btn-modal-save {
    width: auto;
    height: 36px;
    padding: 0 16px;
  }

  .btn-modal-cancel {
    height: 36px;
    padding: 0 16px;
    border: 1px solid #e2d8cd;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-modal-danger {
    height: 36px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background-color: #e02424;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-modal-danger:hover:not(:disabled) {
    background-color: #c81e1e;
  }

  .btn-modal-danger:disabled {
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

    .rooms-top-bar {
      margin-bottom: 18px;
    }

    .page-title {
      font-size: 22px;
      margin-bottom: 4px;
    }

    .mobile-add-wrap {
      margin-bottom: 12px;
    }

    .btn-mobile-add-full {
      width: 100%;
      height: 38px;
      border: none;
      border-radius: 8px;
      background-color: #684b36;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .status-tabs {
      gap: 6px;
      margin-bottom: 14px;
    }

    .status-tab {
      height: 30px;
      padding: 0 11px;
      font-size: 11px;
    }

    .mobile-rooms-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-room-card {
      padding: 14px 16px;
      border: 1px solid #ece3d9;
      border-radius: 10px;
      background-color: #ffffff;
    }

    .mobile-room-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .mobile-room-title {
      margin: 0 0 2px;
      font-size: 13px;
      font-weight: 700;
      color: #261a14;
      line-height: 1.35;
    }

    .mobile-room-sub {
      margin: 0;
      font-size: 11px;
      color: #9e8b7c;
    }

    .mobile-room-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .mobile-room-meta-label {
      display: block;
      font-size: 10px;
      color: #a88f7a;
      margin-bottom: 2px;
    }

    .mobile-room-meta-value {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #261a14;
    }

    .mobile-room-footer {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #f4ede5;
      display: flex;
      justify-content: flex-end;
    }

    .btn-mobile-edit {
      width: 100%;
      height: 32px;
    }

    /* Bottom Sheet Mobile */
    .room-drawer.sheet-capable {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 100%;
      max-height: 90vh;
      border-radius: 18px 18px 0 0;
      padding: 14px 18px 22px;
      box-shadow: 0 -8px 28px rgba(24, 18, 14, 0.16);
    }

    .sheet-handle {
      width: 36px;
      height: 4px;
      border-radius: 999px;
      background-color: #dfd5ca;
      margin: 0 auto 12px;
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

    .mobile-confirm-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .mobile-confirm-top-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #261a14;
    }

    .mobile-confirm-inner-card {
      padding: 16px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
    }

    .confirm-modal-title {
      font-size: 14px;
    }

    .confirm-modal-desc {
      margin-bottom: 14px;
      font-size: 11px;
    }

    .confirm-modal-actions {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }
  }
</style>
