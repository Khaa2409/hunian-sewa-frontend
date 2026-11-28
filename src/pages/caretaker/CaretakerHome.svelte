<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  const CARETAKER_OPEN_TICKET_KEY = "hunify_open_caretaker_ticket_id";

  const MONTHS_ID = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  /** @type {'all' | 'pending' | 'in_progress' | 'resolved'} */
  let ticketStatusFilter = $state("all");

  let summaryLoading = $state(true);
  let summaryError = $state("");
  /** @type {any} */
  let summaryData = $state(null);
  let activeContractsTotal = $state(0);

  let ticketsLoading = $state(true);
  let ticketsError = $state("");
  /** @type {any[]} */
  let ticketsList = $state([]);

  let displayCaretakerName = $derived($currentUser?.name || "Pak Andi");
  let displayCaretakerRole = $derived.by(() => {
    const r = String($currentUser?.role || "caretaker").toLowerCase();
    if (r === "caretaker") return "Pengelola";
    return $currentUser?.role || "Pengelola";
  });

  let todayFormattedId = $derived.by(() => {
    const now = new Date();
    return `${now.getDate()} ${MONTHS_ID[now.getMonth()]} ${now.getFullYear()}`;
  });

  let occupancyTotal = $derived(Number(summaryData?.occupancy?.total ?? 0));
  let occupancyOccupied = $derived(
    Number(summaryData?.occupancy?.occupied ?? 0),
  );
  let occupancyAvailable = $derived(
    Number(summaryData?.occupancy?.available ?? 0),
  );
  let occupancyMaintenance = $derived(
    Number(summaryData?.occupancy?.maintenance ?? 0),
  );

  let activeTicketCount = $derived.by(() => {
    const fromSummary = Number(summaryData?.active_tickets?.count);
    if (Number.isFinite(fromSummary) && summaryData?.active_tickets) {
      return fromSummary;
    }
    return formattedTickets.filter((t) => t.rawStatus !== "resolved").length;
  });

  let activeContractsCount = $derived(Number(activeContractsTotal ?? 0));
  let pendingContractsCount = $derived(
    Number(summaryData?.pending_contracts ?? 0),
  );

  /**
   * @param {Event | null} event
   * @param {string} hashPath
   */
  function goToHash(event, hashPath) {
    if (event) event.preventDefault();
    if (typeof window !== "undefined") {
      window.location.hash = hashPath;
    }
  }

  /**
   * @param {MouseEvent | null} event
   * @param {{ rawId?: string | number, id?: string }} ticket
   */
  function openTicketDetail(event, ticket) {
    if (event) event.preventDefault();
    const targetId = ticket?.rawId ?? ticket?.id ?? "";
    if (typeof window !== "undefined" && targetId !== "") {
      try {
        window.sessionStorage.setItem(
          CARETAKER_OPEN_TICKET_KEY,
          String(targetId),
        );
      } catch {
        // Abaikan jika sessionStorage tidak tersedia
      }
      window.location.hash = "#/caretaker/maintenance";
    }
  }

  /**
   * @param {string | number | Date | null | undefined} isoOrDateString
   */
  function formatDate(isoOrDateString) {
    if (!isoOrDateString) return "–";
    const date = new Date(isoOrDateString);
    if (Number.isNaN(date.getTime())) return "–";
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  /**
   * @param {string | null | undefined} status
   */
  function getTicketStatusInfo(status) {
    switch (String(status || "").toLowerCase()) {
      case "pending":
        return { label: "Menunggu Konfirmasi", type: "pending" };
      case "in_progress":
        return { label: "Diproses", type: "progress" };
      case "resolved":
      case "completed":
      case "done":
        return { label: "Selesai", type: "done" };
      default:
        return { label: status || "Menunggu Konfirmasi", type: "pending" };
    }
  }

  let formattedTickets = $derived(
    ticketsList.map((/** @type {any} */ ticket, /** @type {number} */ idx) => {
      const statusInfo = getTicketStatusInfo(ticket.status);
      return {
        id:
          ticket.ticket_number ||
          `T-${String(ticket.id ?? idx + 1).padStart(4, "0")}`,
        rawId: ticket.id,
        roomNumber: ticket.room_number || "-",
        category: ticket.category || "Lainnya",
        reportedAt: formatDate(ticket.created_at),
        status: statusInfo.label,
        statusType: statusInfo.type,
        rawStatus: String(ticket.status || "pending").toLowerCase(),
      };
    }),
  );

  async function loadCaretakerSummary() {
    summaryLoading = true;
    summaryError = "";

    try {
      const [summaryRes, contractsRes] = await Promise.all([
        apiRequest("/api/dashboard/summary"),
        apiRequest("/api/contracts?status=active&limit=1&page=1"),
      ]);

      summaryData =
        summaryRes?.data && typeof summaryRes.data === "object"
          ? summaryRes.data
          : summaryRes || null;

      activeContractsTotal = Number(contractsRes?.meta?.total ?? 0);
    } catch (/** @type {any} */ error) {
      summaryData = null;
      activeContractsTotal = 0;
      summaryError =
        error?.data?.pesan ||
        error?.message ||
        "Gagal memuat ringkasan operasional.";
    } finally {
      summaryLoading = false;
    }
  }

  /**
   * @param {string} filterVal
   */
  async function loadTickets(filterVal = ticketStatusFilter) {
    ticketsLoading = true;
    ticketsError = "";

    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "10");

      if (
        filterVal === "pending" ||
        filterVal === "in_progress" ||
        filterVal === "resolved"
      ) {
        params.set("status", filterVal);
      }

      /** @type {any} */
      const response = await apiRequest(`/api/tickets?${params.toString()}`);
      ticketsList = Array.isArray(response?.data) ? response.data : [];
    } catch (/** @type {any} */ error) {
      ticketsList = [];
      ticketsError =
        error?.data?.pesan ||
        error?.message ||
        "Gagal memuat antrean tiket komplain.";
    } finally {
      ticketsLoading = false;
    }
  }

  function handleReloadAll() {
    loadCaretakerSummary();
    loadTickets(ticketStatusFilter);
  }

  /**
   * @param {{ href?: string }} item
   */
  function handleNavigate(item) {
    if (!item?.href || typeof window === "undefined") return;
    window.location.hash = `#${item.href}`;
  }

  $effect(() => {
    const currentFilter = ticketStatusFilter;
    loadTickets(currentFilter);
  });

  onMount(() => {
    loadCaretakerSummary();
  });
</script>

<DashboardLayout
  activeKey="dashboard"
  role="caretaker"
  ownerName={displayCaretakerName}
  ownerRole={displayCaretakerRole}
  onNavigate={handleNavigate}
>
  <div
    class="caretaker-home-page"
    in:fly={{ y: 16, duration: 250, easing: cubicOut }}
  >
    <!-- HEADER -->
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">
        Ringkasan operasional hunian &middot; {todayFormattedId}
      </p>
    </div>

    {#if summaryError}
      <div
        class="summary-error-banner"
        role="alert"
        in:fade={{ duration: 160 }}
      >
        <span>{summaryError}</span>
        <button type="button" class="retry-btn" onclick={handleReloadAll}
          >Coba Lagi</button
        >
      </div>
    {/if}

    <!-- 3 KARTU RINGKASAN OPERASIONAL -->
    <section class="kpi-grid" aria-label="Ringkasan utama">
      <article class="kpi-card">
        <div class="kpi-label">Okupansi Kamar</div>
        <div class="kpi-value">
          {summaryLoading ? "..." : `${occupancyOccupied} / ${occupancyTotal}`}
        </div>
        <div class="kpi-subtext">
          {summaryLoading
            ? "Memuat data kamar..."
            : `${occupancyOccupied} terisi · ${occupancyAvailable} kosong · ${occupancyMaintenance} maintenance`}
        </div>
        <a
          href="#/caretaker/rooms"
          class="kpi-link"
          onclick={(e) => goToHash(e, "#/caretaker/rooms")}
        >
          Lihat Kamar &amp; Penghuni →
        </a>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">Tiket Kerusakan Aktif</div>
        <div class="kpi-value">
          {summaryLoading ? "..." : activeTicketCount}
        </div>
        <div class="kpi-subtext">Menunggu Konfirmasi / Diproses</div>
        <a
          href="#/caretaker/maintenance"
          class="kpi-link"
          onclick={(e) => goToHash(e, "#/caretaker/maintenance")}
        >
          Lihat antrean tiket →
        </a>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">Kontrak Aktif</div>
        <div class="kpi-value">
          {summaryLoading ? "..." : activeContractsCount}
        </div>
        <div class="kpi-subtext">
          {summaryLoading
            ? "Memuat data kontrak..."
            : `${activeContractsCount} kontrak berjalan aktif · ${pendingContractsCount} menunggu`}
        </div>
        <a
          href="#/caretaker/contracts"
          class="kpi-link"
          onclick={(e) => goToHash(e, "#/caretaker/contracts")}
        >
          Lihat kontrak aktif →
        </a>
      </article>
    </section>

    <!-- ANTREAN TIKET KOMPLAIN (DESKTOP) -->
    <section
      class="panel-card desktop-only"
      aria-label="Antrean tiket komplain"
    >
      <div class="panel-header">
        <h2 class="panel-title">Antrean Tiket Komplain</h2>
        <div class="panel-header-right">
          <select
            class="filter-select"
            bind:value={ticketStatusFilter}
            aria-label="Filter status tiket komplain"
          >
            <option value="all">Semua</option>
            <option value="pending">Menunggu</option>
            <option value="in_progress">Diproses</option>
            <option value="resolved">Selesai</option>
          </select>
        </div>
      </div>

      <div class="table-wrapper">
        {#if ticketsLoading}
          <div class="table-state-message" in:fade={{ duration: 160 }}>
            Memuat antrean tiket...
          </div>
        {:else if ticketsError}
          <div class="table-state-message" in:fade={{ duration: 160 }}>
            {ticketsError}
          </div>
        {:else if formattedTickets.length === 0}
          <div class="table-state-message" in:fade={{ duration: 160 }}>
            Tidak ada tiket komplain.
          </div>
        {:else}
          <table class="data-table" in:fade={{ duration: 160 }}>
            <thead>
              <tr>
                <th>ID Tiket</th>
                <th>Nomor Kamar</th>
                <th>Kategori</th>
                <th>Tgl Lapor</th>
                <th>Status</th>
                <th class="col-action">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {#each formattedTickets as ticket (ticket.id)}
                <tr>
                  <td class="cell-strong">{ticket.id}</td>
                  <td>{ticket.roomNumber}</td>
                  <td>{ticket.category}</td>
                  <td>{ticket.reportedAt}</td>
                  <td>
                    <span class="status-badge {ticket.statusType}"
                      >{ticket.status}</span
                    >
                  </td>
                  <td class="col-action">
                    <button
                      type="button"
                      class="outline-action-btn"
                      onclick={(e) => openTicketDetail(e, ticket)}
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </section>

    <!-- ANTREAN TIKET KOMPLAIN (MOBILE) -->
    <section
      class="panel-card mobile-only"
      aria-label="Antrean tiket komplain mobile"
      in:fade={{ duration: 160 }}
    >
      <div class="panel-header">
        <h2 class="panel-title">Antrean Tiket Komplain</h2>
        <select
          class="filter-select"
          bind:value={ticketStatusFilter}
          aria-label="Filter status tiket komplain mobile"
        >
          <option value="all">Semua</option>
          <option value="pending">Menunggu</option>
          <option value="in_progress">Diproses</option>
          <option value="resolved">Selesai</option>
        </select>
      </div>

      {#if ticketsLoading}
        <div class="table-state-message">Memuat antrean tiket...</div>
      {:else if ticketsError}
        <div class="table-state-message error">{ticketsError}</div>
      {:else if formattedTickets.length === 0}
        <div class="table-state-message">Tidak ada tiket komplain.</div>
      {:else}
        <div class="mobile-ticket-card-list">
          {#each formattedTickets.slice(0, 5) as ticket (ticket.id)}
            <button
              type="button"
              class="mobile-ticket-box"
              onclick={(e) => openTicketDetail(e, ticket)}
            >
              <div class="mobile-ticket-box-top">
                <div>
                  <div class="mobile-ticket-id">
                    {ticket.id} · Kamar {ticket.roomNumber}
                  </div>
                  <div class="mobile-ticket-category">{ticket.category}</div>
                </div>
                <span class="status-badge {ticket.statusType}"
                  >{ticket.status}</span
                >
              </div>

              <div class="mobile-ticket-box-bottom">
                <span class="mobile-ticket-date">{ticket.reportedAt}</span>
                <span class="mobile-ticket-open">Buka &rarr;</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</DashboardLayout>

<style>
  .caretaker-home-page,
  .caretaker-home-page :global(button),
  .caretaker-home-page :global(select),
  .caretaker-home-page :global(a) {
    font-family: "Inter", sans-serif;
  }

  .desktop-only {
    display: block;
  }

  .mobile-only {
    display: none;
  }

  .page-header {
    margin-bottom: 22px;
  }

  .page-title {
    margin: 0 0 6px;
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

  .summary-error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 18px;
    border: 1px solid #f2c6c2;
    border-radius: 10px;
    background-color: #fdecec;
    color: #b71c1c;
    font-size: 13px;
  }

  .retry-btn {
    padding: 6px 14px;
    border: 1px solid #d9827b;
    border-radius: 6px;
    background-color: #ffffff;
    color: #b71c1c;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-bottom: 22px;
  }

  .kpi-card {
    display: flex;
    flex-direction: column;
    padding: 20px 22px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .kpi-label {
    font-size: 12px;
    color: #9e8b7c;
    margin-bottom: 10px;
  }

  .kpi-value {
    font-size: 26px;
    font-weight: 700;
    color: #261a14;
    line-height: 1.2;
    margin-bottom: 6px;
  }

  .kpi-subtext {
    font-size: 11px;
    color: #9e8b7c;
    margin-bottom: 14px;
  }

  .kpi-link {
    display: inline-block;
    margin-top: auto;
    font-size: 12px;
    font-weight: 600;
    color: #5c432d;
    text-decoration: none;
  }

  .kpi-link:hover {
    text-decoration: underline;
  }

  .panel-card {
    padding: 20px 22px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .panel-header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .filter-select {
    height: 30px;
    padding: 0 10px;
    border: 1px solid #e5ddd3;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    cursor: pointer;
  }

  .table-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  .table-state-message {
    padding: 24px;
    text-align: center;
    color: #9e8b7c;
    font-size: 13px;
  }

  .table-state-message.error {
    color: #c62828;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .data-table th {
    padding: 10px 12px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 500;
    color: #9e8b7c;
    white-space: nowrap;
  }

  .data-table td {
    padding: 12px;
    border-bottom: 1px solid #f5efe8;
    font-size: 12px;
    color: #5c4d42;
    white-space: nowrap;
  }

  .data-table tbody tr:last-child td {
    border-bottom: none;
  }

  .cell-strong {
    font-weight: 600;
    color: #261a14;
  }

  .col-action {
    text-align: right;
  }

  .outline-action-btn {
    padding: 4px 12px;
    border: 1px solid #e5ddd3;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .outline-action-btn:hover {
    background-color: #faf7f2;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .status-badge.done {
    background-color: #dcfce7;
    color: #15803d;
  }

  .status-badge.pending {
    background-color: #fef3c7;
    color: #b45309;
  }

  .status-badge.progress {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  @media (max-width: 900px) {
    .kpi-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: block !important;
    }

    .page-title {
      font-size: 26px;
      line-height: 1.25;
    }

    .page-subtitle {
      font-size: 12px;
      line-height: 1.5;
    }

    .mobile-ticket-card-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-ticket-box {
      display: block;
      width: 100%;
      padding: 14px;
      border: 1px solid #ece3d9;
      border-radius: 10px;
      background-color: #ffffff;
      text-align: left;
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease;
    }

    .mobile-ticket-box:hover {
      background-color: #fcfaf7;
      border-color: #dfd3c5;
    }

    .mobile-ticket-box-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .mobile-ticket-id {
      font-size: 13px;
      font-weight: 700;
      color: #261a14;
      margin-bottom: 2px;
    }

    .mobile-ticket-category {
      font-size: 12px;
      color: #6f5f52;
    }

    .mobile-ticket-box-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .mobile-ticket-date {
      font-size: 11px;
      color: #9e8b7c;
    }

    .mobile-ticket-open {
      font-size: 12px;
      font-weight: 600;
      color: #5c432d;
    }
  }
</style>
