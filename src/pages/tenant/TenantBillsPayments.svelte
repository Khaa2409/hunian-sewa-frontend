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
  let invoices = $state([]);

  /** @type {Array<Record<string, any>>} */
  let periodSourceInvoices = $state([]);

  /** @type {Record<string, any> | null} */
  let activeBill = $state(null);

  /** @type {Record<string, any> | null} */
  let selectedInvoice = $state(null);

  /** @type {'list' | 'checkout'} */
  let viewMode = $state("list");

  let selectedPeriod = $state("all");
  let currentPage = $state(1);
  const perPage = 10;
  let totalCount = $state(0);
  let totalPages = $state(1);

  let loading = $state(true);
  let isInitiatingPayment = $state(false);
  let errorMessage = $state("");
  let checkoutError = $state("");
  let feedbackMessage = $state("");

  /**
   * @param {string} msg
   */
  function notifyFeedback(msg) {
    feedbackMessage = msg;
    setTimeout(() => {
      if (feedbackMessage === msg) feedbackMessage = "";
    }, 4000);
  }

  /**
   * @param {any} amount
   */
  function formatRupiah(amount) {
    const num = Math.round(Number(amount ?? 0));
    if (!Number.isFinite(num)) return "Rp 0";
    const formatted = Math.abs(num)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${num < 0 ? "-" : ""}Rp ${formatted}`;
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
   * Mengonversi teks label/tanggal periode ke format YYYY-MM untuk server
   * @param {string} periodStr
   */
  function parsePeriodToQuery(periodStr) {
    if (!periodStr || periodStr === "all") return "";
    if (/^\d{4}-\d{2}$/.test(periodStr)) return periodStr;

    const parsed = new Date(periodStr);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      return `${year}-${month}`;
    }
    return "";
  }

  /**
   * @param {Record<string, any>} item
   */
  function getInvoiceId(item) {
    return item?.id ?? item?.invoice_id ?? "";
  }

  /**
   * @param {Record<string, any>} item
   */
  function getInvoiceNumber(item) {
    return (
      item?.invoice_number ||
      item?.invoice_code ||
      item?.number ||
      item?.code ||
      (item?.id ? `INV-${item.id}` : "-")
    );
  }

  /**
   * @param {Record<string, any>} item
   */
  function getPeriodLabel(item) {
    if (item?.period_label) return String(item.period_label);
    if (item?.period) return String(item.period);
    if (item?.billing_period) return String(item.billing_period);
    const rawDate =
      item?.period_start || item?.due_date || item?.billing_date || item?.created_at;
    if (!rawDate) return "-";
    const match = String(rawDate).match(/^(\d{4})-(\d{2})/);
    if (match) {
      const d = new Date(Number(match[1]), Number(match[2]) - 1, 1);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat("id-ID", {
          month: "long",
          year: "numeric",
        }).format(d);
      }
    }
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return String(rawDate);
    return new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
    }).format(parsed);
  }

  /**
   * @param {Record<string, any>} item
   */
  function getRoomNumber(item) {
    return (
      item?.room_number ||
      item?.room_code ||
      item?.contract?.room_number ||
      item?.room?.room_number ||
      profile?.room_number ||
      "-"
    );
  }

  /**
   * @param {Record<string, any>} item
   */
  function getTenantName(item) {
    return (
      item?.tenant_name ||
      item?.user_name ||
      item?.contract?.tenant_name ||
      profile?.name ||
      profile?.full_name ||
      "-"
    );
  }

  /**
   * @param {Record<string, any>} item
   */
  function getAmountValue(item) {
    const val =
      item?.total_amount ??
      item?.amount ??
      item?.total ??
      item?.monthly_rent ??
      item?.rent_price ??
      0;
    return Number(val) || 0;
  }

  /**
   * @param {Record<string, any>} item
   * @returns {'paid' | 'unpaid' | 'overdue'}
   */
  function normalizeInvoiceStatus(item) {
    const raw = String(item?.status || item?.payment_status || "")
      .trim()
      .toLowerCase();

    if (
      raw === "paid" ||
      raw === "lunas" ||
      raw === "settlement" ||
      raw === "capture" ||
      raw === "completed"
    ) {
      return "paid";
    }

    if (
      raw === "overdue" ||
      raw === "late" ||
      raw === "terlambat" ||
      raw === "expired"
    ) {
      return "overdue";
    }

    const dueRaw = item?.due_date;
    if (dueRaw) {
      const dueDate = new Date(dueRaw);
      if (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now()) {
        return "overdue";
      }
    }

    return "unpaid";
  }

  /**
   * @param {Record<string, any>} item
   */
  function getInvoiceStatusLabel(item) {
    if (item?.status_label && String(item.status_label).trim()) {
      return String(item.status_label).trim();
    }
    const st = normalizeInvoiceStatus(item);
    if (st === "paid") return "Lunas";
    if (st === "overdue") {
      const daysLate = Number(item?.overdue_days ?? item?.days_overdue ?? 0);
      return daysLate > 0 ? `Terlambat ${daysLate} hari` : "Terlambat";
    }
    return "Menunggu Pembayaran";
  }

  /**
   * @param {Record<string, any> | null | undefined} item
   * @returns {boolean}
   */
  function isUnpaidInvoice(item) {
    if (!item || typeof item !== "object") return false;
    return normalizeInvoiceStatus(item) !== "paid";
  }

  let periodOptions = $derived.by(() => {
    /** @type {Set<string>} */
    const set = new Set();
    const add = (/** @type {Record<string, any> | null | undefined} */ item) => {
      const p = getPeriodLabel(item);
      if (p && p !== "-") set.add(p);
    };
    add(activeBill);
    for (const inv of periodSourceInvoices) add(inv);
    for (const inv of invoices) add(inv);
    return Array.from(set);
  });

  /**
   * @param {Record<string, any> | null} [bill]
   */
  function openCheckoutView(bill) {
    const target = bill ?? activeBill;
    if (!target) return;
    selectedInvoice = target;
    checkoutError = "";
    viewMode = "checkout";
  }

  function backToBillingList() {
    viewMode = "list";
    checkoutError = "";
    fetchBillingData();
  }

  /**
   * @param {Record<string, any>} item
   */
  function openInvoiceDetail(item) {
    selectedInvoice = item;
    checkoutError = "";
    viewMode = "checkout";
  }

  function handlePeriodChange() {
    currentPage = 1;
    fetchBillingData();
  }

  // Ambil seluruh periode milik penyewa agar opsi dropdown tidak ikut tersaring
  async function fetchPeriodOptions() {
    try {
      const res = await apiRequest("/api/invoices?limit=100", { method: "GET" });
      /** @type {any} */
      const val = res;
      periodSourceInvoices = Array.isArray(val?.data)
        ? val.data
        : Array.isArray(val?.invoices)
          ? val.invoices
          : Array.isArray(val)
            ? val
            : [];
    } catch {
      periodSourceInvoices = [];
    }
  }

  async function fetchBillingData() {
    loading = true;
    errorMessage = "";
    const fallbackUser = get(currentUser);

    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(perPage));

      const pQuery = parsePeriodToQuery(selectedPeriod);
      if (pQuery) {
        params.set("periode", pQuery);
      }

      const [profileRes, invoicesRes] = await Promise.allSettled([
        apiRequest("/api/me", { method: "GET" }),
        apiRequest(`/api/invoices?${params.toString()}`, { method: "GET" }),
      ]);

      const pVal = profileRes.status === "fulfilled" ? profileRes.value : null;
      profile = pVal?.data ?? pVal?.user ?? pVal ?? fallbackUser ?? null;

      if (invoicesRes.status === "fulfilled") {
        /** @type {any} */
        const iVal = invoicesRes.value;
        const rawList = Array.isArray(iVal?.data)
          ? iVal.data
          : Array.isArray(iVal?.invoices)
            ? iVal.invoices
            : Array.isArray(iVal)
              ? iVal
              : [];

        invoices = rawList;

        const explicitActive =
          iVal?.active_invoice && typeof iVal.active_invoice === "object"
            ? iVal.active_invoice
            : iVal?.current_invoice && typeof iVal.current_invoice === "object"
              ? iVal.current_invoice
              : null;

        activeBill =
          explicitActive ||
          rawList.find((/** @type {any} */ inv) => isUnpaidInvoice(inv)) ||
          rawList[0] ||
          null;

        const meta = iVal?.meta || iVal?.pagination || {};
        totalCount = Number(meta.total ?? iVal?.total ?? rawList.length);
        totalPages = Math.max(
          1,
          Number(
            meta.total_pages ??
              meta.last_page ??
              Math.ceil(totalCount / perPage) ??
              1,
          ),
        );
      } else {
        const reason = /** @type {any} */ (invoicesRes.reason);
        invoices = [];
        activeBill = null;
        totalCount = 0;
        totalPages = 1;
        errorMessage =
          reason?.data?.pesan ||
          reason?.message ||
          "Gagal memuat data tagihan dan riwayat pembayaran.";
      }
    } catch (/** @type {any} */ err) {
      invoices = [];
      activeBill = null;
      totalCount = 0;
      totalPages = 1;
      errorMessage =
        err?.data?.pesan ||
        err?.message ||
        "Terjadi kesalahan saat memuat tagihan.";
    } finally {
      loading = false;
    }
  }

  /**
   * @param {any} paymentRes
   */
  async function handleMidtransResponse(paymentRes) {
    const data =
      paymentRes?.data && typeof paymentRes.data === "object"
        ? paymentRes.data
        : paymentRes || {};

    const snapToken =
      data?.snap_token || data?.token || paymentRes?.snap_token || "";
    const redirectUrl =
      data?.redirect_url ||
      data?.payment_url ||
      data?.snap_redirect_url ||
      paymentRes?.redirect_url ||
      "";

    const snapObj =
      typeof window !== "undefined" ? /** @type {any} */ (window).snap : null;

    if (snapToken && snapObj && typeof snapObj.pay === "function") {
      snapObj.pay(snapToken, {
        onSuccess: async () => {
          notifyFeedback("Pembayaran berhasil diproses.");
          viewMode = "list";
          await fetchBillingData();
        },
        onPending: async () => {
          notifyFeedback(
            "Pembayaran tertunda. Menyinkronkan status tagihan...",
          );
          viewMode = "list";
          await fetchBillingData();
        },
        onError: () => {
          checkoutError = "Pembayaran pada Midtrans gagal atau dibatalkan.";
        },
        onClose: async () => {
          await fetchBillingData();
        },
      });
      return;
    }

    if (redirectUrl && typeof window !== "undefined") {
      window.location.href = String(redirectUrl);
      return;
    }

    notifyFeedback("Transaksi pembayaran telah dibuat.");
    viewMode = "list";
    await fetchBillingData();
  }

  async function handlePayWithMidtrans() {
    if (!selectedInvoice || isInitiatingPayment) return;
    checkoutError = "";
    isInitiatingPayment = true;

    const invoiceId = getInvoiceId(selectedInvoice);

    try {
      const res = await apiRequest(
        `/api/invoices/${encodeURIComponent(invoiceId)}/pay`,
        {
          method: "POST",
          body: { payment_gateway: "midtrans" },
        },
      );

      await handleMidtransResponse(res);
    } catch (/** @type {any} */ err) {
      checkoutError =
        err?.data?.pesan ||
        err?.message ||
        "Gagal memulai transaksi pembayaran Midtrans.";
    } finally {
      isInitiatingPayment = false;
    }
  }

  onMount(() => {
    fetchBillingData();
    fetchPeriodOptions();
  });
</script>

<DashboardLayout
  role="tenant"
  activeKey="billing"
  ownerName={profile?.name || profile?.full_name || ""}
>
  {#if feedbackMessage}
    <div
      class="toast-banner"
      role="status"
      transition:fly={{ y: -12, duration: 200 }}
    >
      {feedbackMessage}
    </div>
  {/if}

  {#if viewMode === "checkout" && selectedInvoice}
    {@const billStatus = normalizeInvoiceStatus(selectedInvoice)}
    {@const totalAmt = getAmountValue(selectedInvoice)}
    <div in:fly={{ y: 14, duration: 220 }} class="page-stack">
      <div class="checkout-head-block">
        <h1 class="page-title">
          <span class="desktop-only-inline">Pembayaran Sewa</span>
          <span class="mobile-only-inline">Konfirmasi Pembayaran Sewa</span>
        </h1>
        <p class="page-subtitle">
          <span class="desktop-only-inline">
            Tinjau tagihan, lalu lanjutkan ke pembayaran
          </span>
          <span class="mobile-only-inline">
            Periksa rincian tagihan sebelum melanjutkan pembayaran
          </span>
        </p>
        <button type="button" class="btn-back-link" onclick={backToBillingList}>
          &larr; Kembali ke Tagihan &amp; Pembayaran
        </button>
      </div>

      {#if checkoutError}
        <div class="error-banner" role="alert">{checkoutError}</div>
      {/if}

      <div class="checkout-grid">
        <section class="surface-card" aria-label="Rincian tagihan">
          <div class="checkout-card-top">
            <h2 class="card-section-title">Rincian Tagihan</h2>
            <span class="status-badge {billStatus}">
              {getInvoiceStatusLabel(selectedInvoice)}
            </span>
          </div>

          <dl class="detail-kv-list">
            <div class="detail-kv-row">
              <dt>Nomor tagihan</dt>
              <dd class="val-strong">{getInvoiceNumber(selectedInvoice)}</dd>
            </div>
            <div class="detail-kv-row">
              <dt>Periode</dt>
              <dd>{getPeriodLabel(selectedInvoice)}</dd>
            </div>
            <div class="detail-kv-row">
              <dt>Kamar</dt>
              <dd>{getRoomNumber(selectedInvoice)}</dd>
            </div>
            <div class="detail-kv-row">
              <dt>Penyewa</dt>
              <dd>{getTenantName(selectedInvoice)}</dd>
            </div>
            <div class="detail-kv-row">
              <dt>Tanggal jatuh tempo</dt>
              <dd>{formatTanggal(selectedInvoice.due_date)}</dd>
            </div>
          </dl>

          <div class="detail-total-row desktop-only-flex">
            <span class="total-label-sm">Total tagihan</span>
            <span class="total-amount-lg nowrap-money">
              {formatRupiah(totalAmt)}
            </span>
          </div>
        </section>

        <aside class="surface-card" aria-label="Ringkasan pembayaran">
          <h2 class="card-section-title checkout-summary-title">
            Ringkasan Pembayaran
          </h2>

          <dl class="detail-kv-list compact">
            <div class="detail-kv-row">
              <dt>Tarif Sewa Bulanan</dt>
              <dd class="nowrap-money">{formatRupiah(totalAmt)}</dd>
            </div>
            <div class="detail-kv-row desktop-only-flex">
              <dt>Kamar</dt>
              <dd>{getRoomNumber(selectedInvoice)}</dd>
            </div>
          </dl>

          <div class="summary-due-row">
            <span class="summary-due-label">
              <span class="desktop-only-inline">Total dibayar</span>
              <span class="mobile-only-inline">Total Pembayaran</span>
            </span>
            <span class="summary-due-val nowrap-money">
              {formatRupiah(totalAmt)}
            </span>
          </div>

          <div class="checkout-actions">
            <button
              type="button"
              class="btn-outline checkout-cancel-btn"
              onclick={backToBillingList}
              disabled={isInitiatingPayment}
            >
              Batal
            </button>
            {#if isUnpaidInvoice(selectedInvoice)}
              <button
                type="button"
                class="btn-brown checkout-pay-btn"
                onclick={handlePayWithMidtrans}
                disabled={isInitiatingPayment}
              >
                <span class="desktop-only-inline">
                  {isInitiatingPayment ? "Memproses..." : "Bayar"}
                </span>
                <span class="mobile-only-inline">
                  {isInitiatingPayment
                    ? "Memproses..."
                    : `Bayar Sekarang · ${formatRupiah(totalAmt)}`}
                </span>
              </button>
            {/if}
          </div>
        </aside>
      </div>
    </div>
  {:else}
    <div in:fade={{ duration: 200 }} class="page-stack">
      <div class="page-head-block">
        <h1 class="page-title">Tagihan &amp; Pembayaran</h1>
        <p class="page-subtitle">Tagihan sewa berjalan dan pembayarannya</p>
      </div>

      {#if loading}
        <div class="surface-card">
          <p class="muted-text">Memuat data tagihan dan pembayaran...</p>
        </div>
      {:else if errorMessage}
        <div class="error-box" role="alert">
          <div class="error-row">
            <div>
              <p class="error-title">Gagal memuat tagihan</p>
              <p class="error-desc">{errorMessage}</p>
            </div>
            <button type="button" class="btn-brown" onclick={fetchBillingData}>
              Coba Lagi
            </button>
          </div>
        </div>
      {:else}
        <!-- Ringkasan Pembayaran / Tagihan Berjalan -->
        <section
          class="surface-card summary-card"
          aria-label="Ringkasan Pembayaran"
        >
          <div class="summary-top-row">
            <h2 class="card-section-title">
              <span class="desktop-only-inline">Ringkasan Pembayaran</span>
              <span class="mobile-only-inline">
                Tagihan {getPeriodLabel(activeBill || {})}
              </span>
            </h2>
            {#if activeBill}
              <span class="status-badge {normalizeInvoiceStatus(activeBill)}">
                {getInvoiceStatusLabel(activeBill)}
              </span>
            {/if}
          </div>

          {#if activeBill}
            <div class="summary-meta-stack desktop-only-flex">
              <div class="summary-meta-line">
                <span class="meta-key">Nomor Tagihan</span>
                <span class="meta-val-right">
                  {getInvoiceNumber(activeBill)}
                </span>
              </div>
              <div class="summary-meta-line">
                <span class="meta-key">Jatuh Tempo</span>
                <span class="meta-val-right">
                  {formatTanggal(activeBill.due_date)}
                </span>
              </div>
              <div class="summary-meta-line">
                <span class="meta-key">Kamar</span>
                <span class="meta-val-right">
                  {getRoomNumber(activeBill)}
                </span>
              </div>
            </div>

            <div class="summary-bottom-bar">
              <div class="summary-total-row">
                <span class="total-sub desktop-only-inline">Total dibayar</span>
                <strong class="total-amount-xl nowrap-money">
                  {formatRupiah(getAmountValue(activeBill))}
                </strong>
              </div>

              <span class="mobile-bill-sub mobile-only-inline">
                Kamar {getRoomNumber(activeBill)} &middot; {getInvoiceNumber(
                  activeBill,
                )}
              </span>
              <span class="mobile-bill-due mobile-only-inline">
                Jatuh tempo: {formatTanggal(activeBill.due_date)}
              </span>

              {#if isUnpaidInvoice(activeBill)}
                <div class="summary-cta-group">
                  <button
                    type="button"
                    class="btn-outline"
                    onclick={() => (activeBill = null)}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    class="btn-brown mobile-full-btn"
                    onclick={() => openCheckoutView(activeBill)}
                  >
                    Lanjutkan ke Pembayaran
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <p class="muted-text">
              Tidak ada tagihan sewa berjalan yang perlu dibayar saat ini.
            </p>
          {/if}
        </section>

        <!-- Riwayat Pembayaran -->
        <section
          class="surface-card history-card"
          aria-label="Riwayat Pembayaran"
        >
          <div class="history-top-bar">
            <h2 class="card-section-title">Riwayat Pembayaran</h2>

            <select
              class="period-select"
              bind:value={selectedPeriod}
              onchange={handlePeriodChange}
              aria-label="Filter periode riwayat pembayaran"
            >
              <option value="all">Periode: Semua</option>
              {#each periodOptions as period}
                <option value={period}>{period}</option>
              {/each}
            </select>
          </div>

          <!-- Desktop Table -->
          <div class="table-scroll desktop-table-wrap">
            <table class="billing-table">
              <thead>
                <tr>
                  <th>Periode</th>
                  <th>Nominal</th>
                  <th>Tgl Pembayaran</th>
                  <th>Status</th>
                  <th>Nomor Tagihan</th>
                  <th class="th-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {#if invoices.length === 0}
                  <tr>
                    <td colspan="6" class="td-empty">
                      Belum ada riwayat pembayaran.
                    </td>
                  </tr>
                {:else}
                  {#each invoices as inv, idx (getInvoiceId(inv) || idx)}
                    {@const st = normalizeInvoiceStatus(inv)}
                    <tr>
                      <td class="td-period">{getPeriodLabel(inv)}</td>
                      <td class="td-amount nowrap-money">
                        {formatRupiah(getAmountValue(inv))}
                      </td>
                      <td class="td-date">
                        {inv.paid_at || inv.payment_date
                          ? formatTanggal(inv.paid_at || inv.payment_date)
                          : "-"}
                      </td>
                      <td>
                        <span class="status-badge {st}">
                          {getInvoiceStatusLabel(inv)}
                        </span>
                      </td>
                      <td class="td-inv">{getInvoiceNumber(inv)}</td>
                      <td class="td-right">
                        <button
                          type="button"
                          class="btn-detail-sm"
                          onclick={() => openInvoiceDetail(inv)}
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>

          <!-- Mobile History Cards -->
          <div class="mobile-history-list">
            {#if invoices.length === 0}
              <p class="muted-text">Belum ada riwayat pembayaran.</p>
            {:else}
              {#each invoices as inv, idx (getInvoiceId(inv) || idx)}
                {@const st = normalizeInvoiceStatus(inv)}
                <button
                  type="button"
                  class="mobile-inv-card"
                  onclick={() => openInvoiceDetail(inv)}
                >
                  <div class="mobile-inv-head">
                    <div>
                      <span class="mobile-inv-date">
                        {inv.paid_at || inv.payment_date
                          ? formatTanggal(inv.paid_at || inv.payment_date)
                          : getPeriodLabel(inv)}
                      </span>
                      <span class="mobile-inv-code">
                        {getInvoiceNumber(inv)}
                      </span>
                    </div>
                    <span class="status-badge {st}">
                      {getInvoiceStatusLabel(inv)}
                    </span>
                  </div>

                  <div class="mobile-inv-grid">
                    <div>
                      <span class="mobile-kv-lbl">Nominal</span>
                      <span class="mobile-kv-val nowrap-money">
                        {formatRupiah(getAmountValue(inv))}
                      </span>
                    </div>
                    <div>
                      <span class="mobile-kv-lbl">Kamar</span>
                      <span class="mobile-kv-val">
                        {getRoomNumber(inv)}
                      </span>
                    </div>
                  </div>
                </button>
              {/each}
            {/if}
          </div>

          <div class="pagination-bar">
            <span class="pagination-info">
              {#if totalCount > 0}
                Menampilkan {(currentPage - 1) * perPage + 1}&ndash;{Math.min(
                  currentPage * perPage,
                  totalCount,
                )} dari {totalCount} tagihan
              {:else}
                Menampilkan 0 tagihan
              {/if}
            </span>

            <div class="pagination-btns">
              <span class="pagination-info">
                Halaman {currentPage} dari {totalPages}
              </span>
              <button
                type="button"
                class="page-btn"
                onclick={() => {
                  if (currentPage > 1) {
                    currentPage -= 1;
                    fetchBillingData();
                  }
                }}
                disabled={currentPage <= 1}
              >
                Sebelumnya
              </button>
              <button
                type="button"
                class="page-btn"
                onclick={() => {
                  if (currentPage < totalPages) {
                    currentPage += 1;
                    fetchBillingData();
                  }
                }}
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
</DashboardLayout>

<style>
  .page-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .page-head-block,
  .checkout-head-block {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .page-title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    color: #231f1e;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .page-subtitle {
    margin: 0;
    font-size: 12.5px;
    color: #8e7e6e;
    line-height: 1.45;
  }

  .nowrap-money {
    white-space: nowrap;
  }

  .desktop-only-inline {
    display: inline;
  }

  .desktop-only-flex {
    display: flex;
  }

  .mobile-only-inline,
  .mobile-history-list {
    display: none;
  }

  .surface-card {
    background-color: #ffffff;
    border: 1px solid #eae2d7;
    border-radius: 14px;
    padding: 18px 20px;
    box-sizing: border-box;
  }

  .summary-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .card-section-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #231f1e;
  }

  .checkout-summary-title {
    margin-bottom: 10px;
  }

  .summary-meta-stack {
    margin-top: 10px;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .summary-meta-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
  }

  .meta-key {
    color: #9e8b7c;
  }

  .meta-val-right {
    font-weight: 600;
    color: #231f1e;
  }

  .summary-bottom-bar {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #f2ece4;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }

  .summary-total-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }

  .total-sub {
    font-size: 12px;
    font-weight: 600;
    color: #231f1e;
  }

  .total-amount-xl {
    font-size: 24px;
    font-weight: 800;
    color: #231f1e;
    letter-spacing: -0.02em;
  }

  .summary-cta-group {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    width: 100%;
  }

  .history-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .period-select {
    height: 34px;
    padding: 0 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #231f1e;
    font-size: 12px;
    cursor: pointer;
  }

  .table-scroll {
    width: 100%;
    overflow-x: auto;
  }

  .billing-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .billing-table th {
    padding: 8px 10px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
    white-space: nowrap;
  }

  .billing-table td {
    padding: 10px 10px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
    color: #231f1e;
    vertical-align: middle;
  }

  .td-period,
  .td-amount,
  .td-inv {
    font-weight: 600;
  }

  .td-date {
    color: #8e7e6e !important;
  }

  .td-empty {
    text-align: center;
    padding: 20px 10px !important;
    color: #8e7e6e !important;
  }

  .th-right,
  .td-right {
    text-align: right;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .status-badge.paid {
    background-color: #dcfce7;
    color: #15803d;
  }

  .status-badge.unpaid {
    background-color: #fef3c7;
    color: #b45309;
  }

  .status-badge.overdue {
    background-color: #fde8e8;
    color: #c62828;
  }

  .btn-detail-sm {
    height: 28px;
    padding: 0 12px;
    border: 1px solid #e2d8cd;
    border-radius: 6px;
    background-color: #ffffff;
    color: #231f1e;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-detail-sm:hover {
    background-color: #faf7f2;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 12px;
    flex-wrap: wrap;
  }

  .pagination-info {
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-btns {
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
    color: #231f1e;
    font-size: 11px;
    cursor: pointer;
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Checkout / Detail View */
  .btn-back-link {
    margin-top: 2px;
    align-self: flex-start;
    border: none;
    background: transparent;
    padding: 0;
    font-size: 12px;
    font-weight: 500;
    color: #8e7e6e;
    cursor: pointer;
  }

  .checkout-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(280px, 1fr);
    gap: 16px;
    align-items: start;
  }

  .checkout-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .detail-kv-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .detail-kv-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
  }

  .detail-kv-row dt {
    color: #9e8b7c;
  }

  .detail-kv-row dd {
    margin: 0;
    font-weight: 600;
    color: #231f1e;
  }

  .val-strong {
    font-weight: 700 !important;
  }

  .detail-total-row {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #f2ece4;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .total-label-sm {
    font-size: 12px;
    font-weight: 600;
    color: #231f1e;
  }

  .total-amount-lg {
    font-size: 18px;
    font-weight: 800;
    color: #231f1e;
  }

  .summary-due-row {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #f2ece4;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .summary-due-label {
    font-size: 12px;
    font-weight: 600;
    color: #231f1e;
  }

  .summary-due-val {
    font-size: 16px;
    font-weight: 800;
    color: #231f1e;
  }

  .checkout-actions {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
  }

  .checkout-pay-btn,
  .checkout-cancel-btn {
    width: 100%;
    height: 36px;
    box-sizing: border-box;
  }

  .btn-brown {
    background-color: #5a3e28;
    color: #ffffff;
    border: 1px solid #5a3e28;
    border-radius: 8px;
    padding: 8px 15px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-brown:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-outline {
    background-color: #ffffff;
    color: #231f1e;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .toast-banner {
    position: fixed;
    top: 76px;
    right: 24px;
    z-index: 90;
    padding: 10px 16px;
    border-radius: 10px;
    background-color: #261a14;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
  }

  .error-banner {
    padding: 10px 14px;
    border-radius: 8px;
    background-color: #fde8e8;
    border: 1px solid #f8b4b4;
    color: #9b1c1c;
    font-size: 12px;
  }

  .muted-text {
    margin: 0;
    font-size: 12.5px;
    color: #8e7e6e;
  }

  .error-box {
    background-color: #fdf4f4;
    border: 1px solid #e8c4c4;
    border-radius: 14px;
    padding: 16px 18px;
    color: #9e2a2b;
  }

  .error-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .error-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 700;
  }

  .error-desc {
    margin: 3px 0 0;
    font-size: 12px;
    color: #7e2223;
  }

  @media (max-width: 900px) {
    .desktop-only-inline,
    .desktop-only-flex,
    .desktop-table-wrap {
      display: none;
    }

    .mobile-only-inline {
      display: inline;
    }

    .mobile-history-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .surface-card {
      padding: 16px;
    }

    .summary-bottom-bar {
      margin-top: 12px;
      padding-top: 0;
      border-top: none;
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .summary-total-row {
      justify-content: flex-start;
    }

    .total-amount-xl {
      font-size: 22px;
    }

    .mobile-bill-sub {
      font-size: 11px;
      color: #8e7e6e;
    }

    .mobile-bill-due {
      font-size: 11px;
      color: #9e8b7c;
    }

    .summary-cta-group {
      width: 100%;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box;
    }

    .summary-cta-group .btn-outline,
    .summary-cta-group .btn-brown,
    .mobile-full-btn {
      width: 100%;
      box-sizing: border-box;
    }

    .mobile-inv-card {
      display: block;
      width: 100%;
      text-align: left;
      background-color: #ffffff;
      border: 1px solid #eae2d7;
      border-radius: 12px;
      padding: 14px;
      cursor: pointer;
      font-family: inherit;
      color: inherit;
      box-sizing: border-box;
    }

    .mobile-inv-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .mobile-inv-date {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: #231f1e;
    }

    .mobile-inv-code {
      display: block;
      font-size: 11px;
      color: #8e7e6e;
      margin-top: 2px;
    }

    .mobile-inv-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .mobile-kv-lbl {
      display: block;
      font-size: 10.5px;
      color: #9e8b7c;
    }

    .mobile-kv-val {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #231f1e;
      margin-top: 2px;
    }

    .checkout-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }

    .checkout-actions {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }

    .checkout-pay-btn,
    .checkout-cancel-btn {
      height: 38px;
    }
  }
</style>
