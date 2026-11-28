<script>
  // @ts-check
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { fade, fly } from "svelte/transition";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { apiRequest } from "../../services/api.js";
  import { currentUser } from "../../stores/auth.js";

  const PENDING_TICKET_STORAGE_KEY = "hunify_tenant_open_ticket_id";
  const PENDING_TICKET_DATA_KEY = "hunify_tenant_open_ticket_data";

  /** @type {Record<string, any> | null} */
  let profile = $state(null);

  /** @type {Record<string, any> | null} */
  let activeContract = $state(null);

  /** @type {Record<string, any> | null} */
  let currentInvoice = $state(null);

  /** @type {string} */
  let fallbackDueDate = $state("");

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
   * @param {Record<string, any>} ticket
   */
  function openTicketDetail(ticket) {
    const ticketId = ticket?.id ?? ticket?.ticket_id ?? ticket?.report_id ?? "";
    if (typeof window !== "undefined") {
      try {
        if (ticketId !== "") {
          window.sessionStorage.setItem(
            PENDING_TICKET_STORAGE_KEY,
            String(ticketId),
          );
        }
        window.sessionStorage.setItem(
          PENDING_TICKET_DATA_KEY,
          JSON.stringify(ticket || {}),
        );
      } catch {
        // Abaikan jika sessionStorage tidak tersedia
      }
    }
    navigateHash("/tenant/damage-reports");
  }

  /**
   * @param {Record<string, any> | null | undefined} item
   */
  function isUnpaidInvoice(item) {
    if (!item || typeof item !== "object") return false;
    const raw = String(item?.status || item?.payment_status || "")
      .trim()
      .toLowerCase();
    if (!raw) return true;
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
   * @param {Record<string, any> | null | undefined} item
   */
  function extractDueDate(item) {
    if (!item || typeof item !== "object") return "";
    return String(
      item.next_due_date ||
        item.due_date ||
        item.jatuh_tempo ||
        item.billing_due_date ||
        "",
    ).trim();
  }

  /**
   * @param {string | null | undefined} rawStatus
   * @returns {'pending' | 'processing' | 'done'}
   */
  function normalizeTicketStatus(rawStatus) {
    const val = String(rawStatus || "")
      .trim()
      .toLowerCase();
    if (
      val === "completed" ||
      val === "done" ||
      val === "resolved" ||
      val === "closed" ||
      val === "selesai"
    ) {
      return "done";
    }
    if (
      val === "in_progress" ||
      val === "progress" ||
      val === "processing" ||
      val === "diproses"
    ) {
      return "processing";
    }
    return "pending";
  }

  /**
   * @param {Record<string, any>} ticket
   */
  function getTicketStatusText(ticket) {
    const normalized = normalizeTicketStatus(ticket?.status);
    if (normalized === "done") return "Selesai";
    if (normalized === "processing") return "Diproses";
    return "Menunggu";
  }

  /**
   * @param {Record<string, any>} ticket
   */
  function isActiveTicket(ticket) {
    const st = normalizeTicketStatus(ticket?.status);
    return st === "pending" || st === "processing";
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
    fallbackDueDate = "";

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
          currentInvoice =
            activeContract.open_invoices.find((/** @type {any} */ inv) =>
              isUnpaidInvoice(inv),
            ) || null;
        } else if (isUnpaidInvoice(activeContract.current_invoice)) {
          currentInvoice = activeContract.current_invoice;
        }
      }

      if (invoicesRes.status === "fulfilled") {
        /** @type {any} */
        const iVal = invoicesRes.value;
        const invList = Array.isArray(iVal?.data)
          ? iVal.data
          : Array.isArray(iVal?.invoices)
            ? iVal.invoices
            : Array.isArray(iVal)
              ? iVal
              : [];

        if (!currentInvoice) {
          const candidateInvoice =
            iVal?.active_invoice ||
            iVal?.current_invoice ||
            invList.find((/** @type {any} */ inv) => isUnpaidInvoice(inv)) ||
            null;

          currentInvoice = isUnpaidInvoice(candidateInvoice)
            ? candidateInvoice
            : null;
        }

        const latestInvoiceWithDue = invList.find((/** @type {any} */ inv) =>
          Boolean(extractDueDate(inv)),
        );

        fallbackDueDate =
          extractDueDate(currentInvoice) ||
          extractDueDate(activeContract) ||
          extractDueDate(activeContract?.current_invoice) ||
          extractDueDate(iVal?.active_invoice) ||
          extractDueDate(iVal?.current_invoice) ||
          extractDueDate(latestInvoiceWithDue) ||
          extractDueDate(profile) ||
          "";
      } else {
        fallbackDueDate =
          extractDueDate(currentInvoice) ||
          extractDueDate(activeContract) ||
          extractDueDate(activeContract?.current_invoice) ||
          extractDueDate(profile) ||
          "";
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
    const normalized = normalizeTicketStatus(status);
    if (normalized === "processing") {
      return "ticket-status-processing";
    }
    if (normalized === "done") {
      return "ticket-status-done";
    }
    return "ticket-status-pending";
  }

  let hasOpenInvoice = $derived(isUnpaidInvoice(currentInvoice));
  let upcomingDueDate = $derived(
    extractDueDate(currentInvoice) || fallbackDueDate || "",
  );

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
                {hasOpenInvoice
                  ? currentInvoice?.period_label || "Tagihan Sewa"
                  : "Semua tagihan sudah dibayar"}
              </p>
            </div>

            {#if upcomingDueDate}
              <span class="badge-warning">
                {getDueBadgeText(upcomingDueDate)}
              </span>
            {/if}
          </div>

          <div class="due-body">
            {#if upcomingDueDate}
              <p class="due-amount">
                Jatuh tempo: {formatTanggal(upcomingDueDate)}
              </p>
            {:else}
              <p class="tenant-muted">
                Tidak ada tagihan aktif saat ini. Tombol bayar sewa akan muncul
                kembali jika ada invoice baru.
              </p>
            {/if}
          </div>

          <div class="due-actions">
            {#if hasOpenInvoice}
              <button
                type="button"
                onclick={() => navigateHash("/tenant/bills-payments")}
                class="btn-primary-brown"
              >
                Bayar Sewa
              </button>
            {/if}
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
          <div class="table-scroll desktop-ticket-table-wrap">
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
                        {getTicketStatusText(ticket)}
                      </span>
                    </td>
                    <td class="td-right">
                      <button
                        type="button"
                        onclick={() => openTicketDetail(ticket)}
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

          <div class="mobile-ticket-list">
            {#each activeTickets as ticket (ticket.id ?? ticket.ticket_number ?? ticket.code)}
              <button
                type="button"
                onclick={() => openTicketDetail(ticket)}
                class="mobile-ticket-card-btn"
              >
                <div class="mobile-ticket-top">
                  <div>
                    <p class="mobile-ticket-code">
                      {ticket.ticket_number ||
                        (ticket.id ? `#${ticket.id}` : ticket.code || "-")}
                    </p>
                    <p class="mobile-ticket-cat">
                      {ticket.category || ticket.title || "-"}
                    </p>
                  </div>
                  <span class="badge-pill {getTicketVariant(ticket.status)}">
                    {getTicketStatusText(ticket)}
                  </span>
                </div>
                <div class="mobile-ticket-bottom">
                  <span class="mobile-ticket-date">
                    {ticket.reported_date_label ||
                      formatTanggal(ticket.created_at || ticket.reported_at)}
                  </span>
                  <span class="mobile-ticket-open-label">Buka →</span>
                </div>
              </button>
            {/each}
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

  .mobile-action-only,
  .mobile-ticket-list {
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
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .badge-warning {
    border-radius: 6px;
    background-color: #fff4cc;
    color: #8c6d1f;
    font-size: 10.5px;
    font-weight: 500;
    padding: 2px 9px;
  }

  .badge-urgent {
    background-color: #fdecec;
    color: #c94a4a;
    font-size: 10.5px;
    font-weight: 500;
    padding: 2px 9px;
  }

  .badge-routine {
    background-color: #f3ece4;
    color: #8a7968;
    font-size: 10.5px;
    font-weight: 500;
    padding: 2px 9px;
  }

  .ticket-status-pending {
    background-color: #fef3c7;
    color: #b45309;
  }

  .ticket-status-processing {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .ticket-status-done {
    background-color: #dcfce7;
    color: #15803d;
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
    .desktop-ticket-table-wrap {
      display: none;
    }

    .mobile-ticket-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-ticket-card-btn {
      display: block;
      width: 100%;
      text-align: left;
      padding: 12px 14px;
      border: 1px solid #ece3d9;
      border-radius: 10px;
      background-color: #fcfaf7;
      font-family: inherit;
      cursor: pointer;
      box-sizing: border-box;
    }

    .mobile-ticket-card-btn:hover {
      background-color: #f6f0e8;
    }

    .mobile-ticket-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }

    .mobile-ticket-code {
      margin: 0 0 2px;
      font-size: 12px;
      font-weight: 700;
      color: #231f1e;
    }

    .mobile-ticket-cat {
      margin: 0;
      font-size: 12px;
      font-weight: 500;
      color: #3b2e25;
    }

    .mobile-ticket-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .mobile-ticket-date {
      font-size: 11px;
      color: #8e7e6e;
    }

    .mobile-ticket-open-label {
      font-size: 11.5px;
      font-weight: 600;
      color: #5a3e28;
    }

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
