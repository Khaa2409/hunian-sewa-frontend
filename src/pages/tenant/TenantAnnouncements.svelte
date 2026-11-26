<script>
  // @ts-check
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { fade, fly } from "svelte/transition";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { apiRequest } from "../../services/api.js";
  import { currentUser } from "../../stores/auth.js";

  /** @type {Record<string, any> | null} */
  let profile = $state(null);

  /** @type {Array<Record<string, any>>} */
  let announcements = $state([]);

  /** @type {string | number | null} */
  let selectedId = $state(null);

  /** @type {'all' | 'urgent' | 'routine' | 'maintenance'} */
  let activeCategory = $state("all");

  let searchQuery = $state("");
  let mobileDetailOpen = $state(false);
  let loading = $state(true);
  let errorMessage = $state("");

  /**
   * @param {string} raw
   * @returns {'urgent' | 'routine' | 'maintenance'}
   */
  function normalizeCategory(raw) {
    const val = String(raw || "")
      .trim()
      .toLowerCase();
    if (
      val.includes("urgent") ||
      val.includes("mendesak") ||
      val.includes("darurat") ||
      val.includes("penting")
    ) {
      return "urgent";
    }
    if (
      val.includes("maintenance") ||
      val.includes("perbaikan") ||
      val.includes("perawatan")
    ) {
      return "maintenance";
    }
    return "routine";
  }

  /**
   * @param {Record<string, any>} item
   * @returns {'urgent' | 'routine' | 'maintenance'}
   */
  function getItemCategory(item) {
    return normalizeCategory(
      item?.category || item?.priority || item?.tag || item?.type || "routine",
    );
  }

  /**
   * @param {'urgent' | 'routine' | 'maintenance'} cat
   */
  function getCategoryLabel(cat) {
    if (cat === "urgent") return "Urgent";
    if (cat === "maintenance") return "Maintenance";
    return "Rutin";
  }

  /**
   * @param {Record<string, any>} item
   */
  function getItemId(item) {
    return item?.id ?? item?.announcement_id ?? item?.slug ?? null;
  }

  /**
   * @param {string | null | undefined} dateStr
   */
  function formatTanggal(dateStr) {
    if (!dateStr) return "-";
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(parsed);
  }

  /**
   * @param {Record<string, any>} item
   */
  function getDateLabel(item) {
    return (
      item?.date_label ||
      formatTanggal(
        item?.published_at ||
          item?.created_at ||
          item?.date ||
          item?.updated_at,
      )
    );
  }

  /**
   * @param {Record<string, any>} item
   */
  function getAuthorName(item) {
    return (
      item?.author_name ||
      item?.created_by_name ||
      item?.author?.name ||
      item?.creator?.name ||
      item?.posted_by ||
      "Pengelola"
    );
  }

  /**
   * @param {Record<string, any>} item
   */
  function getTargetAudience(item) {
    const rawTarget =
      item?.target_label ||
      item?.target_audience ||
      item?.target ||
      item?.audience ||
      item?.recipient;
    if (Array.isArray(rawTarget)) {
      return rawTarget.filter(Boolean).join(", ") || "-";
    }
    return rawTarget ? String(rawTarget) : "Semua Penghuni";
  }

  /**
   * @param {Record<string, any>} item
   */
  function getSummaryText(item) {
    return (
      item?.summary ||
      item?.subtitle ||
      item?.excerpt ||
      item?.short_description ||
      item?.content ||
      ""
    );
  }

  /**
   * @param {Record<string, any>} item
   */
  function getBodyParagraphs(item) {
    const bodyText =
      item?.content ||
      item?.body ||
      item?.description ||
      item?.detail ||
      item?.summary ||
      "";
    const normalized = String(bodyText).replace(/\r\n/g, "\n").trim();
    if (!normalized) return [];
    return normalized
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  let counts = $derived.by(() => {
    let urgent = 0;
    let routine = 0;
    let maintenance = 0;

    for (const item of announcements) {
      const cat = getItemCategory(item);
      if (cat === "urgent") urgent += 1;
      else if (cat === "maintenance") maintenance += 1;
      else routine += 1;
    }

    return {
      all: announcements.length,
      urgent,
      routine,
      maintenance,
    };
  });

  let filteredAnnouncements = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();

    return announcements.filter((item) => {
      const cat = getItemCategory(item);
      if (activeCategory !== "all" && cat !== activeCategory) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        item?.title,
        item?.summary,
        item?.subtitle,
        item?.content,
        item?.body,
        item?.description,
        getCategoryLabel(cat),
        getAuthorName(item),
        getTargetAudience(item),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  });

  let selectedAnnouncement = $derived.by(() => {
    if (filteredAnnouncements.length === 0) return null;
    if (selectedId !== null && selectedId !== undefined) {
      const found = filteredAnnouncements.find(
        (item) => String(getItemId(item)) === String(selectedId),
      );
      if (found) return found;
    }
    return filteredAnnouncements[0];
  });

  $effect(() => {
    if (filteredAnnouncements.length === 0) {
      selectedId = null;
      return;
    }
    const existsInFiltered =
      selectedId !== null &&
      selectedId !== undefined &&
      filteredAnnouncements.some(
        (item) => String(getItemId(item)) === String(selectedId),
      );
    if (!existsInFiltered) {
      selectedId = getItemId(filteredAnnouncements[0]);
    }
  });

  /**
   * @param {Record<string, any>} item
   * @param {boolean} [openMobileView=true]
   */
  function selectAnnouncement(item, openMobileView = true) {
    selectedId = getItemId(item);
    if (
      openMobileView &&
      typeof window !== "undefined" &&
      window.innerWidth <= 900
    ) {
      mobileDetailOpen = true;
    }
  }

  function backToMobileList() {
    mobileDetailOpen = false;
  }

  async function fetchAnnouncementsPage() {
    loading = true;
    errorMessage = "";

    const fallbackUser = get(currentUser);

    try {
      const [profileRes, announcementsRes] = await Promise.allSettled([
        apiRequest("/api/me", { method: "GET" }),
        apiRequest("/api/announcements?limit=50", { method: "GET" }),
      ]);

      const pVal = profileRes.status === "fulfilled" ? profileRes.value : null;
      profile = pVal?.data ?? pVal?.user ?? pVal ?? fallbackUser ?? null;

      if (announcementsRes.status === "fulfilled") {
        const aVal = announcementsRes.value;
        const list = Array.isArray(aVal?.data)
          ? aVal.data
          : Array.isArray(aVal?.announcements)
            ? aVal.announcements
            : Array.isArray(aVal)
              ? aVal
              : [];
        announcements = list;
        if (list.length > 0 && selectedId === null) {
          selectedId = getItemId(list[0]);
        }
      } else {
        const reason = /** @type {any} */ (announcementsRes.reason);
        announcements = [];
        errorMessage =
          reason?.data?.pesan ||
          reason?.message ||
          "Gagal memuat daftar pengumuman dari server.";
      }
    } catch (/** @type {any} */ err) {
      announcements = [];
      errorMessage =
        err?.data?.pesan ||
        err?.message ||
        "Gagal memuat daftar pengumuman dari server.";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchAnnouncementsPage();
  });
</script>

<DashboardLayout
  role="tenant"
  activeKey="announcements"
  ownerName={profile?.name || profile?.full_name || ""}
>
  {#if loading}
    <div in:fade={{ duration: 180 }} class="ann-card">
      <p class="ann-muted">Memuat pengumuman...</p>
    </div>
  {:else if errorMessage}
    <div in:fly={{ y: 8, duration: 200 }} role="alert" class="ann-error-box">
      <div class="ann-error-row">
        <div>
          <p class="ann-error-title">Gagal memuat pengumuman</p>
          <p class="ann-error-desc">{errorMessage}</p>
        </div>
        <button
          type="button"
          onclick={fetchAnnouncementsPage}
          class="btn-brown"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  {:else if mobileDetailOpen && selectedAnnouncement}
    <!-- MOBILE DETAIL VIEW -->
    <div in:fly={{ x: 18, duration: 200 }} class="mobile-detail-wrap">
      <button type="button" onclick={backToMobileList} class="btn-back-list">
        &larr; Kembali ke Pengumuman
      </button>

      <article class="ann-card mobile-detail-card">
        <div class="mobile-detail-top">
          <span class="cat-badge {getItemCategory(selectedAnnouncement)}">
            {getCategoryLabel(getItemCategory(selectedAnnouncement))}
          </span>
          <span class="detail-date-right">
            {getDateLabel(selectedAnnouncement)}
          </span>
        </div>

        <h1 class="mobile-detail-title">
          {selectedAnnouncement.title || "-"}
        </h1>

        <p class="mobile-detail-author">
          Oleh: {getAuthorName(selectedAnnouncement)}
        </p>

        <hr class="detail-divider" />

        <div class="detail-body">
          {#each getBodyParagraphs(selectedAnnouncement) as paragraph, idx (idx)}
            <p>{paragraph}</p>
          {:else}
            <p class="ann-muted">Tidak ada rincian isi pengumuman.</p>
          {/each}
        </div>
      </article>
    </div>
  {:else}
    <div in:fade={{ duration: 200 }} class="ann-page-stack">
      <!-- Page Header -->
      <div class="ann-header">
        <h1 class="ann-title">Pengumuman</h1>
        <p class="ann-subtitle">Informasi resmi dari pengelola kos</p>
      </div>

      <!-- Mobile Search Input -->
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
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          class="mobile-search-input"
          bind:value={searchQuery}
          placeholder="Cari judul atau isi pengumuman..."
          aria-label="Cari judul atau isi pengumuman"
        />
      </div>

      <!-- Category Filter Pills -->
      <div
        class="filter-pills"
        role="tablist"
        aria-label="Filter kategori pengumuman"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === "all"}
          class="filter-pill {activeCategory === 'all' ? 'active' : ''}"
          onclick={() => (activeCategory = "all")}
        >
          Semua ({counts.all})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === "urgent"}
          class="filter-pill {activeCategory === 'urgent' ? 'active' : ''}"
          onclick={() => (activeCategory = "urgent")}
        >
          Urgent ({counts.urgent})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === "routine"}
          class="filter-pill {activeCategory === 'routine' ? 'active' : ''}"
          onclick={() => (activeCategory = "routine")}
        >
          Rutin ({counts.routine})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === "maintenance"}
          class="filter-pill {activeCategory === 'maintenance' ? 'active' : ''}"
          onclick={() => (activeCategory = "maintenance")}
        >
          Maintenance ({counts.maintenance})
        </button>
      </div>

      <!-- Desktop Split View (Daftar Pengumuman + Detail Pengumuman) -->
      <div class="desktop-split-grid">
        <section class="ann-card list-panel" aria-label="Daftar pengumuman">
          <h2 class="panel-heading">Daftar Pengumuman</h2>

          {#if filteredAnnouncements.length === 0}
            <p class="ann-empty">
              Belum ada pengumuman yang sesuai dengan filter.
            </p>
          {:else}
            <div class="desktop-items">
              {#each filteredAnnouncements as item, idx (getItemId(item) ?? idx)}
                {@const itemId = getItemId(item)}
                {@const isSelected =
                  selectedAnnouncement &&
                  String(getItemId(selectedAnnouncement)) === String(itemId)}
                {@const cat = getItemCategory(item)}
                <button
                  type="button"
                  class="desktop-item-row {isSelected ? 'selected' : ''}"
                  onclick={() => selectAnnouncement(item, false)}
                >
                  <div class="item-top-meta">
                    <span class="cat-badge {cat}">
                      {getCategoryLabel(cat)}
                    </span>
                    <span class="item-date-text">{getDateLabel(item)}</span>
                  </div>
                  <p class="item-title-text">{item.title || "-"}</p>
                  {#if getSummaryText(item)}
                    <p class="item-summary-text">{getSummaryText(item)}</p>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </section>

        <aside class="ann-card detail-panel" aria-label="Detail pengumuman">
          <h2 class="panel-heading">Detail Pengumuman</h2>

          {#if selectedAnnouncement}
            {@const detailCat = getItemCategory(selectedAnnouncement)}
            <div class="detail-badge-row">
              <span class="cat-badge {detailCat}">
                {getCategoryLabel(detailCat)}
              </span>
            </div>

            <h3 class="detail-title-text">
              {selectedAnnouncement.title || "-"}
            </h3>

            <p class="detail-meta-text">
              Dipublikasikan {getDateLabel(selectedAnnouncement)} &middot; {getAuthorName(
                selectedAnnouncement,
              )}
            </p>

            <hr class="detail-divider" />

            <div class="detail-body">
              {#each getBodyParagraphs(selectedAnnouncement) as paragraph, idx (idx)}
                <p>{paragraph}</p>
              {:else}
                <p class="ann-muted">Tidak ada rincian isi pengumuman.</p>
              {/each}
            </div>
          {:else}
            <p class="ann-muted">Pilih pengumuman untuk melihat detailnya.</p>
          {/if}
        </aside>
      </div>

      <!-- Mobile Card List -->
      <div class="mobile-cards-list">
        {#if filteredAnnouncements.length === 0}
          <div class="ann-card">
            <p class="ann-empty">
              Belum ada pengumuman yang sesuai dengan filter.
            </p>
          </div>
        {:else}
          {#each filteredAnnouncements as item, idx (getItemId(item) ?? idx)}
            {@const cat = getItemCategory(item)}
            <button
              type="button"
              class="mobile-ann-card-btn"
              onclick={() => selectAnnouncement(item, true)}
            >
              <div class="mobile-card-header">
                <span class="mobile-card-title">{item.title || "-"}</span>
                <span class="cat-badge {cat}">
                  {getCategoryLabel(cat)}
                </span>
              </div>

              {#if getSummaryText(item)}
                <p class="mobile-card-summary">{getSummaryText(item)}</p>
              {/if}

              <div class="mobile-card-meta">
                <div>
                  <span class="mobile-meta-label">Target</span>
                  <span class="mobile-meta-value">
                    {getTargetAudience(item)}
                  </span>
                </div>
                <div>
                  <span class="mobile-meta-label">Dipublikasikan</span>
                  <span class="mobile-meta-value">
                    {getDateLabel(item)}
                  </span>
                </div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</DashboardLayout>

<style>
  .ann-page-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ann-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ann-title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    color: #231f1e;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .ann-subtitle {
    margin: 0;
    font-size: 12.5px;
    color: #8e7e6e;
    line-height: 1.45;
  }

  .mobile-search-box {
    display: none;
    position: relative;
    align-items: center;
  }

  .mobile-search-icon {
    position: absolute;
    left: 12px;
    color: #9e8b7c;
    pointer-events: none;
  }

  .mobile-search-input {
    width: 100%;
    height: 40px;
    padding: 0 12px 0 36px;
    border: 1px solid #e6ddd2;
    border-radius: 10px;
    background-color: #ffffff;
    color: #231f1e;
    font-size: 12.5px;
    box-sizing: border-box;
  }

  .mobile-search-input:focus {
    outline: none;
    border-color: #684b36;
  }

  .filter-pills {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-pill {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #e6ddd2;
    border-radius: 999px;
    background-color: #ffffff;
    color: #5c4d42;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .filter-pill:hover {
    background-color: #f7f2ec;
  }

  .filter-pill.active {
    background-color: #5a3e28;
    border-color: #5a3e28;
    color: #ffffff;
    font-weight: 600;
  }

  .desktop-split-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }

  .ann-card {
    background-color: #ffffff;
    border: 1px solid #eae2d7;
    border-radius: 14px;
    padding: 20px;
    box-sizing: border-box;
  }

  .list-panel {
    padding: 18px 0 6px;
  }

  .panel-heading {
    margin: 0 0 12px;
    padding: 0 20px;
    font-size: 15px;
    font-weight: 700;
    color: #231f1e;
  }

  .detail-panel .panel-heading {
    padding: 0;
    margin-bottom: 14px;
  }

  .desktop-items {
    display: flex;
    flex-direction: column;
  }

  .desktop-item-row {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-bottom: 1px solid #f2ece4;
    padding: 14px 20px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: background-color 0.15s ease;
  }

  .desktop-item-row:last-child {
    border-bottom: none;
  }

  .desktop-item-row:hover {
    background-color: #fbf8f4;
  }

  .desktop-item-row.selected {
    background-color: #f4ece3;
  }

  .item-top-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
  }

  .item-date-text {
    font-size: 11px;
    color: #9e8b7c;
    white-space: nowrap;
  }

  .item-title-text {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #231f1e;
    line-height: 1.35;
  }

  .item-summary-text {
    margin: 0;
    font-size: 11.5px;
    color: #8e7e6e;
    line-height: 1.4;
  }

  .detail-badge-row {
    margin-bottom: 10px;
  }

  .detail-title-text {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
    color: #231f1e;
    line-height: 1.35;
  }

  .detail-meta-text {
    margin: 0;
    font-size: 11.5px;
    color: #9e8b7c;
  }

  .detail-divider {
    border: none;
    border-top: 1px solid #f0e8df;
    margin: 14px 0;
  }

  .detail-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 12.5px;
    line-height: 1.6;
    color: #4a3d33;
  }

  .detail-body p {
    margin: 0;
  }

  .cat-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px 9px;
    font-size: 10.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .cat-badge.urgent {
    background-color: #fde8e8;
    color: #c94a4a;
  }

  .cat-badge.routine {
    background-color: #f3ece4;
    color: #7c6858;
  }

  .cat-badge.maintenance {
    background-color: #fef3c7;
    color: #a16207;
  }

  .mobile-cards-list {
    display: none;
  }

  .mobile-detail-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .btn-back-list {
    align-self: flex-start;
    border: none;
    background: transparent;
    padding: 0;
    font-size: 12.5px;
    font-weight: 500;
    color: #8e7e6e;
    cursor: pointer;
  }

  .btn-back-list:hover {
    color: #231f1e;
  }

  .mobile-detail-card {
    padding: 18px;
  }

  .mobile-detail-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }

  .detail-date-right {
    font-size: 11.5px;
    color: #9e8b7c;
  }

  .mobile-detail-title {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 700;
    color: #231f1e;
    line-height: 1.3;
  }

  .mobile-detail-author {
    margin: 0;
    font-size: 11.5px;
    color: #9e8b7c;
  }

  .btn-brown {
    background-color: #5a3e28;
    color: #ffffff;
    border: 1px solid #5a3e28;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-brown:hover {
    background-color: #47301e;
  }

  .ann-muted,
  .ann-empty {
    margin: 0;
    font-size: 12.5px;
    color: #8e7e6e;
  }

  .ann-empty {
    text-align: center;
    padding: 18px 12px;
  }

  .ann-error-box {
    background-color: #fdf4f4;
    border: 1px solid #e8c4c4;
    border-radius: 14px;
    padding: 16px 18px;
    color: #9e2a2b;
  }

  .ann-error-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .ann-error-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 700;
  }

  .ann-error-desc {
    margin: 3px 0 0;
    font-size: 12px;
    color: #7e2223;
  }

  @media (max-width: 900px) {
    .mobile-search-box {
      display: flex;
    }

    .filter-pills {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .filter-pill {
      width: 100%;
      height: 36px;
      padding: 0 10px;
      justify-content: center;
      box-sizing: border-box;
    }

    .desktop-split-grid {
      display: none;
    }

    .mobile-cards-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mobile-ann-card-btn {
      display: block;
      width: 100%;
      text-align: left;
      background-color: #ffffff;
      border: 1px solid #eae2d7;
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      font-family: inherit;
      color: inherit;
      box-sizing: border-box;
      transition: background-color 0.15s ease;
    }

    .mobile-ann-card-btn:hover {
      background-color: #fcfaf7;
    }

    .mobile-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
    }

    .mobile-card-title {
      font-size: 14px;
      font-weight: 700;
      color: #231f1e;
      line-height: 1.35;
    }

    .mobile-card-summary {
      margin: 0 0 12px;
      font-size: 12px;
      color: #8e7e6e;
      line-height: 1.45;
    }

    .mobile-card-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .mobile-meta-label {
      display: block;
      font-size: 10.5px;
      color: #9e8b7c;
      margin-bottom: 2px;
    }

    .mobile-meta-value {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #231f1e;
      line-height: 1.3;
    }
  }
</style>
