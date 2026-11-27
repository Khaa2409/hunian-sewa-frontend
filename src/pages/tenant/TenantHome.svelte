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

  /** @type {Record<string, any> | null} */
  let activeContract = $state(null);

  /** @type {Record<string, any> | null} */
  let currentInvoice = $state(null);

  /** @type {Array<Record<string, any>>} */
  let announcements = $state([]);

  /** @type {Array<Record<string, any>>} */
  let activeTickets = $state([]);

  let loading = $state(true);
  let errorMessage = $state("");

  /**
   * Mengambil string tanggal lokal hari ini (misal: "Jumat, 27 November 2026")
   */
  function getTodayFormatted() {
    return new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  }

  /**
   * @param {string} path
   * @param {Record<string, string | number | boolean | null | undefined>} [paramsObj]
   */
  function buildQueryPath(path, paramsObj = {}) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const query = new URLSearchParams();

    Object.entries(paramsObj).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") {
        query.append(key, String(value));
      }
    });

    const qs = query.toString();
    return `${cleanPath}${qs ? `?${qs}` : ""}`;
  }

  /**
   * @param {string} hashPath
   */
  function navigateHash(hashPath) {
    if (typeof window === "undefined") return;
    const normalized = hashPath.startsWith("/") ? hashPath : `/${hashPath}`;
    window.location.hash = `#${normalized}`;
  }

  /**
   * @param {Record<string, any>} item
   */
  function isUnpaidInvoice(item) {
    const raw = String(item?.status || item?.payment_status || "")
      .trim()
      .toLowerCase();
    return ![
      "paid",
      "lunas",
      "settlement",
      "capture",
      "completed",
      "cancelled",
      "canceled",
      "dibatalkan",
    ].includes(raw);
  }

  /**
   * @param {Record<string, any>} ticket
   */
  function isActiveTicket(ticket) {
    const raw = String(ticket?.status || "")
      .trim()
      .toLowerCase();
    return (
      raw === "pending" ||
      raw === "in_progress" ||
      raw === "diproses" ||
      raw === "processing"
    );
  }

  /**
   * @param {string | null | undefined} dueDateStr
   */
  function getDueBadgeText(dueDateStr) {
    if (!dueDateStr) return "";
    const parsed = new Date(dueDateStr);
    if (Number.isNaN(parsed.getTime())) {
      return `Jatuh tempo ${dueDateStr}`;
    }
    const diffDays = Math.ceil(
      (parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays > 0) {
      return `Jatuh tempo ${diffDays} hari lagi`;
    }
    if (diffDays === 0) {
      return "Jatuh tempo hari ini";
    }
    return `Terlambat ${Math.abs(diffDays)} hari`;
  }

  /**
   * @param {string | null | undefined} rawLabel
   */
  function formatBadgeLabel(rawLabel) {
    const clean = String(rawLabel || "Rutin").trim();
    if (!clean) return "Rutin";
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  async function fetchDashboardData() {
    loading = true;
    errorMessage = "";
    activeContract = null;
    currentInvoice = null;

    const fallbackUser = get(currentUser);

    try {
      const [
        profileRes,
        contractsRes,
        invoicesRes,
        announcementRes,
        ticketRes,
      ] = await Promise.allSettled([
        apiRequest("/api/me", { method: "GET" }),
        apiRequest("/api/contracts/me", { method: "GET" }),
        apiRequest(buildQueryPath("/api/invoices", { limit: 5 }), {
          method: "GET",
        }),
        apiRequest(buildQueryPath("/api/announcements", { limit: 3 }), {
          method: "GET",
        }),
        apiRequest(buildQueryPath("/api/tickets", { limit: 3 }), {
          method: "GET",
        }),
      ]);

      // 1. Profil Penyewa (Dari /api/me)
      const pVal = profileRes.status === "fulfilled" ? profileRes.value : null;
      profile = pVal?.data ?? pVal?.user ?? pVal ?? fallbackUser ?? null;

      // 2. Kontrak Sewa Milik Tenant (GET /api/contracts/me → filter status === "active")
      const cVal =
        contractsRes.status === "fulfilled" ? contractsRes.value : null;
      const contractList = Array.isArray(cVal?.data)
        ? cVal.data
        : Array.isArray(cVal?.contracts)
          ? cVal.contracts
          : Array.isArray(cVal)
            ? cVal
            : [];

      activeContract =
        contractList.find(
          (/** @type {any} */ c) =>
            String(c?.status || "")
              .trim()
              .toLowerCase() === "active",
        ) || null;

      if (activeContract) {
        if (
          Array.isArray(activeContract.open_invoices) &&
          activeContract.open_invoices.length > 0
        ) {
          currentInvoice = activeContract.open_invoices[0];
        } else {
          currentInvoice = activeContract.current_invoice || null;
        }
      }

      if (!currentInvoice && invoicesRes.status === "fulfilled") {
        /** @type {any} */
        const iVal = invoicesRes.value;
        const invList = Array.isArray(iVal?.data)
          ? iVal.data
          : Array.isArray(iVal?.invoices)
            ? iVal.invoices
            : Array.isArray(iVal)
              ? iVal
              : [];

        currentInvoice =
          iVal?.active_invoice ||
          iVal?.current_invoice ||
          invList.find((/** @type {any} */ inv) => isUnpaidInvoice(inv)) ||
          invList[0] ||
          null;
      }

      // 3. Pengumuman Terkini (Dari /api/announcements)
      const aVal =
        announcementRes.status === "fulfilled" ? announcementRes.value : null;
      announcements = Array.isArray(aVal?.data)
        ? aVal.data
        : Array.isArray(aVal)
          ? aVal
          : [];

      // 4. Tiket Laporan Aktif (Dari /api/tickets?limit=3 → status pending / in_progress)
      const tVal = ticketRes.status === "fulfilled" ? ticketRes.value : null;
      const rawTickets = Array.isArray(tVal?.data)
        ? tVal.data
        : Array.isArray(tVal?.tickets)
          ? tVal.tickets
          : Array.isArray(tVal)
            ? tVal
            : [];

      activeTickets = rawTickets
        .filter((/** @type {any} */ t) => isActiveTicket(t))
        .slice(0, 3);
    } catch (/** @type {any} */ err) {
      profile = fallbackUser ?? null;
      announcements = [];
      activeTickets = [];
      errorMessage =
        err?.data?.pesan ||
        err?.message ||
        "Terjadi kesalahan saat memuat data dashboard.";
    } finally {
      loading = false;
    }
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
   * @param {string | null | undefined} status
   */
  function getPriorityVariant(status) {
    const s = String(status || "").toLowerCase();
    if (s === "urgent" || s === "mendesak") {
      return "badge-urgent";
    }
    return "badge-routine";
  }

  /**
   * @param {string | null | undefined} status
   */
  function getTicketVariant(status) {
    const s = String(status || "").toLowerCase();
    if (s === "diproses" || s === "in_progress" || s === "processing") {
      return "badge-processing";
    }
    if (
      s === "selesai" ||
      s === "resolved" ||
      s === "completed" ||
      s === "done"
    ) {
      return "badge-done";
    }
    return "badge-routine";
  }

  onMount(() => {
    fetchDashboardData();
  });
</script>

<DashboardLayout
  role="tenant"
  activeKey="dashboard"
  ownerName={profile?.name || profile?.full_name || ""}
>
  {#if loading}
    <div in:fade={{ duration: 180 }} class="tenant-card dashboard-frame">
      <p class="tenant-muted">Memuat data dashboard...</p>
    </div>
  {:else if errorMessage}
    <div
      in:fly={{ y: 8, duration: 200 }}
      role="alert"
      class="tenant-error-box dashboard-frame"
    >
      <div class="tenant-error-row">
        <div>
          <p class="tenant-error-title">Gagal memuat data dari server</p>
          <p class="tenant-error-desc">{errorMessage}</p>
        </div>
        <button
          type="button"
          onclick={fetchDashboardData}
          class="btn-primary-brown"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  {:else}
    {@const dueDateValue =
      currentInvoice?.due_date || activeContract?.next_due_date || ""}
    <div in:fade={{ duration: 200 }} class="tenant-stack dashboard-frame">
      <!-- Greeting Header -->
      <div in:fly={{ y: 8, duration: 220 }}>
        <h1 class="tenant-greeting">
          {profile?.name || profile?.full_name
            ? `Halo, ${profile.name || profile.full_name}`
            : "Halo"}
        </h1>
        <p class="tenant-subtitle">
          {[
            activeContract?.room_number ||
            activeContract?.room?.room_number ||
            profile?.room_number
              ? `Kamar ${activeContract?.room_number || activeContract?.room?.room_number || profile?.room_number}`
              : "",
            getTodayFormatted(),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <!-- Baris Atas: Pengingat Jatuh Tempo & Aksi Cepat -->
      <div in:fly={{ y: 10, duration: 250 }} class="top-grid">
        <!-- Pengingat Jatuh Tempo -->
        <div class="tenant-card due-card">
          <div class="due-header">
            <div>
              <h2 class="section-title">Pengingat Jatuh Tempo</h2>
              <p class="section-subtitle">
                {currentInvoice?.period_label || "Tagihan Sewa"}
              </p>
            </div>

            {#if dueDateValue}
              <span class="badge-warning">
                {getDueBadgeText(dueDateValue)}
              </span>
            {/if}
          </div>

          <div class="due-body">
            {#if dueDateValue}
              <p class="due-amount">
                Jatuh tempo: {formatTanggal(dueDateValue)}
              </p>
            {:else}
              <p class="tenant-muted">Belum ada data jatuh tempo.</p>
            {/if}
          </div>

          <div class="due-actions">
            <button
              type="button"
              onclick={() => navigateHash("/tenant/bills-payments")}
              class="btn-primary-brown"
            >
              Bayar Sewa
            </button>
            <button
              type="button"
              onclick={() => navigateHash("/tenant/bills-payments")}
              class="btn-link-subtle"
            >
              Lihat rincian biaya
            </button>
          </div>
        </div>

        <!-- Aksi Cepat -->
        <div class="tenant-card actions-card">
          <h2 class="section-title">Aksi Cepat</h2>

          <div class="actions-list">
            <button
              type="button"
              onclick={() => navigateHash("/tenant/damage-reports")}
              class="btn-primary-brown btn-full"
            >
              Buat Laporan Kerusakan Baru
            </button>

            <button
              type="button"
              onclick={() => navigateHash("/tenant/bills-payments")}
              class="btn-outline-light btn-full desktop-action-only"
            >
              Bayar Sewa
            </button>

            <button
              type="button"
              onclick={() => navigateHash("/tenant/announcements")}
              class="btn-outline-light btn-full mobile-action-only"
            >
              Lihat Pengumuman
            </button>
          </div>
        </div>
      </div>

      <!-- Pengumuman Terkini -->
      <div in:fly={{ y: 12, duration: 280 }} class="tenant-card">
        <div class="section-head">
          <h2 class="section-title">Pengumuman Terkini</h2>
          <a href="#/tenant/announcements" class="link-see-all">Lihat semua →</a
          >
        </div>

        {#if announcements.length === 0}
          <p class="tenant-empty">Belum ada pengumuman terkini.</p>
        {:else}
          <div class="table-scroll">
            <table class="data-table announcement-table">
              <tbody>
                {#each announcements as item (item.id ?? item.title)}
                  <tr class="announcement-row">
                    <td class="col-badge">
                      <span
                        class="badge-pill {getPriorityVariant(
                          item.priority || item.tag || item.category,
                        )}"
                      >
                        {formatBadgeLabel(
                          item.priority || item.tag || item.category,
                        )}
                      </span>
                    </td>
                    <td class="col-main">
                      <p class="row-title">{item.title || "-"}</p>
                      {#if item.subtitle || item.summary}
                        <p class="row-sub">{item.subtitle || item.summary}</p>
                      {/if}
                    </td>
                    <td class="col-date">
                      {item.date_label ||
                        formatTanggal(item.published_at || item.created_at)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- Tiket Laporan Aktif -->
      <div in:fly={{ y: 14, duration: 310 }} class="tenant-card">
        <div class="section-head">
          <h2 class="section-title">Tiket Laporan Aktif</h2>
          <a href="#/tenant/damage-reports" class="link-see-all"
            >Lihat semua →</a
          >
        </div>

        {#if activeTickets.length === 0}
          <p class="tenant-empty">Belum ada tiket laporan aktif.</p>
        {:else}
          <div class="table-scroll">
            <table class="data-table ticket-table">
              <thead>
                <tr>
                  <th>ID Tiket</th>
                  <th>Kategori</th>
                  <th>Tanggal Lapor</th>
                  <th>Status</th>
                  <th class="th-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {#each activeTickets as ticket (ticket.id ?? ticket.ticket_number ?? ticket.code)}
                  <tr>
                    <td class="td-code">
                      {ticket.ticket_number ||
                        (ticket.id ? `#${ticket.id}` : ticket.code || "-")}
                    </td>
                    <td>{ticket.category || ticket.title || "-"}</td>
                    <td class="td-muted">
                      {ticket.reported_date_label ||
                        formatTanggal(ticket.created_at || ticket.reported_at)}
                    </td>
                    <td>
                      <span
                        class="badge-pill {getTicketVariant(ticket.status)}"
                      >
                        {formatBadgeLabel(ticket.status_label || ticket.status)}
                      </span>
                    </td>
                    <td class="td-right">
                      <button
                        type="button"
                        onclick={() =>
                          navigateHash(
                            `/tenant/damage-reports/${encodeURIComponent(ticket.id ?? ticket.ticket_number ?? "")}`,
                          )}
                        class="btn-outline-sm"
                      >
                        Buka
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</DashboardLayout>

<style>
  .dashboard-frame {
    width: 100%;
    box-sizing: border-box;
  }

  .tenant-stack {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .tenant-greeting {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #231f1e;
    line-height: 1.2;
  }

  .tenant-subtitle {
    margin: 5px 0 0;
    font-size: 12.5px;
    color: #8e7e6e;
  }

  .top-grid {
    display: grid;
    grid-template-columns: minmax(0, 2.25fr) minmax(230px, 0.9fr);
    gap: 18px;
    align-items: stretch;
  }

  .tenant-card {
    background-color: #ffffff;
    border: 1px solid #eae2d7;
    border-radius: 14px;
    padding: 18px 20px;
    box-sizing: border-box;
  }

  .due-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #231f1e;
  }

  .section-subtitle {
    margin: 3px 0 0;
    font-size: 11.5px;
    color: #8e7e6e;
  }

  .due-body {
    margin-top: 14px;
  }

  .due-amount {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #231f1e;
    line-height: 1.25;
  }

  .due-actions {
    margin-top: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .actions-list {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .btn-primary-brown {
    background-color: #5a3e28;
    color: #ffffff;
    border: 1px solid #5a3e28;
    border-radius: 8px;
    padding: 8px 15px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.16s ease;
  }

  .btn-primary-brown:hover {
    background-color: #47301e;
  }

  .btn-outline-light {
    background-color: #ffffff;
    color: #3b2e25;
    border: 1px solid #e5ddd2;
    border-radius: 8px;
    padding: 8px 15px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.16s ease;
  }

  .btn-outline-light:hover {
    background-color: #faf7f2;
  }

  .btn-link-subtle {
    background: transparent;
    border: none;
    color: #6e5d4f;
    font-size: 12px;
    font-weight: 500;
    padding: 4px 2px;
    cursor: pointer;
    text-decoration: none;
  }

  .btn-link-subtle:hover {
    text-decoration: underline;
    color: #231f1e;
  }

  .btn-full {
    width: 100%;
    box-sizing: border-box;
  }

  .mobile-action-only {
    display: none;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .link-see-all {
    font-size: 11.5px;
    font-weight: 500;
    color: #6e5d4f;
    text-decoration: none;
    white-space: nowrap;
  }

  .link-see-all:hover {
    color: #231f1e;
  }

  .table-scroll {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .announcement-table {
    width: 100%;
  }

  .announcement-table td {
    padding: 11px 8px;
    border-bottom: 1px solid #f2ece4;
    vertical-align: middle;
  }

  .announcement-table tr:last-child td {
    border-bottom: none;
  }

  .col-badge {
    width: 92px;
  }

  .col-date {
    text-align: right;
    white-space: nowrap;
    font-size: 11.5px;
    color: #8e7e6e;
  }

  .row-title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 500;
    color: #231f1e;
  }

  .row-sub {
    margin: 2px 0 0;
    font-size: 11px;
    color: #8e7e6e;
  }

  .ticket-table {
    min-width: 580px;
    font-size: 12px;
  }

  .ticket-table th {
    padding: 8px 12px 8px 0;
    font-size: 11px;
    font-weight: 500;
    color: #8e7e6e;
    border-bottom: 1px solid #efe9e0;
  }

  .ticket-table td {
    padding: 10px 12px 10px 0;
    border-bottom: 1px solid #f2ece4;
    color: #3b2e25;
    white-space: nowrap;
  }

  .ticket-table tr:last-child td {
    border-bottom: none;
  }

  .th-right,
  .td-right {
    text-align: right;
    padding-right: 0 !important;
  }

  .td-code {
    font-weight: 600;
    color: #231f1e;
  }

  .td-muted {
    color: #7a6a5b;
  }

  .btn-outline-sm {
    background-color: #ffffff;
    color: #3b2e25;
    border: 1px solid #e5ddd2;
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-outline-sm:hover {
    background-color: #faf7f2;
  }

  .badge-pill,
  .badge-warning {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px 9px;
    font-size: 10.5px;
    font-weight: 500;
    white-space: nowrap;
  }

  .badge-warning {
    border-radius: 6px;
    background-color: #fff4cc;
    color: #8c6d1f;
  }

  .badge-urgent {
    background-color: #fdecec;
    color: #c94a4a;
  }

  .badge-routine {
    background-color: #f3ece4;
    color: #8a7968;
  }

  .badge-processing {
    background-color: #fff5d6;
    color: #9a7418;
  }

  .badge-done {
    background-color: #e6f6ec;
    color: #237a4b;
  }

  .tenant-muted,
  .tenant-empty {
    margin: 0;
    font-size: 12.5px;
    color: #8e7e6e;
  }

  .tenant-empty {
    text-align: center;
    padding: 14px 0;
  }

  .tenant-error-box {
    background-color: #fdf4f4;
    border: 1px solid #e8c4c4;
    border-radius: 14px;
    padding: 16px 18px;
    color: #9e2a2b;
  }

  .tenant-error-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }

  .tenant-error-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
  }

  .tenant-error-desc {
    margin: 4px 0 0;
    font-size: 12px;
    color: #7e2223;
  }

  @media (max-width: 900px) {
    .top-grid {
      grid-template-columns: 1fr;
    }

    .desktop-action-only {
      display: none;
    }

    .mobile-action-only {
      display: block;
    }
  }

  @media (max-width: 768px) {
    .tenant-greeting {
      font-size: 24px;
    }

    .due-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .btn-link-subtle {
      border: 1px solid #e5ddd2;
      border-radius: 8px;
      padding: 9px 16px;
      text-align: center;
      background-color: #ffffff;
    }

    .announcement-table .table-scroll,
    .announcement-table tbody {
      display: block;
      width: 100%;
    }

    .announcement-row {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      padding: 11px 4px;
      border-bottom: 1px solid #f2ece4;
    }

    .announcement-row:last-child {
      border-bottom: none;
    }

    .announcement-row td {
      padding: 0;
      border-bottom: none;
      width: auto;
    }

    .announcement-row .col-date {
      text-align: left;
      font-size: 11px;
    }
  }
</style>
