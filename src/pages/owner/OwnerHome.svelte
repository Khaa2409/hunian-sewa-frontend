<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  /**
   * @typedef {Object} OccupancySummary
   * @property {number} [total]
   * @property {number} [occupied]
   * @property {number} [available]
   * @property {number} [maintenance]
   */

  /**
   * @typedef {Object} ActiveTicketsSummary
   * @property {number} [count]
   */

  /**
   * @typedef {Object} InvoicesCurrentPeriodSummary
   * @property {number} [total]
   * @property {number} [paid]
   * @property {number} [unpaid]
   * @property {number} [pending]
   * @property {number} [paid_percentage]
   */

  /**
   * @typedef {Object} PaidThisMonthSummary
   * @property {string} [amount_rupiah]
   */

  /**
   * @typedef {Object} DashboardSummary
   * @property {OccupancySummary} [occupancy]
   * @property {ActiveTicketsSummary} [active_tickets]
   * @property {InvoicesCurrentPeriodSummary} [invoices_current_period]
   * @property {PaidThisMonthSummary} [paid_this_month]
   */

  /**
   * @typedef {Object} InvoiceRekapItem
   * @property {number | string} id
   * @property {string} [tenant_name]
   * @property {string} [room_number]
   * @property {number | string} [amount]
   * @property {string} [amount_rupiah]
   * @property {string} [period_start]
   * @property {string} [period_end]
   * @property {string} [due_date]
   * @property {string | null} [paid_at]
   * @property {string | null} [paid_at_wib]
   * @property {string} [status]
   */

  /**
   * @typedef {Object} TicketItem
   * @property {number | string} id
   * @property {string} [ticket_number]
   * @property {string} [room_number]
   * @property {string} [category]
   * @property {string} [created_at]
   * @property {string} [status]
   */

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

  /** @type {'active' | 'all' | 'resolved'} */
  let ticketStatusFilter = $state("active");

  let summaryLoading = $state(true);
  let summaryError = $state("");
  /** @type {DashboardSummary | null} */
  let summaryData = $state(null);

  let paymentsLoading = $state(true);
  let paymentsError = $state("");
  /** @type {InvoiceRekapItem[]} */
  let paymentsList = $state([]);

  let ticketsLoading = $state(true);
  let ticketsError = $state("");
  /** @type {TicketItem[]} */
  let ticketsList = $state([]);

  let displayOwnerName = $derived($currentUser?.name || "Bu Ratna");
  let displayOwnerRole = $derived.by(() => {
    const role = ($currentUser?.role || "owner").toLowerCase();
    if (role === "owner") return "Pemilik";
    return $currentUser?.role || "Pemilik";
  });

  let todayFormattedId = $derived.by(() => {
    const now = new Date();
    return `${now.getDate()} ${MONTHS_ID[now.getMonth()]} ${now.getFullYear()}`;
  });

  /** @type {DashboardSummary} */
  let safeSummary = $derived(summaryData ?? {});

  let occupancyTotal = $derived(Number(safeSummary.occupancy?.total ?? 0));
  let occupancyOccupied = $derived(
    Number(safeSummary.occupancy?.occupied ?? 0),
  );
  let occupancyAvailable = $derived(
    Number(safeSummary.occupancy?.available ?? 0),
  );
  let occupancyMaintenance = $derived(
    Number(safeSummary.occupancy?.maintenance ?? 0),
  );

  let activeTicketCount = $derived(
    Number(safeSummary.active_tickets?.count ?? 0),
  );

  let periodTotal = $derived(
    Number(safeSummary.invoices_current_period?.total ?? 0),
  );
  let periodPaid = $derived(
    Number(safeSummary.invoices_current_period?.paid ?? 0),
  );
  let periodUnpaid = $derived(
    Number(safeSummary.invoices_current_period?.unpaid ?? 0),
  );
  let periodPending = $derived(
    Number(safeSummary.invoices_current_period?.pending ?? 0),
  );
  let periodUnpaidTotal = $derived(periodUnpaid + periodPending);

  let periodPaidPercent = $derived.by(() => {
    const apiPct = Number(safeSummary.invoices_current_period?.paid_percentage);
    if (Number.isFinite(apiPct) && apiPct > 0) {
      return Math.max(0, Math.min(100, apiPct));
    }
    if (periodTotal > 0) {
      return Math.max(0, Math.min(100, (periodPaid / periodTotal) * 100));
    }
    return 0;
  });

  let paidThisMonthRupiah = $derived(
    safeSummary.paid_this_month?.amount_rupiah || "Rp 0",
  );

  function getCurrentPeriodeWib() {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return formatted.slice(0, 7);
  }

  /**
   * @param {any} err
   * @returns {boolean}
   */
  function isNotFoundError(err) {
    const status = Number(err?.status ?? err?.statusCode ?? 0);
    if (status === 404) return true;
    const msg = String(err?.message || "").toLowerCase();
    return (
      msg.includes("404") ||
      msg.includes("tidak ditemukan") ||
      msg.includes("not found")
    );
  }

  /**
   * @param {MouseEvent | null} event
   * @param {string} hashPath
   */
  function goToHash(event, hashPath) {
    if (event) event.preventDefault();
    if (typeof window !== "undefined") {
      window.location.hash = hashPath;
    }
  }

  /**
   * @param {string | null | undefined} isoOrDateString
   * @returns {string}
   */
  function formatDate(isoOrDateString) {
    if (!isoOrDateString || isoOrDateString === "–") return "–";
    const date = new Date(isoOrDateString);
    if (isNaN(date.getTime())) return String(isoOrDateString);
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  /**
   * @param {string | null | undefined} periodStartString
   * @returns {string}
   */
  function formatMonthPeriod(periodStartString) {
    if (!periodStartString) return "-";
    const date = new Date(periodStartString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });
  }

  /**
   * @param {number | string | null | undefined} amount
   * @returns {string}
   */
  function formatRupiahValue(amount) {
    const num = Number(amount);
    if (!Number.isFinite(num)) return "Rp 0";
    return "Rp " + num.toLocaleString("id-ID");
  }

  /**
   * @param {string | null | undefined} status
   * @returns {{ label: string, type: 'paid' | 'pending' | 'overdue' }}
   */
  function getInvoiceStatusInfo(status) {
    switch (status) {
      case "paid":
        return { label: "Lunas", type: "paid" };
      case "pending":
        return { label: "Menunggu Pembayaran", type: "pending" };
      case "unpaid":
        return { label: "Belum Dibayar", type: "overdue" };
      case "cancelled":
        return { label: "Dibatalkan", type: "overdue" };
      default:
        return { label: status || "-", type: "pending" };
    }
  }

  let recentPayments = $derived(
    paymentsList.map((row) => {
      const statusInfo = getInvoiceStatusInfo(row.status);
      const amountText = row.amount_rupiah || formatRupiahValue(row.amount);
      const paidDateText =
        row.paid_at_wib && row.paid_at_wib !== "–"
          ? row.paid_at_wib
          : row.paid_at
            ? formatDate(row.paid_at)
            : "–";
      const periodText = row.period_start
        ? formatMonthPeriod(row.period_start)
        : row.period_end
          ? formatMonthPeriod(row.period_end)
          : "-";
      return {
        id: row.id,
        tenantName: row.tenant_name || "-",
        roomNumber: row.room_number || "-",
        amount: amountText,
        period: periodText,
        paidAt: paidDateText,
        mobileMeta: `${amountText} · ${paidDateText}`,
        status: statusInfo.label,
        statusType: statusInfo.type,
      };
    }),
  );

  /**
   * @param {string | null | undefined} status
   * @returns {{ label: string, type: 'pending' | 'progress' | 'done' }}
   */
  function getTicketStatusInfo(status) {
    switch (status) {
      case "pending":
        return { label: "Menunggu Konfirmasi", type: "pending" };
      case "in_progress":
        return { label: "Diproses", type: "progress" };
      case "resolved":
        return { label: "Selesai", type: "done" };
      default:
        return { label: status || "Pending", type: "pending" };
    }
  }

  let formattedTickets = $derived(
    ticketsList.map((ticket) => {
      const statusInfo = getTicketStatusInfo(ticket.status);
      return {
        id: ticket.ticket_number || `T-${String(ticket.id).padStart(4, "0")}`,
        rawId: ticket.id,
        roomNumber: ticket.room_number || "-",
        category: ticket.category || "Lainnya",
        reportedAt: formatDate(ticket.created_at),
        status: statusInfo.label,
        statusType: statusInfo.type,
        rawStatus: ticket.status,
      };
    }),
  );

  let filteredTickets = $derived.by(() => {
    if (ticketStatusFilter === "active") {
      return formattedTickets.filter(
        (ticket) => ticket.rawStatus !== "resolved",
      );
    }
    if (ticketStatusFilter === "resolved") {
      return formattedTickets.filter(
        (ticket) => ticket.rawStatus === "resolved",
      );
    }
    return formattedTickets;
  });

  async function loadOwnerSummary() {
    summaryLoading = true;
    summaryError = "";

    try {
      /** @type {any} */
      const response = await apiRequest("/api/dashboard/summary");
      summaryData = response?.data || null;
    } catch (/** @type {any} */ error) {
      if (!isNotFoundError(error)) {
        summaryError = error?.message || "Gagal memuat ringkasan dashboard.";
      }
    } finally {
      summaryLoading = false;
    }
  }

  async function loadRecentPayments() {
    paymentsLoading = true;
    paymentsError = "";

    try {
      const periode = getCurrentPeriodeWib();
      /** @type {any} */
      const response = await apiRequest(
        `/api/invoices?periode=${encodeURIComponent(periode)}&limit=5`,
      );
      paymentsList = Array.isArray(response?.data) ? response.data : [];
    } catch (/** @type {any} */ error) {
      if (!isNotFoundError(error)) {
        paymentsError = error?.message || "Gagal memuat rekap tagihan.";
      }
    } finally {
      paymentsLoading = false;
    }
  }

  async function loadTickets() {
    ticketsLoading = true;
    ticketsError = "";

    try {
      /** @type {any} */
      const response = await apiRequest("/api/tickets?limit=10");
      ticketsList = Array.isArray(response?.data) ? response.data : [];
    } catch (/** @type {any} */ error) {
      if (!isNotFoundError(error)) {
        ticketsError = error?.message || "Gagal memuat daftar tiket komplain.";
      }
    } finally {
      ticketsLoading = false;
    }
  }

  function handleRetryAll() {
    loadOwnerSummary();
    loadRecentPayments();
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
    loadOwnerSummary();
    loadRecentPayments();
    loadTickets();
  });
</script>

<DashboardLayout
  activeKey="dashboard"
  ownerName={displayOwnerName}
  ownerRole={displayOwnerRole}
  onNavigate={handleNavigate}
>
  <div
    class="owner-home-page"
    in:fly={{ y: 16, duration: 250, easing: cubicOut }}
  >
    <!-- JUDUL HALAMAN DESKTOP -->
    <div class="page-header desktop-only">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">
        Ringkasan operasional hunian &middot; {todayFormattedId}
      </p>
    </div>

    <!-- JUDUL HALAMAN MOBILE -->
    <div class="page-header mobile-only">
      <h1 class="mobile-page-title">Dashboard</h1>
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
        <button type="button" class="retry-btn" onclick={handleRetryAll}
          >Coba Lagi</button
        >
      </div>
    {/if}

    <!-- 3 KARTU RINGKASAN DESKTOP -->
    <section
      class="kpi-grid desktop-only"
      aria-label="Ringkasan utama"
      in:fade={{ duration: 160 }}
    >
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
          href="#/owner/rooms"
          class="kpi-link"
          onclick={(e) => goToHash(e, "#/owner/rooms")}
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
          href="#/owner/maintenance"
          class="kpi-link"
          onclick={(e) => goToHash(e, "#/owner/maintenance")}
        >
          Lihat antrean tiket →
        </a>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">Tagihan Bulan Ini Lunas</div>
        <div class="kpi-value">
          {summaryLoading ? "..." : `${periodPaid} / ${periodTotal}`}
        </div>
        <div class="kpi-subtext">
          {summaryLoading
            ? "Memuat tagihan..."
            : `${periodUnpaidTotal} tagihan belum dibayar`}
        </div>
        <div class="kpi-bar-track">
          <div
            class="kpi-bar-fill billing"
            style="width: {periodPaidPercent}%;"
          ></div>
        </div>
        <a
          href="#/owner/finance"
          class="kpi-link"
          onclick={(e) => goToHash(e, "#/owner/finance")}
        >
          Lihat riwayat pembayaran →
        </a>
      </article>
    </section>

    <!-- 3 KARTU RINGKASAN MOBILE -->
    <section
      class="mobile-kpi-stack mobile-only"
      aria-label="Ringkasan utama mobile"
      in:fade={{ duration: 160 }}
    >
      <article class="mobile-kpi-card">
        <div class="mobile-kpi-label">Okupansi Kamar</div>
        <div class="mobile-kpi-value">
          {summaryLoading
            ? "..."
            : `${occupancyOccupied} / ${occupancyTotal} Kamar`}
        </div>
        <div class="mobile-kpi-subtext">
          {summaryLoading
            ? "Memuat..."
            : `${occupancyOccupied} terisi · ${occupancyAvailable} kosong · ${occupancyMaintenance} maintenance`}
        </div>
        <a
          href="#/owner/rooms"
          class="mobile-kpi-link"
          onclick={(e) => goToHash(e, "#/owner/rooms")}
        >
          Lihat Kamar &amp; Penghuni →
        </a>
      </article>

      <article class="mobile-kpi-card">
        <div class="mobile-kpi-label">Tiket Kerusakan Aktif</div>
        <div class="mobile-kpi-value">
          {summaryLoading ? "..." : `${activeTicketCount} Tiket`}
        </div>
        <div class="mobile-kpi-subtext">Menunggu Konfirmasi / Diproses</div>
        <a
          href="#/owner/maintenance"
          class="mobile-kpi-link"
          onclick={(e) => goToHash(e, "#/owner/maintenance")}
        >
          Lihat antrean tiket →
        </a>
      </article>

      <article class="mobile-kpi-card">
        <div class="mobile-kpi-label">Tagihan Bulan Ini Lunas</div>
        <div class="mobile-kpi-value">
          {summaryLoading ? "..." : paidThisMonthRupiah}
        </div>
        <div class="mobile-kpi-subtext">
          {summaryLoading
            ? "Memuat..."
            : `${periodPaid} dari ${periodTotal} tagihan lunas`}
        </div>
        <div class="kpi-bar-track">
          <div
            class="kpi-bar-fill billing"
            style="width: {periodPaidPercent}%;"
          ></div>
        </div>
        <a
          href="#/owner/finance"
          class="mobile-kpi-link"
          onclick={(e) => goToHash(e, "#/owner/finance")}
        >
          Lihat Laporan Keuangan →
        </a>
      </article>
    </section>

    <!-- REKAP PEMBAYARAN TERBARU (DESKTOP) -->
    <section
      class="panel-card desktop-only"
      aria-label="Rekap pembayaran terbaru"
      in:fade={{ duration: 160 }}
    >
      <div class="panel-header">
        <h2 class="panel-title">Rekap Pembayaran Terbaru</h2>
        <div class="panel-header-right">
          <a
            href="#/owner/finance"
            class="panel-link"
            onclick={(e) => goToHash(e, "#/owner/finance")}
          >
            Lihat semua →
          </a>
        </div>
      </div>

      <div class="table-wrapper">
        {#if paymentsLoading}
          <div class="table-state-message">Memuat rekap pembayaran...</div>
        {:else if paymentsError}
          <div class="table-state-message error">{paymentsError}</div>
        {:else if recentPayments.length === 0}
          <div class="table-state-message">Belum ada data pembayaran.</div>
        {:else}
          <table class="data-table">
            <thead>
              <tr>
                <th>Nama Penyewa</th>
                <th>Nomor Kamar</th>
                <th>Nominal</th>
                <th>Periode Bulan</th>
                <th>Tgl Pembayaran</th>
                <th>Status</th>
                <th class="col-action">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {#each recentPayments as item}
                <tr>
                  <td class="cell-strong">{item.tenantName}</td>
                  <td>{item.roomNumber}</td>
                  <td>{item.amount}</td>
                  <td>{item.period}</td>
                  <td>{item.paidAt}</td>
                  <td>
                    <span class="status-badge {item.statusType}"
                      >{item.status}</span
                    >
                  </td>
                  <td class="col-action">
                    <button
                      type="button"
                      class="outline-action-btn"
                      onclick={(e) => goToHash(e, "#/owner/finance")}
                    >
                      Lihat
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </section>

    <!-- REKAP PEMBAYARAN TERBARU (MOBILE) -->
    <section
      class="mobile-panel-card mobile-only"
      aria-label="Rekap pembayaran terbaru mobile"
      in:fade={{ duration: 160 }}
    >
      <div class="mobile-panel-header">
        <h2 class="mobile-panel-title">Rekap Pembayaran Terbaru</h2>
        <a
          href="#/owner/finance"
          class="panel-link"
          onclick={(e) => goToHash(e, "#/owner/finance")}
        >
          Lihat semua →
        </a>
      </div>

      {#if paymentsLoading}
        <div class="table-state-message">Memuat rekap pembayaran...</div>
      {:else if paymentsError}
        <div class="table-state-message error">{paymentsError}</div>
      {:else if recentPayments.length === 0}
        <div class="table-state-message">Belum ada data pembayaran.</div>
      {:else}
        <div class="mobile-payment-list">
          {#each recentPayments.slice(0, 3) as item}
            <div class="mobile-payment-row">
              <div class="mobile-payment-info">
                <div class="mobile-payment-name">
                  {item.tenantName} · {item.roomNumber}
                </div>
                <div class="mobile-payment-meta">{item.mobileMeta}</div>
              </div>
              <span class="status-badge {item.statusType}">{item.status}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ANTREAN TIKET KOMPLAIN (DESKTOP) -->
    <section
      class="panel-card desktop-only"
      aria-label="Antrean tiket komplain"
      in:fade={{ duration: 160 }}
    >
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
          <div class="table-state-message">Memuat antrean tiket...</div>
        {:else if ticketsError}
          <div class="table-state-message error">{ticketsError}</div>
        {:else if filteredTickets.length === 0}
          <div class="table-state-message">Tidak ada tiket komplain.</div>
        {:else}
          <table class="data-table">
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
              {#each filteredTickets as ticket}
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
                      onclick={(e) => goToHash(e, "#/owner/maintenance")}
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
  .owner-home-page,
  .owner-home-page :global(button),
  .owner-home-page :global(input),
  .owner-home-page :global(select),
  .owner-home-page :global(a) {
    font-family: "Inter", sans-serif;
  }

  .desktop-only {
    display: block;
  }

  .mobile-only {
    display: none;
  }

  .kpi-grid.desktop-only {
    display: grid;
  }

  .mobile-kpi-stack.mobile-only {
    display: none;
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

  .table-state-message {
    padding: 24px;
    text-align: center;
    color: #9e8b7c;
    font-size: 13px;
  }

  .table-state-message.error {
    color: #c62828;
  }

  /* PAGE HEADER DESKTOP */
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

  /* KPI CARDS DESKTOP */
  .kpi-grid {
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

  .kpi-bar-track {
    width: 100%;
    height: 5px;
    border-radius: 999px;
    background-color: #f1ebe4;
    overflow: hidden;
    margin-bottom: 14px;
  }

  .kpi-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.25s ease;
  }

  .kpi-bar-fill.billing {
    background-color: #15803d;
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

  /* PANEL CARD DESKTOP */
  .panel-card {
    padding: 20px 22px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
    margin-bottom: 22px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
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
    gap: 12px;
  }

  .panel-link {
    font-size: 12px;
    font-weight: 600;
    color: #5c432d;
    white-space: nowrap;
    text-decoration: none;
  }

  .panel-link:hover {
    text-decoration: underline;
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

  /* TABLE */
  .table-wrapper {
    width: 100%;
    overflow-x: auto;
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

  /* STATUS BADGES */
  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .status-badge.paid,
  .status-badge.done {
    background-color: #e6f6ec;
    color: #1e7e46;
  }

  .status-badge.pending,
  .status-badge.progress {
    background-color: #fff6df;
    color: #b7791f;
  }

  .status-badge.overdue {
    background-color: #fdecec;
    color: #c62828;
  }

  /* MOBILE STYLES */
  @media (max-width: 768px) {
    .desktop-only,
    .kpi-grid.desktop-only {
      display: none;
    }

    .mobile-only {
      display: block;
    }

    .mobile-kpi-stack.mobile-only {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 18px;
    }

    .mobile-page-title {
      margin: 0 0 6px;
      font-size: 26px;
      font-weight: 700;
      line-height: 1.25;
      color: #261a14;
    }

    .mobile-page-subtitle {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: #9e8b7c;
    }

    .mobile-kpi-card {
      padding: 18px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
    }

    .mobile-kpi-label {
      font-size: 12px;
      color: #9e8b7c;
      margin-bottom: 8px;
    }

    .mobile-kpi-value {
      font-size: 24px;
      font-weight: 700;
      color: #261a14;
      margin-bottom: 6px;
    }

    .mobile-kpi-subtext {
      font-size: 12px;
      color: #9e8b7c;
      margin-bottom: 12px;
    }

    .mobile-kpi-link {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      color: #5c432d;
      text-decoration: none;
    }

    .mobile-panel-card {
      padding: 18px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
    }

    .mobile-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 14px;
    }

    .mobile-panel-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #261a14;
    }

    .mobile-payment-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .mobile-payment-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .mobile-payment-name {
      font-size: 13px;
      font-weight: 600;
      color: #261a14;
      margin-bottom: 3px;
    }

    .mobile-payment-meta {
      font-size: 11px;
      color: #9e8b7c;
    }
  }
</style>
