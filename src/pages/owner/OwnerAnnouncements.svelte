<script>
  import { onMount } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  /**
   * @typedef {Object} AnnouncementApiItem
   * @property {number | string} id
   * @property {string} title
   * @property {'urgent' | 'routine' | 'maintenance' | string} category
   * @property {string} content
   * @property {string} [author_name]
   * @property {string} [published_at]
   */

  /**
   * @typedef {Object} AnnouncementViewModel
   * @property {number | string} id
   * @property {string} title
   * @property {'urgent' | 'routine' | 'maintenance' | string} category
   * @property {string} categoryLabel
   * @property {string} content
   * @property {string} author
   * @property {string} publishedAt
   * @property {string} publishedTime
   * @property {string} excerpt
   * @property {string} target
   */

  /** @type {'all' | 'urgent' | 'routine' | 'maintenance'} */
  let selectedCategory = $state("all");
  let searchQuery = $state("");
  let currentPage = $state(1);
  const perPage = 10;

  let isMobileViewport = $state(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );

  let displayOwnerName = $derived($currentUser?.name || "Bu Ratna");
  let displayOwnerRole = $derived.by(() => {
    const role = ($currentUser?.role || "owner").toLowerCase();
    if (role === "owner") return "Pemilik";
    return $currentUser?.role || "Pemilik";
  });

  // --- STATE DATA API ---
  let loading = $state(true);
  let errorMsg = $state("");
  /** @type {AnnouncementViewModel[]} */
  let announcements = $state([]);
  /** @type {AnnouncementViewModel[]} */
  let allCategorySnapshot = $state([]);
  let totalCount = $state(0);
  let allTotalCount = $state(0);
  let totalPages = $state(1);

  /** @type {{ all: number, urgent: number, routine: number, maintenance: number }} */
  let categoryCounts = $state({
    all: 0,
    urgent: 0,
    routine: 0,
    maintenance: 0,
  });

  // --- STATE MODAL & FORM ---
  /** @type {'create' | 'detail' | 'edit' | 'delete' | null} */
  let activeModal = $state(null);
  /** @type {AnnouncementViewModel | null} */
  let selectedItem = $state(null);

  // Form state
  let formTitle = $state("");
  /** @type {'urgent' | 'routine' | 'maintenance'} */
  let formCategory = $state("routine");
  let formContent = $state("");
  let formSubmitting = $state(false);
  let formError = $state("");

  /** @type {Record<string, string>} */
  const categoryMap = {
    urgent: "Urgent",
    routine: "Rutin",
    maintenance: "Maintenance",
  };

  /**
   * @param {string | null | undefined} isoString
   * @returns {string}
   */
  function formatDate(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  /**
   * @param {string | null | undefined} isoString
   * @returns {string}
   */
  function formatDateTime(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * @param {AnnouncementApiItem} item
   * @returns {AnnouncementViewModel}
   */
  function mapAnnouncementItem(item) {
    return {
      ...item,
      categoryLabel: categoryMap[item.category] || item.category,
      author: item.author_name || "Pengelola",
      publishedAt: formatDate(item.published_at),
      publishedTime: formatDateTime(item.published_at),
      excerpt: item.content
        ? item.content.length > 70
          ? item.content.slice(0, 70) + "..."
          : item.content
        : "",
      target: "Semua Penghuni & Wali",
    };
  }

  /**
   * @param {any} response
   * @param {AnnouncementViewModel[]} mappedList
   */
  function syncCategoryCounts(response, mappedList) {
    const apiCounts =
      response?.counts || response?.meta?.counts || response?.summary;
    if (apiCounts && typeof apiCounts === "object") {
      const urgent = Number(apiCounts.urgent ?? 0);
      const routine = Number(apiCounts.routine ?? 0);
      const maintenance = Number(apiCounts.maintenance ?? 0);
      const all = Number(
        apiCounts.all ??
          apiCounts.total ??
          response?.pagination?.total ??
          mappedList.length,
      );
      categoryCounts = {
        all: Number.isFinite(all) ? all : 0,
        urgent: Number.isFinite(urgent) ? urgent : 0,
        routine: Number.isFinite(routine) ? routine : 0,
        maintenance: Number.isFinite(maintenance) ? maintenance : 0,
      };
      return;
    }

    if (selectedCategory === "all") {
      const sourceForCounts =
        allCategorySnapshot.length > 0 ? allCategorySnapshot : mappedList;
      let urgent = 0;
      let routine = 0;
      let maintenance = 0;
      for (const item of sourceForCounts) {
        if (item.category === "urgent") urgent += 1;
        else if (item.category === "routine") routine += 1;
        else if (item.category === "maintenance") maintenance += 1;
      }
      const totalAll = Number(response?.pagination?.total ?? mappedList.length);
      categoryCounts = {
        all: Number.isFinite(totalAll) ? totalAll : mappedList.length,
        urgent,
        routine,
        maintenance,
      };
    } else {
      const countForCurrentTab = Number(
        response?.pagination?.total ?? mappedList.length,
      );
      categoryCounts = {
        ...categoryCounts,
        [selectedCategory]: Number.isFinite(countForCurrentTab)
          ? countForCurrentTab
          : mappedList.length,
      };
    }
  }

  async function fetchAnnouncements() {
    loading = true;
    errorMsg = "";

    try {
      let queryParams = `?page=${currentPage}&limit=${perPage}`;
      if (selectedCategory !== "all") {
        queryParams += `&category=${selectedCategory}`;
      }

      /** @type {any} */
      const response = await apiRequest(`/api/announcements${queryParams}`);
      if (response && response.success) {
        const mapped = (response.data || []).map(
          /** @param {AnnouncementApiItem} item */ (item) =>
            mapAnnouncementItem(item),
        );
        announcements = mapped;

        const fetchedTotal = response.pagination?.total ?? announcements.length;
        totalCount = fetchedTotal;
        totalPages =
          response.pagination?.total_pages ||
          Math.ceil(totalCount / perPage) ||
          1;

        if (selectedCategory === "all") {
          allTotalCount = fetchedTotal;
          if (currentPage === 1) {
            allCategorySnapshot = mapped;
          }
        }

        syncCategoryCounts(response, mapped);
      }
    } catch (/** @type {any} */ err) {
      errorMsg = err?.message || "Gagal mengambil data pengumuman.";
    } finally {
      loading = false;
    }
  }

  let filteredItems = $derived.by(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return announcements;

    return announcements.filter((item) => {
      return (
        (item.title && item.title.toLowerCase().includes(keyword)) ||
        (item.content && item.content.toLowerCase().includes(keyword)) ||
        (item.excerpt && item.excerpt.toLowerCase().includes(keyword))
      );
    });
  });

  /**
   * @param {'all' | 'urgent' | 'routine' | 'maintenance'} categoryKey
   */
  function selectCategory(categoryKey) {
    selectedCategory = categoryKey;
    currentPage = 1;
    fetchAnnouncements();
  }

  function handlePrevPage() {
    if (currentPage > 1) {
      currentPage -= 1;
      fetchAnnouncements();
    }
  }

  function handleNextPage() {
    if (currentPage < totalPages) {
      currentPage += 1;
      fetchAnnouncements();
    }
  }

  // --- HANDLER MODAL ---
  function openCreateDrawer() {
    formTitle = "";
    formCategory = "routine";
    formContent = "";
    formError = "";
    activeModal = "create";
  }

  /**
   * @param {AnnouncementViewModel} item
   */
  function openDetailView(item) {
    selectedItem = item;
    activeModal = "detail";
  }

  /**
   * @param {AnnouncementViewModel} item
   */
  function openEditDrawer(item) {
    selectedItem = item;
    formTitle = item.title;
    formCategory = /** @type {'urgent' | 'routine' | 'maintenance'} */ (
      item.category || "routine"
    );
    formContent = item.content;
    formError = "";
    activeModal = "edit";
  }

  /**
   * @param {AnnouncementViewModel} item
   */
  function openDeleteModal(item) {
    selectedItem = item;
    activeModal = "delete";
  }

  function closeModal() {
    activeModal = null;
    selectedItem = null;
    formError = "";
  }

  // --- HANDLER API CRUD ---
  /**
   * @param {SubmitEvent} [e]
   */
  async function handleCreate(e) {
    if (e) e.preventDefault();
    formSubmitting = true;
    formError = "";

    try {
      await apiRequest("/api/announcements", {
        method: "POST",
        body: {
          title: formTitle,
          category: formCategory,
          content: formContent,
        },
      });
      closeModal();
      fetchAnnouncements();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal menambahkan pengumuman.";
    } finally {
      formSubmitting = false;
    }
  }

  /**
   * @param {SubmitEvent} [e]
   */
  async function handleUpdate(e) {
    if (e) e.preventDefault();
    if (!selectedItem?.id) return;

    formSubmitting = true;
    formError = "";

    try {
      await apiRequest(`/api/announcements/${selectedItem.id}`, {
        method: "PATCH",
        body: {
          title: formTitle,
          category: formCategory,
          content: formContent,
        },
      });
      closeModal();
      fetchAnnouncements();
    } catch (/** @type {any} */ err) {
      formError = err?.message || "Gagal memperbarui pengumuman.";
    } finally {
      formSubmitting = false;
    }
  }

  async function handleDelete() {
    if (!selectedItem?.id) return;

    formSubmitting = true;
    try {
      await apiRequest(`/api/announcements/${selectedItem.id}`, {
        method: "DELETE",
      });
      closeModal();
      fetchAnnouncements();
    } catch (/** @type {any} */ err) {
      alert(err?.message || "Gagal menghapus pengumuman.");
    } finally {
      formSubmitting = false;
    }
  }

  /**
   * @param {{ href?: string }} item
   */
  function handleNavigate(item) {
    if (!item?.href || typeof window === "undefined") return;
    window.location.hash = `#${item.href}`;
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => {
      isMobileViewport = window.innerWidth <= 768;
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  });

  onMount(() => {
    fetchAnnouncements();
  });
</script>

<DashboardLayout
  activeKey="announcements"
  ownerName={displayOwnerName}
  ownerRole={displayOwnerRole}
  onNavigate={handleNavigate}
>
  <div class="announcements-page">
    {#if activeModal === "detail" && selectedItem}
      <!-- TAMPILAN DETAIL PENGUMUMAN -->
      <div
        class="detail-page-container"
        in:fly={{ y: 16, duration: 250, easing: cubicOut }}
      >
        <button type="button" class="btn-back-link" onclick={closeModal}>
          &larr; Kembali ke Pengumuman
        </button>

        <!-- Header versi Desktop -->
        <div class="detail-header-row desktop-only">
          <div class="detail-heading-group">
            <div class="detail-badge-row">
              <span class="cat-badge {selectedItem.category}"
                >{selectedItem.categoryLabel}</span
              >
              <span class="detail-target-tag">{selectedItem.target}</span>
            </div>
            <h1 class="detail-main-title">{selectedItem.title}</h1>
            <p class="detail-meta">
              Oleh {selectedItem.author} &bull; {selectedItem.publishedTime}
            </p>
          </div>

          <div class="detail-action-btns">
            <button
              type="button"
              class="btn-edit-outline"
              onclick={() => selectedItem && openEditDrawer(selectedItem)}
            >
              Ubah
            </button>
            <button
              type="button"
              class="btn-delete-solid"
              onclick={() => selectedItem && openDeleteModal(selectedItem)}
            >
              Hapus
            </button>
          </div>
        </div>

        <!-- Kartu Detail versi Mobile -->
        <article
          class="mobile-detail-card mobile-only"
          in:fade={{ duration: 160 }}
        >
          <div class="mobile-detail-header">
            <div class="mobile-detail-top-meta">
              <span class="cat-badge {selectedItem.category}"
                >{selectedItem.categoryLabel}</span
              >
              <span class="mobile-detail-date">{selectedItem.publishedAt}</span>
            </div>

            <h1 class="mobile-detail-title">{selectedItem.title}</h1>
            <p class="mobile-detail-author">
              Oleh: {selectedItem.author} &bull; Target: {selectedItem.target}
            </p>
          </div>

          <div class="mobile-detail-divider"></div>

          <p class="detail-text-content mobile-detail-body">
            {selectedItem.content}
          </p>

          <div class="mobile-detail-actions">
            <button
              type="button"
              class="btn-mobile-edit"
              onclick={() => selectedItem && openEditDrawer(selectedItem)}
            >
              Ubah
            </button>
            <button
              type="button"
              class="btn-mobile-delete"
              onclick={() => selectedItem && openDeleteModal(selectedItem)}
            >
              Hapus
            </button>
          </div>
        </article>

        <!-- Grid Detail versi Desktop -->
        <div class="detail-grid desktop-only" in:fade={{ duration: 160 }}>
          <div class="detail-body-card">
            <p class="detail-text-content">{selectedItem.content}</p>
          </div>

          <div class="detail-side-stack">
            <div class="side-info-card">
              <h3 class="side-card-title">Info Pengumuman</h3>
              <div class="info-row">
                <span class="info-label">Kategori</span>
                <span class="info-val">{selectedItem.categoryLabel}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Penulis</span>
                <span class="info-val">{selectedItem.author}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Tanggal terbit</span>
                <span class="info-val">{selectedItem.publishedTime}</span>
              </div>
            </div>

            <div class="side-info-card">
              <h3 class="side-card-title">Jangkauan</h3>
              <div class="info-row">
                <span class="info-label">Terlihat oleh</span>
                <span class="info-val">{selectedItem.target}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <!-- TAMPILAN UTAMA KELOLA PENGUMUMAN -->
      <div
        class="announcements-main-wrap"
        in:fly={{ y: 16, duration: 250, easing: cubicOut }}
      >
        <div class="announcements-top-bar">
          <div class="announcements-heading-group">
            <h1 class="page-title">
              <span class="desktop-only">Pengumuman</span>
              <span class="mobile-only">Pengumuman</span>
            </h1>
            <p class="page-subtitle">
              <span class="desktop-only"
                >Kelola informasi dan pemberitahuan resmi untuk penghuni maupun
                wali</span
              >
              <span class="mobile-only"
                >Kelola informasi dan pemberitahuan resmi untuk penghuni maupun
                wali</span
              >
            </p>
          </div>

          <div class="top-actions-right desktop-only">
            <button
              type="button"
              class="btn-create-announcement"
              onclick={openCreateDrawer}
            >
              Buat Pengumuman
            </button>
          </div>
        </div>

        <!-- Tombol Buat Pengumuman & Pencarian (Mobile) -->
        <div class="mobile-only mobile-cta-wrap">
          <button
            type="button"
            class="btn-mobile-create-full"
            onclick={openCreateDrawer}
          >
            Buat Pengumuman
          </button>

          <div class="mobile-search-box">
            <svg
              class="mobile-search-icon"
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
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              class="mobile-search-input"
              bind:value={searchQuery}
              placeholder="Cari judul atau isi pengumuman..."
              aria-label="Cari judul atau isi pengumuman"
            />
          </div>
        </div>

        <!-- FILTER KATEGORI (DESKTOP) -->
        <div
          class="category-tabs desktop-only"
          role="tablist"
          aria-label="Filter kategori pengumuman"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "all"}
            class="category-tab {selectedCategory === 'all' ? 'active' : ''}"
            onclick={() => selectCategory("all")}
          >
            Semua ({categoryCounts.all})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "urgent"}
            class="category-tab {selectedCategory === 'urgent' ? 'active' : ''}"
            onclick={() => selectCategory("urgent")}
          >
            Urgent ({categoryCounts.urgent})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "routine"}
            class="category-tab {selectedCategory === 'routine'
              ? 'active'
              : ''}"
            onclick={() => selectCategory("routine")}
          >
            Rutin ({categoryCounts.routine})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "maintenance"}
            class="category-tab {selectedCategory === 'maintenance'
              ? 'active'
              : ''}"
            onclick={() => selectCategory("maintenance")}
          >
            Maintenance ({categoryCounts.maintenance})
          </button>
        </div>

        <!-- FILTER KATEGORI 2 ATAS 2 BAWAH (MOBILE) -->
        <div
          class="mobile-only mobile-category-grid"
          role="tablist"
          aria-label="Filter kategori pengumuman mobile"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "all"}
            class="mobile-category-tab {selectedCategory === 'all'
              ? 'active'
              : ''}"
            onclick={() => selectCategory("all")}
          >
            Semua ({categoryCounts.all})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "urgent"}
            class="mobile-category-tab {selectedCategory === 'urgent'
              ? 'active'
              : ''}"
            onclick={() => selectCategory("urgent")}
          >
            Urgent ({categoryCounts.urgent})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "routine"}
            class="mobile-category-tab {selectedCategory === 'routine'
              ? 'active'
              : ''}"
            onclick={() => selectCategory("routine")}
          >
            Rutin ({categoryCounts.routine})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "maintenance"}
            class="mobile-category-tab {selectedCategory === 'maintenance'
              ? 'active'
              : ''}"
            onclick={() => selectCategory("maintenance")}
          >
            Maintenance ({categoryCounts.maintenance})
          </button>
        </div>

        {#if loading}
          <div class="state-container" in:fade={{ duration: 160 }}>
            Memuat data pengumuman...
          </div>
        {:else if errorMsg}
          <div class="state-container error" in:fade={{ duration: 160 }}>
            <span>{errorMsg}</span>
            <button type="button" class="btn-retry" onclick={fetchAnnouncements}
              >Coba Lagi</button
            >
          </div>
        {:else if announcements.length === 0 && selectedCategory === "all" && allTotalCount === 0}
          <!-- STATE PENGUMUMAN KOSONG AKTUAL DATABASE -->
          <div class="empty-state-center" in:fade={{ duration: 160 }}>
            <section
              class="empty-announcement-card"
              aria-label="Belum ada pengumuman"
            >
              <div class="empty-icon-circle" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path
                    d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
                  />
                </svg>
              </div>

              <h2 class="empty-card-heading">Belum ada pengumuman</h2>
              <p class="empty-card-copy">
                Pengumuman yang Anda terbitkan akan langsung terlihat oleh
                seluruh penghuni. Mulai dengan satu pengumuman penting.
              </p>
            </section>

            <button
              type="button"
              class="btn-create-announcement empty-cta-btn"
              onclick={openCreateDrawer}
            >
              Buat Pengumuman
            </button>
          </div>
        {:else}
          <!-- DAFTAR KARTU PENGUMUMAN (MOBILE) -->
          <div
            class="mobile-only mobile-cards-list"
            in:fade={{ duration: 160 }}
          >
            {#each filteredItems as item (item.id)}
              <article class="mobile-announcement-card">
                <button
                  type="button"
                  class="mobile-card-trigger"
                  onclick={() => openDetailView(item)}
                >
                  <div class="mobile-card-top">
                    <h2 class="mobile-card-title">{item.title}</h2>
                    <span class="cat-badge {item.category}"
                      >{item.categoryLabel}</span
                    >
                  </div>

                  <p class="mobile-card-excerpt">{item.excerpt}</p>

                  <div class="mobile-card-meta-grid">
                    <div>
                      <span class="mobile-meta-label">Target</span>
                      <span class="mobile-meta-value">{item.target}</span>
                    </div>
                    <div>
                      <span class="mobile-meta-label">Dipublikasikan</span>
                      <span class="mobile-meta-value">{item.publishedAt}</span>
                    </div>
                  </div>
                </button>
              </article>
            {:else}
              <div class="mobile-empty-search">
                Tidak ada pengumuman yang cocok.
              </div>
            {/each}
          </div>

          <!-- KARTU DAFTAR PENGUMUMAN (DESKTOP) -->
          <section
            class="list-card desktop-only"
            aria-label="Daftar pengumuman"
            in:fade={{ duration: 160 }}
          >
            <div class="list-card-header">
              <h2 class="list-card-title">Daftar Pengumuman</h2>
              <p class="list-card-subtitle">
                10 pengumuman per halaman, terbaru dulu
              </p>
            </div>

            {#if filteredItems.length === 0}
              <div class="empty-inline">
                Tidak ada pengumuman pada kategori ini.
              </div>
            {:else}
              <div class="table-wrap">
                <table class="announcements-table">
                  <thead>
                    <tr>
                      <th>Judul</th>
                      <th>Kategori</th>
                      <th>Penulis</th>
                      <th>Tanggal Publikasi</th>
                      <th class="col-actions">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each filteredItems as item (item.id)}
                      <tr>
                        <td class="cell-title">{item.title}</td>
                        <td>
                          <span class="cat-badge {item.category}"
                            >{item.categoryLabel}</span
                          >
                        </td>
                        <td class="cell-muted">{item.author}</td>
                        <td class="cell-muted">{item.publishedAt}</td>
                        <td class="col-actions">
                          <div class="action-buttons">
                            <button
                              type="button"
                              class="btn-detail-link"
                              onclick={() => openDetailView(item)}
                              >Detail</button
                            >
                            <button
                              type="button"
                              class="btn-edit-outline"
                              onclick={() => openEditDrawer(item)}>Ubah</button
                            >
                            <button
                              type="button"
                              class="btn-delete-solid"
                              onclick={() => openDeleteModal(item)}
                              >Hapus</button
                            >
                          </div>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}

            <p class="card-footnote">
              Pengumuman Urgent tampil paling atas di beranda penghuni. Hapus
              pengumuman wajib konfirmasi.
            </p>

            <div class="pagination-bar">
              <span class="pagination-summary">
                Menampilkan {announcements.length > 0
                  ? (currentPage - 1) * perPage + 1
                  : 0}–{Math.min(currentPage * perPage, totalCount)} dari {totalCount}
                pengumuman
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
    {/if}
  </div>

  <!-- DRAWER / BOTTOM SHEET BUAT PENGUMUMAN -->
  {#if activeModal === "create"}
    <div
      class="drawer-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeModal}
      role="presentation"
    ></div>
    <aside
      class="right-drawer sheet-capable"
      aria-label="Tulis Pengumuman Baru"
      transition:fly={{
        x: isMobileViewport ? 0 : 48,
        y: isMobileViewport ? 48 : 0,
        duration: 220,
        easing: cubicOut,
      }}
    >
      <div class="sheet-handle mobile-only"></div>
      <div class="drawer-top">
        <div>
          <h2 class="drawer-heading">
            <span class="desktop-only">Buat Pengumuman</span>
            <span class="mobile-only"
              >Publikasikan informasi ke dashboard penghuni &amp; wali</span
            >
          </h2>
        </div>
        <button type="button" class="btn-close-x" onclick={closeModal}
          >&times;</button
        >
      </div>

      {#if formError}
        <div class="form-error-banner">{formError}</div>
      {/if}

      <form class="drawer-form" onsubmit={handleCreate}>
        <div class="form-group">
          <label class="form-label" for="ann-title">Judul Pengumuman</label>
          <input
            id="ann-title"
            type="text"
            class="form-input"
            bind:value={formTitle}
            placeholder="Contoh: Jadwal Pembersihan Toren Air"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="ann-category"
            >Kategori Pengumuman</label
          >
          <select
            id="ann-category"
            class="form-input"
            bind:value={formCategory}
            required
          >
            <option value="urgent">Urgent - Mendesak</option>
            <option value="routine">Rutin</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="ann-content">Isi pengumuman</label>
          <textarea
            id="ann-content"
            class="form-textarea"
            rows="5"
            bind:value={formContent}
            placeholder="Tulis detail informasi yang ingin disampaikan..."
            required></textarea>
        </div>

        <div class="drawer-footer-actions">
          <button
            type="submit"
            class="btn-primary-brown full-width"
            disabled={formSubmitting}
          >
            {formSubmitting ? "Menerbitkan..." : "Publikasikan Pengumuman"}
          </button>
          <button type="button" class="btn-secondary-full" onclick={closeModal}
            >Batal</button
          >
        </div>
      </form>
    </aside>
  {/if}

  <!-- DRAWER / BOTTOM SHEET UBAH PENGUMUMAN -->
  {#if activeModal === "edit"}
    <div
      class="drawer-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeModal}
      role="presentation"
    ></div>
    <aside
      class="right-drawer sheet-capable"
      aria-label="Ubah Pengumuman"
      transition:fly={{
        x: isMobileViewport ? 0 : 48,
        y: isMobileViewport ? 48 : 0,
        duration: 220,
        easing: cubicOut,
      }}
    >
      <div class="sheet-handle mobile-only"></div>
      <div class="drawer-top">
        <div>
          <h2 class="drawer-heading">
            <span class="desktop-only">Ubah Pengumuman</span>
            <span class="mobile-only"
              >Perbarui informasi pengumuman yang sudah dipublikasikan</span
            >
          </h2>
        </div>
        <button type="button" class="btn-close-x" onclick={closeModal}
          >&times;</button
        >
      </div>

      {#if formError}
        <div class="form-error-banner">{formError}</div>
      {/if}

      <form class="drawer-form" onsubmit={handleUpdate}>
        <div class="form-group">
          <label class="form-label" for="edit-title">Judul Pengumuman</label>
          <input
            id="edit-title"
            type="text"
            class="form-input"
            bind:value={formTitle}
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-category"
            >Kategori Pengumuman</label
          >
          <select
            id="edit-category"
            class="form-input"
            bind:value={formCategory}
            required
          >
            <option value="urgent">Urgent - Mendesak</option>
            <option value="routine">Rutin</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-content">Isi pengumuman</label>
          <textarea
            id="edit-content"
            class="form-textarea"
            rows="6"
            bind:value={formContent}
            required></textarea>
        </div>

        <div class="drawer-footer-actions">
          <button
            type="submit"
            class="btn-primary-brown full-width"
            disabled={formSubmitting}
          >
            {formSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
          <button type="button" class="btn-secondary-full" onclick={closeModal}
            >Batal</button
          >
        </div>
      </form>
    </aside>
  {/if}

  <!-- MODAL / BOTTOM SHEET HAPUS PENGUMUMAN -->
  {#if activeModal === "delete" && selectedItem}
    <div
      class="modal-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeModal}
      role="presentation"
    ></div>
    <div
      class="delete-modal-box sheet-delete-capable"
      transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
    >
      <div class="sheet-handle mobile-only"></div>
      <h3 class="delete-modal-title">Hapus pengumuman ini?</h3>
      <p class="delete-modal-desc">
        Pengumuman "{selectedItem.title}" akan dihapus permanen dari database.
      </p>

      <div class="delete-modal-actions">
        <button
          type="button"
          class="btn-cancel-modal"
          onclick={closeModal}
          disabled={formSubmitting}
        >
          Batal
        </button>
        <button
          type="button"
          class="btn-confirm-delete"
          onclick={handleDelete}
          disabled={formSubmitting}
        >
          {formSubmitting ? "Menghapus..." : "Ya, lanjutkan"}
        </button>
      </div>
    </div>
  {/if}
</DashboardLayout>

<style>
  .announcements-page,
  .announcements-page :global(button),
  .announcements-page :global(input),
  .announcements-page :global(select),
  .announcements-page :global(textarea),
  .right-drawer,
  .delete-modal-box {
    font-family: "Inter", sans-serif;
  }

  .mobile-only {
    display: none;
  }

  .state-container,
  .empty-inline {
    padding: 32px 16px;
    text-align: center;
    color: #9e8b7c;
    font-size: 13px;
    background-color: #ffffff;
    border: 1px solid #ece3d9;
    border-radius: 12px;
  }

  .empty-inline {
    border: none;
    padding: 24px 12px;
  }

  .state-container.error {
    color: #c62828;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .btn-retry {
    padding: 6px 14px;
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
    margin-bottom: 12px;
    border-radius: 6px;
    background-color: #fdecec;
    border: 1px solid #f2c6c2;
    color: #c62828;
    font-size: 12px;
  }

  .announcements-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 22px;
  }

  .announcements-heading-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .top-actions-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .page-title {
    margin: 0;
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

  .btn-create-announcement {
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

  .btn-create-announcement:hover {
    background-color: #553c2a;
  }

  /* --- EMPTY STATE STYLES --- */
  .empty-state-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 360px;
    padding: 24px 12px;
  }

  .empty-announcement-card {
    width: 100%;
    max-width: 440px;
    padding: 32px 28px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
    text-align: center;
  }

  .empty-icon-circle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    background-color: #f3ece4;
    color: #8f7c6e;
    margin-bottom: 14px;
  }

  .empty-card-heading {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .empty-card-copy {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .empty-cta-btn {
    margin-top: 14px;
  }

  .category-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  .category-tab {
    height: 34px;
    padding: 0 16px;
    border: 1px solid #e6ddd2;
    border-radius: 999px;
    background-color: #ffffff;
    color: #5c4d42;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .category-tab:hover {
    background-color: #f6f1eb;
  }

  .category-tab.active {
    border-color: #5c432d;
    background-color: #5c432d;
    color: #ffffff;
    font-weight: 600;
  }

  .list-card {
    padding: 22px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .list-card-header {
    margin-bottom: 16px;
  }

  .list-card-title {
    margin: 0 0 3px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .list-card-subtitle {
    margin: 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .announcements-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .announcements-table th {
    padding: 10px 12px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
    white-space: nowrap;
  }

  .announcements-table td {
    padding: 13px 12px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
    vertical-align: middle;
  }

  .cell-title {
    font-weight: 600;
    color: #261a14;
  }

  .cell-muted {
    color: #8f7c6e;
    white-space: nowrap;
  }

  .cat-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .cat-badge.urgent {
    background-color: #fde8e8;
    color: #c92a2a;
  }

  .cat-badge.routine {
    background-color: #f3efe9;
    color: #6c5b4f;
  }

  .cat-badge.maintenance {
    background-color: #fff3d6;
    color: #b7791f;
  }

  .col-actions {
    text-align: right;
    white-space: nowrap;
  }

  .action-buttons {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .btn-detail-link {
    padding: 4px 8px;
    border: none;
    background: transparent;
    color: #684b36;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-detail-link:hover {
    text-decoration: underline;
  }

  .btn-edit-outline {
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

  .btn-edit-outline:hover {
    background-color: #faf7f2;
  }

  .btn-delete-solid {
    height: 28px;
    padding: 0 12px;
    border: none;
    border-radius: 6px;
    background-color: #e02424;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-delete-solid:hover {
    background-color: #c81e1e;
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

  .pagination-summary {
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pagination-page-info {
    font-size: 11px;
    color: #9e8b7c;
    margin-right: 4px;
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

  /* --- DETAIL VIEW STYLES --- */
  .btn-back-link {
    padding: 0;
    border: none;
    background: transparent;
    color: #8c7b6e;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    margin-bottom: 14px;
  }

  .btn-back-link:hover {
    color: #261a14;
  }

  .detail-header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 18px;
    border-bottom: 1px solid #ece3d9;
    margin-bottom: 22px;
  }

  .detail-heading-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .detail-badge-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .detail-target-tag {
    font-size: 11px;
    font-weight: 500;
    color: #9e8b7c;
  }

  .detail-main-title {
    margin: 2px 0 0;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: #261a14;
  }

  .detail-meta {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .detail-action-btns {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.8fr) minmax(260px, 1fr);
    gap: 20px;
    align-items: start;
  }

  .detail-body-card {
    padding: 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .detail-text-content {
    margin: 0;
    font-size: 13px;
    line-height: 1.65;
    color: #261a14;
    white-space: pre-line;
  }

  .detail-side-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .side-info-card {
    padding: 20px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .side-card-title {
    margin: 0 0 14px;
    font-size: 14px;
    font-weight: 700;
    color: #261a14;
  }

  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    font-size: 12px;
  }

  .info-row:last-child {
    margin-bottom: 0;
  }

  .info-label {
    color: #9e8b7c;
  }

  .info-val {
    font-weight: 600;
    color: #261a14;
    text-align: right;
  }

  /* --- DRAWER RIGHT STYLES --- */
  .drawer-backdrop,
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background-color: rgba(24, 18, 14, 0.45);
  }

  .right-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    width: 100%;
    max-width: 440px;
    padding: 24px;
    background-color: #ffffff;
    box-shadow: -8px 0 28px rgba(24, 18, 14, 0.12);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    font-family: inherit;
    box-sizing: border-box;
  }

  .drawer-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .drawer-heading {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #261a14;
  }

  .btn-close-x {
    border: none;
    background: transparent;
    font-size: 24px;
    color: #8c7b6e;
    cursor: pointer;
    line-height: 1;
  }

  .drawer-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    font-size: 12px;
    font-weight: 600;
    color: #261a14;
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    box-sizing: border-box;
  }

  .form-textarea {
    min-height: 150px;
    resize: vertical;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: #684b36;
  }

  .drawer-footer-actions {
    margin-top: 8px;
    padding-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn-primary-brown {
    height: 40px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary-brown.full-width {
    width: 100%;
  }

  .btn-secondary-full {
    height: 40px;
    width: 100%;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  /* --- DELETE MODAL STYLES --- */
  .delete-modal-box {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 60;
    width: 90%;
    max-width: 440px;
    padding: 24px;
    border-radius: 14px;
    background-color: #ffffff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    box-sizing: border-box;
  }

  .delete-modal-title {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .delete-modal-desc {
    margin: 0 0 20px;
    font-size: 12px;
    color: #7c6858;
    line-height: 1.5;
  }

  .delete-modal-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel-modal {
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

  .btn-confirm-delete {
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

  /* --- MOBILE RESPONSIVE OVERRIDES --- */
  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: block;
    }

    .announcements-top-bar {
      margin-bottom: 14px;
    }

    .announcements-heading-group {
      gap: 6px;
    }

    .page-title {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.25;
    }

    .page-subtitle {
      font-size: 12px;
      line-height: 1.5;
      color: #a88f7a;
    }

    .mobile-cta-wrap {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
    }

    .btn-mobile-create-full {
      width: 100%;
      height: 40px;
      border: none;
      border-radius: 8px;
      background-color: #684b36;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
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
    }

    .mobile-search-input {
      width: 100%;
      height: 38px;
      padding: 0 12px 0 36px;
      border: 1px solid #e4dad0;
      border-radius: 8px;
      background-color: #ffffff;
      color: #261a14;
      font-size: 12px;
      box-sizing: border-box;
    }

    /* Filter 2 atas, 2 bawah di mobile */
    .mobile-category-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }

    .mobile-category-tab {
      width: 100%;
      height: 36px;
      padding: 0 10px;
      border: 1px solid #e6ddd2;
      border-radius: 999px;
      background-color: #ffffff;
      color: #5c4d42;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      text-align: center;
    }

    .mobile-category-tab.active {
      border-color: #5c432d;
      background-color: #5c432d;
      color: #ffffff;
      font-weight: 600;
    }

    .mobile-cards-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-announcement-card {
      border: 1px solid #ece3d9;
      border-radius: 10px;
      background-color: #ffffff;
      overflow: hidden;
    }

    .mobile-card-trigger {
      display: block;
      width: 100%;
      padding: 14px 16px;
      border: none;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }

    .mobile-card-trigger:hover {
      background-color: #fcfaf7;
    }

    .mobile-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 4px;
    }

    .mobile-card-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #261a14;
      line-height: 1.35;
    }

    .mobile-card-excerpt {
      margin: 0 0 12px;
      font-size: 11px;
      color: #9e8b7c;
      line-height: 1.45;
    }

    .mobile-card-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .mobile-meta-label {
      display: block;
      font-size: 10px;
      color: #a88f7a;
      margin-bottom: 2px;
    }

    .mobile-meta-value {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #261a14;
    }

    .mobile-empty-search {
      padding: 24px 12px;
      text-align: center;
      font-size: 12px;
      color: #9e8b7c;
      background-color: #ffffff;
      border: 1px solid #ece3d9;
      border-radius: 10px;
    }

    /* Detail Mobile Header & Card */
    .mobile-detail-card {
      padding: 18px 16px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
    }

    .mobile-detail-header {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .mobile-detail-top-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }

    .mobile-detail-date {
      font-size: 11px;
      color: #9e8b7c;
    }

    .mobile-detail-title {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #261a14;
      line-height: 1.25;
      letter-spacing: -0.01em;
    }

    .mobile-detail-author {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: #9e8b7c;
    }

    .mobile-detail-divider {
      height: 1px;
      background-color: #f0e8df;
      margin: 14px 0;
    }

    .mobile-detail-body {
      margin-bottom: 18px;
    }

    .mobile-detail-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .btn-mobile-edit {
      width: 100%;
      height: 38px;
      border: 1px solid #e2d8cd;
      border-radius: 8px;
      background-color: #ffffff;
      color: #261a14;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-mobile-delete {
      width: 100%;
      height: 38px;
      border: none;
      border-radius: 8px;
      background-color: #e02424;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    /* Bottom Sheet Mobile */
    .right-drawer.sheet-capable {
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

    .drawer-heading {
      font-size: 15px;
      line-height: 1.35;
    }

    .delete-modal-box.sheet-delete-capable {
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

    .delete-modal-actions {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: 8px;
    }

    .delete-modal-actions .btn-confirm-delete,
    .delete-modal-actions .btn-cancel-modal {
      width: 100%;
      height: 40px;
    }
  }
</style>
