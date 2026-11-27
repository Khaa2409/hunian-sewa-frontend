<script>
  import { onMount } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";
  import { getToken } from "../../services/token.js";

  /**
   * @typedef {Object} PeriodOption
   * @property {string} value
   * @property {string} label
   */

  /**
   * @typedef {Object} FinanceRoomItem
   * @property {number | string} id
   * @property {string} room
   * @property {string} tenant
   * @property {string} roomName
   * @property {string} period
   * @property {string} billPeriod
   * @property {string} amount
   * @property {string} paidDate
   * @property {'paid' | 'partial' | 'pending' | 'late'} status
   * @property {string} statusLabel
   */

  /**
   * @typedef {Object} FinanceTrendItem
   * @property {string} month
   * @property {string} valueLabel
   * @property {number} heightPct
   * @property {boolean} active
   */

  /**
   * @typedef {Object} FinanceReportViewModel
   * @property {string} value
   * @property {string} label
   * @property {string} totalReceived
   * @property {string} receivedNote
   * @property {string} unpaidAmount
   * @property {string} unpaidNote
   * @property {string} targetAmountText
   * @property {string} collectionPercent
   * @property {string} collectionMobileBadge
   * @property {string} collectionDetail
   * @property {number} progressPercent
   * @property {string} trendUnit
   * @property {FinanceTrendItem[]} trend
   * @property {number} totalEntriesCount
   * @property {FinanceRoomItem[]} rooms
   */

  /**
   * Menghitung periode YYYY-MM saat ini di zona waktu WIB (Asia/Jakarta).
   * @returns {string}
   */
  function getCurrentWibPeriod() {
    try {
      const formatted = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
      }).format(new Date());
      const match = formatted.match(/^(\d{4}-\d{2})/);
      if (match) return match[1];
    } catch {
      // Fallback jika Intl tidak tersedia
    }
    const now = new Date();
    const wibDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const yyyy = wibDate.getUTCFullYear();
    const mm = String(wibDate.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  let selectedPeriod = $state(getCurrentWibPeriod());
  let loading = $state(true);
  let hasError = $state(false);
  let errorMessage = $state("");
  let downloadingReport = $state(false);
  let currentPage = $state(1);
  const pageSize = 10;

  /** @type {PeriodOption[]} */
  let periodOptions = $state([]);

  /** @type {FinanceReportViewModel | null} */
  let reportData = $state(null);

  let displayOwnerName = $derived($currentUser?.name || "Bu Ratna");
  let displayOwnerRole = $derived.by(() => {
    const role = ($currentUser?.role || "owner").toLowerCase();
    if (role === "owner") return "Pemilik";
    return $currentUser?.role || "Pemilik";
  });

  /**
   * @param {any} val
   * @param {number} [fallback]
   * @returns {number}
   */
  function toNumber(val, fallback = 0) {
    if (val === null || val === undefined || val === "") return fallback;
    if (typeof val === "number") return Number.isFinite(val) ? val : fallback;
    const cleaned = String(val).replace(/[^\d.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * @param {any} val
   * @returns {string}
   */
  function formatRupiah(val) {
    if (typeof val === "string" && val.trim().startsWith("Rp"))
      return val.trim();
    const num = toNumber(val, 0);
    return `Rp ${num.toLocaleString("id-ID")}`;
  }

  /**
   * @param {string} periodKey
   * @returns {string}
   */
  function formatPeriodLabel(periodKey) {
    if (!periodKey) return "";
    const parts = periodKey.split("-");
    if (parts.length === 2) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const months = [
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
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${months[monthIndex]} ${year}`;
      }
    }
    return periodKey;
  }

  /**
   * @param {any} room
   * @returns {{ status: 'paid' | 'partial' | 'pending' | 'late', label: string }}
   */
  function mapFinanceStatus(room) {
    if (room?.status === "paid") return { status: "paid", label: "Lunas" };
    if (room?.status === "partial")
      return { status: "partial", label: "Sebagian" };
    if (toNumber(room?.overdue_days, 0) > 0) {
      return { status: "late", label: "Terlambat" };
    }
    return { status: "pending", label: "Menunggu Pembayaran" };
  }

  /**
   * @param {any} payload
   * @param {string} periodKey
   * @returns {FinanceReportViewModel | null}
   */
  function normalizeReportPayload(payload, periodKey) {
    const root = payload?.data;
    if (!root || typeof root !== "object") return null;

    const monthlyArr = Array.isArray(root.monthly) ? root.monthly : [];
    if (monthlyArr.length > 0) {
      periodOptions = monthlyArr
        .filter((/** @type {any} */ m) => m?.periode)
        .map((/** @type {any} */ m) => ({
          value: String(m.periode),
          label: formatPeriodLabel(String(m.periode)),
        }));
    }

    const totals = root.totals || {};
    const invoiceCount = toNumber(totals.invoice_count, 0);
    const paidCount = toNumber(totals.paid_count, 0);
    const overdueCount = toNumber(totals.overdue_count, 0);
    const unpaidCount = Math.max(0, invoiceCount - paidCount);

    const pctNum = Math.min(100, Math.max(0, toNumber(totals.percentage, 0)));
    const pctFormattedId = Number.isInteger(pctNum)
      ? `${pctNum}%`
      : `${pctNum.toFixed(1).replace(".", ",")}%`;

    const activePeriode = String(root.periode || periodKey);
    const periodLabelText = formatPeriodLabel(activePeriode);

    const rawRooms = Array.isArray(root.rooms) ? root.rooms : [];
    /** @type {FinanceRoomItem[]} */
    const rooms = rawRooms.map(
      (/** @type {any} */ r, /** @type {number} */ idx) => {
        const st = mapFinanceStatus(r);
        const roomCode = r.room_number || "-";
        const tenantName = r.tenant_name || "-";
        const paidDateDisplay = r.paid_at_wib || r.paid_at || "—";
        return {
          id: `${roomCode}-${idx + 1}`,
          room: roomCode,
          tenant: tenantName,
          roomName:
            tenantName !== "-"
              ? `Kamar ${roomCode} · ${tenantName}`
              : `Kamar ${roomCode}`,
          period: periodLabelText,
          billPeriod: `Tagihan ${periodLabelText}`,
          amount: r.billed_rupiah || formatRupiah(r.billed),
          paidDate: paidDateDisplay,
          status: st.status,
          statusLabel: st.label,
        };
      },
    );

    const maxPaidNum = Math.max(
      1,
      ...monthlyArr.map((/** @type {any} */ m) => toNumber(m.paid, 0)),
    );

    /** @type {FinanceTrendItem[]} */
    const trend = monthlyArr.map(
      (/** @type {any} */ m, /** @type {number} */ idx) => {
        const paidNum = toNumber(m.paid, 0);
        const inMillions = paidNum / 1_000_000;
        const millionsLabel =
          paidNum > 0
            ? Number.isInteger(inMillions)
              ? String(inMillions)
              : inMillions.toFixed(1).replace(".", ",")
            : "0";
        const heightPct =
          paidNum > 0
            ? Math.max(12, Math.round((paidNum / maxPaidNum) * 100))
            : 0;
        return {
          month:
            formatPeriodLabel(String(m.periode || "")).split(" ")[0] ||
            `B${idx + 1}`,
          valueLabel: millionsLabel,
          heightPct,
          active: String(m.periode) === activePeriode,
        };
      },
    );

    return {
      value: activePeriode,
      label: periodLabelText,
      totalReceived: totals.paid_rupiah || formatRupiah(totals.paid),
      receivedNote: `dari ${paidCount} tagihan lunas`,
      unpaidAmount: totals.unpaid_rupiah || formatRupiah(totals.unpaid),
      unpaidNote: `${unpaidCount} tagihan, ${overdueCount} terlambat`,
      targetAmountText: totals.billed_rupiah || formatRupiah(totals.billed),
      collectionPercent: pctFormattedId,
      collectionMobileBadge: `${pctFormattedId} (${paidCount}/${invoiceCount} Tagihan)`,
      collectionDetail: `${paidCount} dari ${invoiceCount} Tagihan`,
      progressPercent: pctNum,
      trendUnit: "juta rupiah",
      trend,
      totalEntriesCount: rooms.length,
      rooms,
    };
  }

  /** @type {FinanceReportViewModel} */
  let currentData = $derived.by(() => {
    return (
      reportData || {
        value: selectedPeriod,
        label:
          periodOptions.find((p) => p.value === selectedPeriod)?.label ||
          formatPeriodLabel(selectedPeriod),
        totalReceived: "Rp 0",
        receivedNote: "dari 0 tagihan lunas",
        unpaidAmount: "Rp 0",
        unpaidNote: "0 tagihan, 0 terlambat",
        targetAmountText: "dari target Rp 0 bulan ini",
        collectionPercent: "0%",
        collectionMobileBadge: "0% (0/0 Tagihan)",
        collectionDetail: "0 dari 0 Tagihan",
        progressPercent: 0,
        trendUnit: "juta rupiah",
        trend: [],
        totalEntriesCount: 0,
        rooms: [],
      }
    );
  });

  let totalRoomsCount = $derived.by(() => {
    return currentData.totalEntriesCount > 0
      ? currentData.totalEntriesCount
      : currentData.rooms.length;
  });

  let totalPages = $derived.by(() => {
    return Math.max(1, Math.ceil(currentData.rooms.length / pageSize));
  });

  let displayedDesktopRooms = $derived.by(() => {
    const start = (currentPage - 1) * pageSize;
    return currentData.rooms.slice(start, start + pageSize);
  });

  let showingStart = $derived.by(() => {
    if (currentData.rooms.length === 0) return 0;
    return (currentPage - 1) * pageSize + 1;
  });

  let showingEnd = $derived.by(() => {
    if (currentData.rooms.length === 0) return 0;
    return Math.min(currentPage * pageSize, currentData.rooms.length);
  });

  /**
   * @param {string} periodVal
   */
  async function fetchFinanceReport(periodVal) {
    loading = true;
    hasError = false;
    errorMessage = "";
    reportData = null;

    try {
      const res = await apiRequest(
        `/api/reports/financial?periode=${encodeURIComponent(periodVal)}`,
      );
      const normalized = normalizeReportPayload(res, periodVal);
      if (!normalized) {
        throw new Error("Format respons laporan keuangan tidak valid.");
      }
      reportData = normalized;
    } catch (/** @type {any} */ err) {
      hasError = true;
      errorMessage =
        err?.data?.pesan ||
        err?.message ||
        "Data penerimaan tidak dapat diambil. Periksa koneksi lalu coba lagi.";
    } finally {
      loading = false;
    }
  }

  function handlePeriodChange() {
    currentPage = 1;
    fetchFinanceReport(selectedPeriod);
  }

  function retryLoad() {
    fetchFinanceReport(selectedPeriod);
  }

  function handleContactSupport() {
    if (typeof window !== "undefined") {
      window.location.hash = "#/owner/users";
    }
  }

  async function handleDownloadReport() {
    if (typeof window === "undefined" || downloadingReport) return;

    downloadingReport = true;
    try {
      const periodQuery = encodeURIComponent(selectedPeriod);
      const token = getToken();
      /** @type {Record<string, string>} */
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(
        `/api/reports/financial/export?periode=${periodQuery}`,
        { headers },
      );
      if (!res.ok) {
        let errText = `Gagal mengunduh laporan CSV (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          errText = errJson?.pesan || errJson?.message || errText;
        } catch {
          // Biarkan pesan default jika respons bukan JSON
        }
        throw new Error(errText);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(
        /filename\*?=(?:UTF-8'')?["']?([^;"'\n]+)["']?/i,
      );
      const filename = filenameMatch?.[1]
        ? decodeURIComponent(filenameMatch[1].trim())
        : `laporan-keuangan-${selectedPeriod}.csv`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (/** @type {any} */ err) {
      window.alert(err?.message || "Gagal mengunduh laporan keuangan.");
    } finally {
      downloadingReport = false;
    }
  }

  /**
   * @param {{ href?: string }} item
   */
  function handleNavigate(item) {
    if (!item?.href || typeof window === "undefined") return;
    window.location.hash = `#${item.href}`;
  }

  onMount(() => {
    fetchFinanceReport(selectedPeriod);
  });
</script>

<DashboardLayout
  activeKey="finance"
  ownerName={displayOwnerName}
  ownerRole={displayOwnerRole}
  onNavigate={handleNavigate}
>
  <div class="finance-page" in:fly={{ y: 16, duration: 250, easing: cubicOut }}>
    <!-- HEADER -->
    <div class="finance-header-row">
      <div class="finance-heading-group">
        <h1 class="finance-title">Laporan Keuangan</h1>
        <p class="finance-subtitle">
          <span class="desktop-only"
            >Ringkasan penerimaan sewa seluruh hunian</span
          >
          <span class="mobile-only"
            >Rekap pemasukan sewa dan status pelunasan bulanan</span
          >
        </p>
      </div>

      <div class="header-right-controls desktop-only">
        <select
          class="period-select"
          bind:value={selectedPeriod}
          onchange={handlePeriodChange}
          aria-label="Pilih periode laporan keuangan"
          disabled={loading || downloadingReport}
        >
          {#each periodOptions as p}
            <option value={p.value}>{p.label}</option>
          {/each}
        </select>

        <button
          type="button"
          class="btn-download-report"
          onclick={handleDownloadReport}
          disabled={loading || hasError || downloadingReport}
        >
          {downloadingReport ? "Mengunduh..." : "Unduh Laporan"}
        </button>
      </div>
    </div>

    <!-- MOBILE PERIOD & DOWNLOAD CONTROLS -->
    <div class="mobile-only mobile-controls-stack">
      <select
        class="mobile-period-select"
        bind:value={selectedPeriod}
        onchange={handlePeriodChange}
        aria-label="Pilih periode laporan keuangan mobile"
        disabled={loading || downloadingReport}
      >
        {#each periodOptions as p}
          <option value={p.value}>{p.label}</option>
        {/each}
      </select>

      <button
        type="button"
        class="mobile-download-btn"
        onclick={handleDownloadReport}
        disabled={loading || hasError || downloadingReport}
      >
        {downloadingReport ? "Mengunduh..." : "Unduh Laporan"}
      </button>
    </div>

    {#if loading}
      <div class="state-card" in:fade={{ duration: 160 }}>
        Memuat laporan keuangan...
      </div>
    {:else if hasError}
      <!-- DESKTOP ERROR STATE -->
      <div
        class="desktop-error-wrap desktop-only"
        in:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
      >
        <section class="desktop-error-card" aria-label="Gagal memuat laporan">
          <div class="error-icon-badge" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 class="desktop-error-title">Gagal memuat laporan</h2>
          <p class="desktop-error-desc">
            {errorMessage ||
              "Data penerimaan tidak dapat diambil. Periksa koneksi internet lalu coba lagi. Tidak ada data yang berubah."}
          </p>
        </section>

        <div class="desktop-error-actions">
          <button type="button" class="btn-primary-brown" onclick={retryLoad}
            >Coba Lagi</button
          >
          <button
            type="button"
            class="btn-secondary-outline"
            onclick={handleContactSupport}
          >
            Hubungi Dukungan
          </button>
        </div>
      </div>

      <!-- MOBILE ERROR STATE -->
      <div
        class="mobile-only mobile-error-wrap"
        in:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
      >
        <section
          class="mobile-error-card"
          aria-label="Gagal memuat data keuangan"
        >
          <div class="error-icon-badge" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 class="mobile-error-title">Gagal memuat data keuangan</h2>
          <p class="mobile-error-desc">
            {errorMessage ||
              "Terjadi gangguan saat menghubungkan ke server catatan transaksi. Silakan coba beberapa saat lagi."}
          </p>
        </section>

        <button type="button" class="mobile-retry-btn" onclick={retryLoad}
          >Coba Lagi</button
        >
      </div>
    {:else}
      <!-- DESKTOP 3 SUMMARY CARDS -->
      <div class="desktop-kpi-grid desktop-only" in:fade={{ duration: 160 }}>
        <section class="desktop-kpi-card" aria-label="Total Diterima">
          <span class="desktop-kpi-lbl">Total Diterima</span>
          <div class="desktop-kpi-val">{currentData.totalReceived}</div>
          <p class="desktop-kpi-sub">{currentData.receivedNote}</p>
        </section>

        <section class="desktop-kpi-card" aria-label="Belum Dibayar">
          <span class="desktop-kpi-lbl">Belum Dibayar</span>
          <div class="desktop-kpi-val">{currentData.unpaidAmount}</div>
          <p class="desktop-kpi-sub">{currentData.unpaidNote}</p>
        </section>

        <section class="desktop-kpi-card" aria-label="Progres Pelunasan">
          <span class="desktop-kpi-lbl">Progres Pelunasan</span>
          <div class="desktop-kpi-val">{currentData.collectionPercent}</div>
          <p class="desktop-kpi-sub">{currentData.collectionDetail}</p>
          <div class="desktop-progress-track" aria-hidden="true">
            <div
              class="desktop-progress-fill"
              style="width: {Math.min(
                100,
                Math.max(0, currentData.progressPercent),
              )}%"
            ></div>
          </div>
        </section>
      </div>

      <!-- MOBILE SUMMARY CARDS -->
      <div class="mobile-only mobile-summary-stack" in:fade={{ duration: 160 }}>
        <section class="mobile-kpi-card" aria-label="Total Diterima">
          <span class="mobile-kpi-lbl">Total Diterima</span>
          <div class="mobile-kpi-val">{currentData.totalReceived}</div>
          <p class="mobile-kpi-sub">{currentData.receivedNote}</p>
        </section>

        <section class="mobile-kpi-card" aria-label="Belum Dibayar">
          <span class="mobile-kpi-lbl">Belum Dibayar</span>
          <div class="mobile-kpi-val">{currentData.unpaidAmount}</div>
          <p class="mobile-kpi-sub">{currentData.unpaidNote}</p>
        </section>

        <section class="mobile-kpi-card" aria-label="Progres Pelunasan">
          <span class="mobile-kpi-lbl">Progres Pelunasan</span>
          <div class="mobile-kpi-val">{currentData.collectionPercent}</div>
          <p class="mobile-kpi-sub">{currentData.collectionDetail}</p>
          <div class="mobile-progress-track" aria-hidden="true">
            <div
              class="mobile-progress-fill"
              style="width: {Math.min(
                100,
                Math.max(0, currentData.progressPercent),
              )}%"
            ></div>
          </div>
        </section>
      </div>

      <!-- DESKTOP CHART: PENERIMAAN SEWA 6 BULAN TERAKHIR -->
      <section
        class="desktop-chart-card desktop-only"
        aria-label="Penerimaan Sewa 6 Bulan Terakhir"
        in:fade={{ duration: 160 }}
      >
        <div class="desktop-chart-head">
          <h2 class="desktop-chart-title">Penerimaan Sewa 6 Bulan Terakhir</h2>
          <span class="desktop-chart-unit">{currentData.trendUnit}</span>
        </div>

        {#if currentData.trend.length === 0}
          <div class="empty-inline">
            Belum ada data tren penerimaan untuk periode ini.
          </div>
        {:else}
          <div class="desktop-chart-cols">
            {#each currentData.trend as bar}
              <div class="desktop-chart-col">
                <span class="desktop-chart-num">{bar.valueLabel}</span>
                <div class="desktop-chart-track">
                  <div
                    class="desktop-chart-bar {bar.active ? 'active' : ''}"
                    style="height: {bar.heightPct}%"
                  ></div>
                </div>
                <span class="desktop-chart-month {bar.active ? 'active' : ''}"
                  >{bar.month}</span
                >
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- MOBILE CHART: TREN PENERIMAAN 6 BULAN -->
      <section
        class="mobile-only mobile-trend-card"
        aria-label="Tren Penerimaan 6 Bulan"
        in:fade={{ duration: 160 }}
      >
        <h2 class="mobile-section-heading">Tren Penerimaan 6 Bulan</h2>
        {#if currentData.trend.length === 0}
          <div class="empty-inline">
            Belum ada data tren penerimaan untuk periode ini.
          </div>
        {:else}
          <div class="trend-bars-wrap">
            {#each currentData.trend as item}
              <div class="trend-col">
                <div class="trend-bar-track">
                  <div
                    class="trend-bar {item.active ? 'active' : ''}"
                    style="height: {item.heightPct}%"
                  ></div>
                </div>
                <span class="trend-month {item.active ? 'active' : ''}"
                  >{item.month}</span
                >
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- DESKTOP TABLE: RINCIAN PENERIMAAN PER KAMAR -->
      <section
        class="desktop-table-card desktop-only"
        aria-label="Rincian Penerimaan per Kamar"
        in:fade={{ duration: 160 }}
      >
        <div class="desktop-table-head">
          <h2 class="desktop-table-title">Rincian Penerimaan per Kamar</h2>
          <span class="desktop-table-period">{currentData.label}</span>
        </div>

        {#if currentData.rooms.length === 0}
          <div class="empty-inline">
            Belum ada rincian penerimaan pada periode ini.
          </div>
        {:else}
          <div class="table-wrap">
            <table class="finance-table">
              <thead>
                <tr>
                  <th>Kamar</th>
                  <th>Penyewa</th>
                  <th>Periode</th>
                  <th>Nominal</th>
                  <th>Tgl Pembayaran</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {#each displayedDesktopRooms as row (row.id)}
                  <tr>
                    <td class="cell-room">{row.room}</td>
                    <td class="cell-tenant">{row.tenant}</td>
                    <td class="cell-muted">{row.period}</td>
                    <td class="cell-amount">{row.amount}</td>
                    <td class="cell-muted">{row.paidDate}</td>
                    <td>
                      <span class="status-pill {row.status}"
                        >{row.statusLabel}</span
                      >
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <p class="desktop-table-footnote">
            Hanya Pemilik yang dapat melihat laporan keuangan. Data mengikuti
            tagihan yang jatuh tempo pada periode terpilih.
          </p>

          <div class="desktop-pagination-row">
            <span class="pagination-info">
              Menampilkan {showingStart}-{showingEnd} dari {totalRoomsCount} tagihan
            </span>

            <div class="pagination-controls">
              <span class="page-indicator"
                >Halaman {currentPage} dari {totalPages}</span
              >
              <button
                type="button"
                class="btn-page"
                disabled={currentPage <= 1}
                onclick={() => (currentPage = Math.max(1, currentPage - 1))}
              >
                Sebelumnya
              </button>
              <button
                type="button"
                class="btn-page"
                disabled={currentPage >= totalPages}
                onclick={() =>
                  (currentPage = Math.min(totalPages, currentPage + 1))}
              >
                Berikutnya
              </button>
            </div>
          </div>
        {/if}
      </section>

      <!-- MOBILE ROOM LIST: RINCIAN PENERIMAAN PER KAMAR -->
      <section
        class="mobile-only mobile-rooms-section"
        aria-label="Rincian Penerimaan per Kamar"
        in:fade={{ duration: 160 }}
      >
        <h2 class="mobile-section-heading">Rincian Penerimaan per Kamar</h2>

        {#if currentData.rooms.length === 0}
          <div class="state-card">
            Belum ada rincian penerimaan pada periode ini.
          </div>
        {:else}
          <div class="room-cards-list">
            {#each currentData.rooms as room (room.id)}
              <article class="room-card">
                <div class="room-card-top">
                  <div>
                    <h3 class="room-card-title">{room.roomName}</h3>
                    <p class="room-card-period">{room.billPeriod}</p>
                  </div>
                  <span class="status-pill {room.status}"
                    >{room.statusLabel}</span
                  >
                </div>

                <div class="room-card-bottom">
                  <div>
                    <span class="room-meta-lbl">Nominal</span>
                    <span class="room-meta-val">{room.amount}</span>
                  </div>
                  <div>
                    <span class="room-meta-lbl">Tgl Bayar</span>
                    <span class="room-meta-val">{room.paidDate}</span>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</DashboardLayout>

<style>
  .mobile-only {
    display: none;
  }

  .finance-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .finance-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .finance-heading-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .finance-title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: #261a14;
  }

  .finance-subtitle {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .header-right-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .period-select {
    height: 36px;
    padding: 0 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-download-report {
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

  .btn-download-report:hover:not(:disabled) {
    background-color: #553c2a;
  }

  .btn-download-report:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .state-card,
  .empty-inline {
    padding: 24px 18px;
    text-align: center;
    color: #9e8b7c;
    font-size: 12px;
    background-color: #ffffff;
    border: 1px solid #ece3d9;
    border-radius: 12px;
  }

  .empty-inline {
    border: none;
    padding: 18px 8px;
  }

  .desktop-error-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 36px 16px 24px;
    gap: 16px;
  }

  .desktop-error-card {
    width: 100%;
    max-width: 390px;
    padding: 28px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
    text-align: center;
    box-sizing: border-box;
  }

  .error-icon-badge {
    width: 44px;
    height: 44px;
    margin: 0 auto 14px;
    border-radius: 999px;
    background-color: #fde8e8;
    color: #e11d48;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .desktop-error-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .desktop-error-desc {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: #8f7c6e;
  }

  .desktop-error-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-primary-brown {
    height: 34px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary-brown:hover {
    background-color: #553c2a;
  }

  .btn-secondary-outline {
    height: 34px;
    padding: 0 14px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-secondary-outline:hover {
    background-color: #faf6f1;
  }

  .desktop-kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .desktop-kpi-card {
    padding: 18px 20px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
    box-sizing: border-box;
  }

  .desktop-kpi-lbl {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #8c7b6e;
    margin-bottom: 10px;
  }

  .desktop-kpi-val {
    font-size: 26px;
    font-weight: 700;
    color: #261a14;
    line-height: 1.15;
    margin-bottom: 6px;
  }

  .desktop-kpi-sub {
    margin: 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .desktop-progress-track {
    margin-top: 10px;
    width: 100%;
    height: 5px;
    border-radius: 999px;
    background-color: #ece6df;
    overflow: hidden;
  }

  .desktop-progress-fill {
    height: 100%;
    border-radius: 999px;
    background-color: #15803d;
  }

  .desktop-chart-card {
    padding: 20px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .desktop-chart-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .desktop-chart-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .desktop-chart-unit {
    font-size: 11px;
    color: #9e8b7c;
  }

  .desktop-chart-cols {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 14px;
    align-items: end;
  }

  .desktop-chart-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .desktop-chart-num {
    font-size: 11px;
    color: #8f7c6e;
    font-weight: 500;
  }

  .desktop-chart-track {
    width: 100%;
    height: 120px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .desktop-chart-bar {
    width: 64px;
    max-width: 100%;
    border-radius: 6px;
    background-color: #ebe4dc;
    transition: height 0.2s ease;
  }

  .desktop-chart-bar.active {
    background-color: #5c432d;
  }

  .desktop-chart-month {
    font-size: 11px;
    color: #8f7c6e;
  }

  .desktop-chart-month.active {
    color: #261a14;
    font-weight: 700;
  }

  .desktop-table-card {
    padding: 20px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .desktop-table-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .desktop-table-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .desktop-table-period {
    font-size: 11px;
    color: #9e8b7c;
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .finance-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .finance-table th {
    padding: 10px 10px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
  }

  .finance-table td {
    padding: 12px 10px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
  }

  .cell-room {
    font-weight: 700;
    color: #261a14;
  }

  .cell-tenant {
    color: #261a14;
  }

  .cell-amount {
    font-weight: 500;
    color: #261a14;
  }

  .cell-muted {
    color: #8f7c6e;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .status-pill.paid {
    background-color: #dcfce7;
    color: #15803d;
  }

  .status-pill.pending,
  .status-pill.partial {
    background-color: #fef3c7;
    color: #b45309;
  }

  .status-pill.late {
    background-color: #ffe4e6;
    color: #e11d48;
  }

  .desktop-table-footnote {
    margin: 12px 0 14px;
    font-size: 10px;
    color: #9e8b7c;
  }

  .desktop-pagination-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pagination-info {
    font-size: 11px;
    color: #8f7c6e;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .page-indicator {
    font-size: 11px;
    color: #8f7c6e;
    margin-right: 4px;
  }

  .btn-page {
    height: 30px;
    padding: 0 12px;
    border: 1px solid #e4dad0;
    border-radius: 7px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-page:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: block;
    }

    .finance-page {
      gap: 14px;
    }

    .finance-header-row {
      margin-bottom: 2px;
    }

    .finance-heading-group {
      gap: 6px;
    }

    .finance-title {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.25;
    }

    .finance-subtitle {
      font-size: 12px;
      line-height: 1.5;
      color: #a88f7a;
    }

    .mobile-controls-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-period-select {
      width: 100%;
      height: 40px;
      padding: 0 14px;
      border: 1px solid #e6ddd2;
      border-radius: 10px;
      background-color: #ffffff;
      color: #8f7c6e;
      font-family: inherit;
      font-size: 13px;
      box-sizing: border-box;
    }

    .mobile-download-btn {
      width: 100%;
      height: 42px;
      border: none;
      border-radius: 10px;
      background-color: #684b36;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .mobile-download-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .mobile-error-wrap {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-top: 8px;
    }

    .mobile-error-card {
      padding: 28px 20px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
      text-align: center;
    }

    .mobile-error-title {
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 700;
      color: #261a14;
    }

    .mobile-error-desc {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: #9e8b7c;
    }

    .mobile-retry-btn {
      width: 100%;
      height: 42px;
      border: none;
      border-radius: 10px;
      background-color: #684b36;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .mobile-summary-stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mobile-kpi-card {
      padding: 16px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
    }

    .mobile-kpi-lbl {
      display: block;
      font-size: 12px;
      color: #9e8b7c;
      margin-bottom: 8px;
    }

    .mobile-kpi-val {
      font-size: 24px;
      font-weight: 700;
      color: #261a14;
      line-height: 1.2;
      margin-bottom: 6px;
    }

    .mobile-kpi-sub {
      margin: 0;
      font-size: 11px;
      color: #9e8b7c;
    }

    .mobile-progress-track {
      margin-top: 10px;
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background-color: #f3ece4;
      overflow: hidden;
    }

    .mobile-progress-fill {
      height: 100%;
      border-radius: 999px;
      background-color: #15803d;
    }

    .mobile-trend-card {
      padding: 16px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
    }

    .mobile-section-heading {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 700;
      color: #261a14;
    }

    .trend-bars-wrap {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      align-items: end;
      height: 104px;
    }

    .trend-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      height: 100%;
    }

    .trend-bar-track {
      flex: 1;
      width: 100%;
      max-width: 34px;
      display: flex;
      align-items: flex-end;
    }

    .trend-bar {
      width: 100%;
      border-radius: 6px;
      background-color: #f3ece4;
    }

    .trend-bar.active {
      background-color: #5c432d;
    }

    .trend-month {
      font-size: 10px;
      color: #9e8b7c;
    }

    .trend-month.active {
      color: #261a14;
      font-weight: 700;
    }

    .mobile-rooms-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .room-cards-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .room-card {
      padding: 14px 16px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
    }

    .room-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }

    .room-card-title {
      margin: 0 0 3px;
      font-size: 13px;
      font-weight: 700;
      color: #261a14;
    }

    .room-card-period {
      margin: 0;
      font-size: 11px;
      color: #a88f7a;
    }

    .room-card-bottom {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .room-meta-lbl {
      display: block;
      font-size: 10px;
      color: #a88f7a;
      margin-bottom: 2px;
    }

    .room-meta-val {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #261a14;
    }
  }
</style>
