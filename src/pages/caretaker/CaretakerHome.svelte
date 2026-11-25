<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

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

  let ticketStatusFilter = $state("active"); // 'active' | 'all' | 'resolved'

  let summaryLoading = $state(true);
  let summaryError = $state("");
  /** @type {any} */
  let summaryData = $state(null);

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
    return formattedTickets.filter(
      (t) => t.rawStatus !== "resolved" && t.rawStatus !== "selesai",
    ).length;
  });

  let activeContractsCount = $derived.by(() => {
    const c = summaryData?.active_contracts ?? summaryData?.contracts;
    if (typeof c === "number") return Number.isFinite(c) ? c : 0;
    const countVal = Number(c?.count ?? c?.active ?? 0);
    return Number.isFinite(countVal) ? countVal : 0;
  });

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
      case "menunggu konfirmasi":
        return { label: "Menunggu Konfirmasi", type: "pending" };
      case "in_progress":
      case "diproses":
        return { label: "Diproses", type: "progress" };
      case "resolved":
      case "selesai":
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
        roomNumber: ticket.room_number || ticket.room?.room_number || "-",
        category: ticket.category || "Lainnya",
        reportedAt: formatDate(ticket.created_at),
        status: statusInfo.label,
        statusType: statusInfo.type,
        rawStatus: String(ticket.status || "pending").toLowerCase(),
      };
    }),
  );

  let filteredTickets = $derived.by(() => {
    if (ticketStatusFilter === "active") {
      return formattedTickets.filter(
        (t) => t.rawStatus !== "resolved" && t.rawStatus !== "selesai",
      );
    }
    if (ticketStatusFilter === "resolved") {
      return formattedTickets.filter(
        (t) => t.rawStatus === "resolved" || t.rawStatus === "selesai",
      );
    }
    return formattedTickets;
  });

  async function loadCaretakerSummary() {
    summaryLoading = true;
    summaryError = "";

    try {
      /** @type {any} */
      const response = await apiRequest("/api/dashboard/summary");
      summaryData =
        response?.data && typeof response.data === "object"
          ? response.data
          : response || null;
    } catch (/** @type {any} */ error) {
      summaryData = null;
      summaryError = error?.message || "";
    } finally {
      summaryLoading = false;
    }
  }

  async function loadTickets() {
    ticketsLoading = true;
    ticketsError = "";

    try {
      /** @type {any} */
      const response = await apiRequest("/api/tickets?limit=10");
      ticketsList = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
    } catch (/** @type {any} */ error) {
      ticketsList = [];
      ticketsError = error?.message || "";
    } finally {
      ticketsLoading = false;
    }
  }

  function handleReloadAll() {
    loadCaretakerSummary();
    loadTickets();
  }

  /**
   * @param {{ href?: string }} item
   */
  function handleNavigate(item) {
    if (!item?.href || typeof window === "undefined") return;
    window.location.hash = `#${item.href}`;
  }

  onMount(() => {
    loadCaretakerSummary();
    loadTickets();
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
            : `${activeContractsCount} kontrak berjalan aktif`}
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

    <!-- ANTREAN TIKET KOMPLAIN -->
    <section class="panel-card" aria-label="Antrean tiket komplain">
      <div class="panel-header">
        <h2 class="panel-title">Antrean Tiket Komplain</h2>
        <div class="panel-header-right">
          <select
            class="filter-select"
            bind:value={ticketStatusFilter}
            aria-label="Filter status tiket komplain"
          >
            <option value="active">Status: Aktif</option>
            <option value="all">Status: Semua</option>
            <option value="resolved">Status: Selesai</option>
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
        {:else if filteredTickets.length === 0}
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
              {#each filteredTickets as ticket (ticket.id)}
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
                      onclick={(e) =>
                        goToHash(
                          e,
                          ticket.rawId
                            ? `#/caretaker/maintenance/${ticket.rawId}`
                            : "#/caretaker/maintenance",
                        )}
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
  </div>
</DashboardLayout>

<style>
  .caretaker-home-page,
  .caretaker-home-page :global(button),
  .caretaker-home-page :global(select),
  .caretaker-home-page :global(a) {
    font-family: "Inter", sans-serif;
  }

  .page-header {
    margin-bottom: 22px;
  }

  .page-title {
    margin: 0 0 4px;
    font-size: 24px;
    font-weight: 700;
    color: #261a14;
  }

  .page-subtitle {
    margin: 0;
    font-size: 12px;
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
    background-color: #e6f6ec;
    color: #1e7e46;
  }

  .status-badge.pending,
  .status-badge.progress {
    background-color: #fef3c7;
    color: #b45309;
  }

  @media (max-width: 900px) {
    .kpi-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .page-title {
      font-size: 21px;
    }
  }
</style>
