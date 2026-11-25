<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  /**
   * @typedef {Object} WardItem
   * @property {string | number} id
   * @property {string} name
   * @property {string} roomNumber
   */

  /**
   * @typedef {Object} AnnouncementItem
   * @property {string | number} id
   * @property {string} title
   * @property {string} subtitle
   * @property {string} dateLabel
   * @property {'urgent' | 'routine'} tagType
   * @property {string} tagLabel
   */

  /**
   * @typedef {Object} PaymentHistoryItem
   * @property {string | number} id
   * @property {string} period
   * @property {string} amount
   * @property {string} paidDate
   * @property {string} statusLabel
   */

  /** @type {WardItem[]} */
  let wards = $state([]);

  let selectedWardId = $state("");
  let loading = $state(true);
  let errorMsg = $state("");

  let billTitle = $state("Tagihan");
  let mobileBillTitle = $state("Tagihan");
  let dueDateText = $state("–");
  let dueBadgeText = $state("");
  let mobileDueBadgeText = $state("");
  let billAmountText = $state("Rp 0");
  let hasUnpaidBill = $state(false);

  /** @type {AnnouncementItem[]} */
  let announcements = $state([]);

  /** @type {PaymentHistoryItem[]} */
  let paymentHistory = $state([]);

  let displayGuardianName = $derived($currentUser?.name || "Wali");
  let displayGuardianRole = $derived.by(() => {
    const r = String($currentUser?.role || "guardian").toLowerCase();
    if (r === "guardian") return "Wali";
    return $currentUser?.role || "Wali";
  });

  let activeWard = $derived.by(() => {
    return (
      wards.find((w) => String(w.id) === String(selectedWardId)) ||
      wards[0] ||
      null
    );
  });

  /**
   * @param {any} val
   */
  function formatRupiah(val) {
    if (typeof val === "string" && val.trim().startsWith("Rp"))
      return val.trim();
    const num = Number(String(val ?? 0).replace(/[^\d.-]/g, ""));
    return `Rp ${(Number.isFinite(num) ? num : 0).toLocaleString("id-ID")}`;
  }

  /**
   * @param {any} dateInput
   */
  function formatShortDate(dateInput) {
    if (!dateInput) return "–";
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  /**
   * @param {any} raw
   * @param {number} idx
   * @returns {AnnouncementItem}
   */
  function normalizeAnnouncement(raw, idx) {
    const priorityRaw = String(
      raw?.priority ?? raw?.type ?? raw?.category ?? "",
    ).toLowerCase();
    const isUrgent =
      priorityRaw.includes("urgent") ||
      priorityRaw.includes("mendesak") ||
      priorityRaw.includes("darurat") ||
      Boolean(raw?.is_urgent);

    const dateRaw = raw?.published_at || raw?.created_at || raw?.date || "";
    const timeOrMeta = raw?.meta || raw?.schedule || raw?.location || "";
    const formattedDate = formatShortDate(dateRaw);

    return {
      id: raw?.id ?? idx + 1,
      title: raw?.title || "Pengumuman Kos",
      subtitle:
        raw?.subtitle ||
        (formattedDate !== "–" && timeOrMeta
          ? `${formattedDate} · ${timeOrMeta}`
          : formattedDate !== "–"
            ? formattedDate
            : timeOrMeta),
      dateLabel: raw?.date_label || formattedDate,
      tagType: isUrgent ? "urgent" : "routine",
      tagLabel: isUrgent ? "Urgent" : "Rutin",
    };
  }

  /**
   * @param {any} raw
   * @param {number} idx
   * @returns {PaymentHistoryItem}
   */
  function normalizePayment(raw, idx) {
    return {
      id: raw?.id ?? idx + 1,
      period: raw?.period_label || raw?.period || raw?.month_label || "–",
      amount:
        raw?.amount_rupiah ||
        formatRupiah(raw?.amount ?? raw?.gross_amount ?? 0),
      paidDate: formatShortDate(
        raw?.paid_at || raw?.payment_date || raw?.paidDate,
      ),
      statusLabel: raw?.status_label || raw?.status || "Lunas",
    };
  }

  function resetDashboardState() {
    billTitle = "Tagihan";
    mobileBillTitle = "Tagihan";
    dueDateText = "–";
    dueBadgeText = "";
    mobileDueBadgeText = "";
    billAmountText = "Rp 0";
    hasUnpaidBill = false;
    announcements = [];
    paymentHistory = [];
  }

  /**
   * @param {any} payload
   */
  function applyGuardianPayload(payload) {
    const root =
      payload?.data && typeof payload.data === "object"
        ? payload.data
        : payload;
    if (!root || typeof root !== "object") {
      resetDashboardState();
      return;
    }

    if (Array.isArray(root.wards) && root.wards.length > 0) {
      wards = root.wards.map(
        (/** @type {any} */ w, /** @type {number} */ idx) => ({
          id: String(w.id ?? w.tenant_id ?? idx + 1),
          name: w.name || w.tenant_name || "Penyewa",
          roomNumber: w.room_number || w.room?.room_number || "-",
        }),
      );

      if (
        !selectedWardId ||
        !wards.some((w) => String(w.id) === String(selectedWardId))
      ) {
        selectedWardId = String(wards[0].id);
      }
    }

    const currentWard =
      wards.find((w) => String(w.id) === String(selectedWardId)) ||
      wards[0] ||
      null;
    const wardName = currentWard?.name || "";

    const bill = root.current_bill || root.bill || root.invoice || null;
    if (bill && typeof bill === "object") {
      const rawBillLabel = bill.title || bill.period_label || "Tagihan";
      billTitle = rawBillLabel;
      mobileBillTitle = wardName
        ? `${rawBillLabel} · ${wardName}`
        : rawBillLabel;
      dueDateText = bill.due_date_text
        ? bill.due_date_text
        : bill.due_date
          ? `Jatuh tempo: ${formatShortDate(bill.due_date)}`
          : "–";
      dueBadgeText = bill.due_badge || "";
      mobileDueBadgeText = bill.mobile_due_badge || bill.due_badge || "";
      billAmountText = bill.amount_rupiah || formatRupiah(bill.amount ?? 0);
      hasUnpaidBill =
        bill.has_unpaid !== undefined ? Boolean(bill.has_unpaid) : false;
    } else {
      billTitle = "Tagihan";
      mobileBillTitle = wardName ? `Tagihan · ${wardName}` : "Tagihan";
      dueDateText = "–";
      dueBadgeText = "";
      mobileDueBadgeText = "";
      billAmountText = "Rp 0";
      hasUnpaidBill = false;
    }

    const rawAnnouncements = Array.isArray(root.announcements)
      ? root.announcements
      : [];
    announcements = rawAnnouncements.slice(0, 3).map(normalizeAnnouncement);

    const rawPayments = Array.isArray(root.payment_history)
      ? root.payment_history
      : Array.isArray(root.payments)
        ? root.payments
        : [];
    paymentHistory = rawPayments.slice(0, 3).map(normalizePayment);
  }

  async function fetchGuardianDashboard() {
    loading = true;
    errorMsg = "";

    try {
      const query = selectedWardId
        ? `?ward_id=${encodeURIComponent(selectedWardId)}`
        : "";
      /** @type {any} */
      const res = await apiRequest(`/api/guardian/dashboard${query}`);
      applyGuardianPayload(res);
    } catch (/** @type {any} */ err) {
      resetDashboardState();
      errorMsg = err?.message || "Gagal memuat data dashboard wali.";
    } finally {
      loading = false;
    }
  }

  /**
   * @param {string} hashPath
   */
  function goToPath(hashPath) {
    if (typeof window !== "undefined") {
      window.location.hash = hashPath;
    }
  }

  /**
   * @param {{ href?: string }} item
   */
  function handleNavigate(item) {
    if (!item?.href || typeof window === "undefined") return;
    window.location.hash = `#${item.href}`;
  }

  function handleWardChange() {
    fetchGuardianDashboard();
  }

  onMount(() => {
    fetchGuardianDashboard();
  });
</script>

<DashboardLayout
  activeKey="dashboard"
  role="guardian"
  ownerName={displayGuardianName}
  ownerRole={displayGuardianRole}
  onNavigate={handleNavigate}
>
  <div
    class="guardian-home-page"
    in:fly={{ y: 16, duration: 250, easing: cubicOut }}
  >
    <!-- DESKTOP HEADER & WARD SELECTOR -->
    <div class="desktop-header-row desktop-only">
      <div>
        <h1 class="desktop-title">Halo, {displayGuardianName}</h1>
        <p class="desktop-subtitle">
          {#if activeWard}
            Memantau pembayaran sewa {activeWard.name} · Kamar {activeWard.roomNumber}
          {:else}
            Memantau pembayaran sewa anak perwalian
          {/if}
        </p>
      </div>

      {#if wards.length > 0}
        <div class="ward-select-wrap">
          <select
            class="ward-select"
            bind:value={selectedWardId}
            onchange={handleWardChange}
            aria-label="Pilih penyewa perwalian"
            disabled={loading}
          >
            {#each wards as ward (ward.id)}
              <option value={ward.id}>Penyewa: {ward.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- MOBILE HEADER & WARD SELECTOR -->
    <div class="mobile-only mobile-header-block">
      <h1 class="mobile-title">Beranda Wali</h1>
      <p class="mobile-subtitle">
        Pantau tagihan sewa dan pengumuman kos anak perwalian.
      </p>

      {#if wards.length > 0}
        <label class="mobile-ward-lbl" for="mobile-ward-select"
          >Anak Perwalian</label
        >
        <select
          id="mobile-ward-select"
          class="mobile-ward-select"
          bind:value={selectedWardId}
          onchange={handleWardChange}
          disabled={loading}
        >
          {#each wards as ward (ward.id)}
            <option value={ward.id}
              >{ward.name} · Kamar {ward.roomNumber}</option
            >
          {/each}
        </select>
      {/if}
    </div>

    {#if errorMsg}
      <div class="error-banner" role="alert" in:fade={{ duration: 160 }}>
        <span>{errorMsg}</span>
        <button type="button" class="retry-btn" onclick={fetchGuardianDashboard}
          >Coba Lagi</button
        >
      </div>
    {/if}

    <!-- DESKTOP TOP GRID: PENGINGAT JATUH TEMPO & AKSI CEPAT -->
    <div class="desktop-top-grid desktop-only" in:fade={{ duration: 160 }}>
      <section class="surface-card due-card" aria-label="Pengingat Jatuh Tempo">
        <div class="due-card-top">
          <span class="due-heading">Pengingat Jatuh Tempo</span>
          {#if hasUnpaidBill && dueBadgeText}
            <span class="due-badge">{dueBadgeText}</span>
          {/if}
        </div>

        <p class="due-period">{billTitle}</p>
        <div class="due-date-main">{loading ? "Memuat..." : dueDateText}</div>

        <div class="due-actions">
          {#if hasUnpaidBill}
            <button
              type="button"
              class="btn-brown-sm"
              onclick={() => goToPath("#/guardian/bills")}
            >
              Bayar Sewa
            </button>
          {/if}
          <button
            type="button"
            class="btn-link-muted"
            onclick={() => goToPath("#/guardian/bills")}
          >
            Lihat rincian biaya
          </button>
        </div>
      </section>

      <section class="surface-card quick-card" aria-label="Aksi Cepat">
        <h2 class="card-section-title">Aksi Cepat</h2>
        <div class="quick-btn-stack">
          <button
            type="button"
            class="btn-brown-full"
            onclick={() => goToPath("#/guardian/bills")}
          >
            Bayar Sewa
          </button>
          <button
            type="button"
            class="btn-outline-full"
            onclick={() => goToPath("#/guardian/bills")}
          >
            Lihat Riwayat Pembayaran
          </button>
        </div>
      </section>
    </div>

    <!-- MOBILE BILL CARD & AKSI CEPAT -->
    <div class="mobile-only mobile-stack" in:fade={{ duration: 160 }}>
      <section
        class="surface-card mobile-bill-card"
        aria-label="Tagihan Anak Perwalian"
      >
        <div class="mobile-bill-top">
          <span class="mobile-bill-sub">{mobileBillTitle}</span>
          {#if hasUnpaidBill && mobileDueBadgeText}
            <span class="due-badge">{mobileDueBadgeText}</span>
          {/if}
        </div>

        <div class="mobile-bill-amount">
          {loading ? "Memuat..." : billAmountText}
        </div>

        <button
          type="button"
          class="btn-brown-full"
          onclick={() => goToPath("#/guardian/bills")}
        >
          Bayar Sewa
        </button>
      </section>

      <section class="surface-card mobile-quick-card" aria-label="Aksi Cepat">
        <h2 class="card-section-title">Aksi Cepat</h2>
        <div class="quick-btn-stack">
          <button
            type="button"
            class="btn-brown-full"
            onclick={() => goToPath("#/guardian/bills")}
          >
            Lihat Riwayat Pembayaran
          </button>
          <button
            type="button"
            class="btn-outline-full"
            onclick={() => goToPath("#/guardian/announcements")}
          >
            Lihat Pengumuman
          </button>
        </div>
      </section>
    </div>

    <!-- PENGUMUMAN TERKINI -->
    <section
      class="surface-card"
      aria-label="Pengumuman Terkini"
      in:fade={{ duration: 160 }}
    >
      <div class="section-head">
        <h2 class="card-section-title">Pengumuman Terkini</h2>
        <a
          href="#/guardian/announcements"
          class="see-all-link"
          onclick={(e) => {
            e.preventDefault();
            goToPath("#/guardian/announcements");
          }}
        >
          Lihat semua &rarr;
        </a>
      </div>

      {#if loading}
        <div class="empty-msg">Memuat pengumuman...</div>
      {:else if announcements.length === 0}
        <div class="empty-msg">Belum ada pengumuman terbaru.</div>
      {:else}
        <div class="announcement-list">
          {#each announcements as item (item.id)}
            <div class="announcement-row">
              <div class="announcement-left">
                <span class="tag-pill {item.tagType}">{item.tagLabel}</span>
                <div class="announcement-text-group">
                  <span class="announcement-title">{item.title}</span>
                  {#if item.subtitle}
                    <span class="mobile-only announcement-sub"
                      >{item.subtitle}</span
                    >
                  {/if}
                </div>
              </div>
              <span class="desktop-only announcement-date"
                >{item.dateLabel}</span
              >
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- RIWAYAT PEMBAYARAN (DESKTOP & MOBILE) -->
    <section
      class="surface-card"
      aria-label="Riwayat Pembayaran"
      in:fade={{ duration: 160 }}
    >
      <div class="section-head">
        <h2 class="card-section-title">Riwayat Pembayaran</h2>
        <a
          href="#/guardian/bills"
          class="see-all-link"
          onclick={(e) => {
            e.preventDefault();
            goToPath("#/guardian/bills");
          }}
        >
          Lihat semua &rarr;
        </a>
      </div>

      {#if loading}
        <div class="empty-msg">Memuat riwayat pembayaran...</div>
      {:else if paymentHistory.length === 0}
        <div class="empty-msg">Belum ada riwayat pembayaran.</div>
      {:else}
        <div class="table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>Periode</th>
                <th>Nominal</th>
                <th>Tgl Pembayaran</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each paymentHistory as row (row.id)}
                <tr>
                  <td class="cell-strong">{row.period}</td>
                  <td>{row.amount}</td>
                  <td class="cell-muted">{row.paidDate}</td>
                  <td>
                    <span class="status-paid">{row.statusLabel}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>
</DashboardLayout>

<style>
  .mobile-only {
    display: none;
  }

  .guardian-home-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .desktop-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .desktop-title {
    margin: 0 0 4px;
    font-size: 26px;
    font-weight: 700;
    color: #261a14;
    letter-spacing: -0.01em;
  }

  .desktop-subtitle {
    margin: 0;
    font-size: 12px;
    color: #9e8b7c;
  }

  .ward-select-wrap {
    flex-shrink: 0;
  }

  .ward-select {
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

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid #f2c6c2;
    background-color: #fdecec;
    color: #b71c1c;
    font-size: 12px;
  }

  .retry-btn {
    height: 30px;
    padding: 0 12px;
    border: 1px solid #d9827b;
    border-radius: 6px;
    background-color: #ffffff;
    color: #b71c1c;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .desktop-top-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
    gap: 18px;
  }

  .surface-card {
    padding: 20px 22px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
    box-sizing: border-box;
  }

  .due-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .due-heading {
    font-size: 12px;
    font-weight: 600;
    color: #7c6858;
  }

  .due-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    background-color: #fef3c7;
    color: #b45309;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .due-period {
    margin: 0 0 6px;
    font-size: 12px;
    color: #9e8b7c;
  }

  .due-date-main {
    font-size: 24px;
    font-weight: 700;
    color: #261a14;
    line-height: 1.25;
    margin-bottom: 16px;
  }

  .due-actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .card-section-title {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .quick-btn-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .btn-brown-sm {
    height: 34px;
    padding: 0 14px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-brown-sm:hover {
    background-color: #553c2a;
  }

  .btn-link-muted {
    padding: 0;
    border: none;
    background: transparent;
    color: #7c6858;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-link-muted:hover {
    color: #261a14;
    text-decoration: underline;
  }

  .btn-brown-full {
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

  .btn-brown-full:hover {
    background-color: #553c2a;
  }

  .btn-outline-full {
    width: 100%;
    height: 38px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-outline-full:hover {
    background-color: #faf7f2;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .section-head .card-section-title {
    margin: 0;
  }

  .see-all-link {
    font-size: 12px;
    font-weight: 500;
    color: #7c6858;
    text-decoration: none;
  }

  .see-all-link:hover {
    color: #261a14;
  }

  .empty-msg {
    padding: 16px 8px;
    text-align: center;
    font-size: 12px;
    color: #9e8b7c;
  }

  .announcement-list {
    display: flex;
    flex-direction: column;
  }

  .announcement-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #f4ede5;
  }

  .announcement-row:last-child {
    border-bottom: none;
    padding-bottom: 4px;
  }

  .announcement-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .tag-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tag-pill.urgent {
    background-color: #fde8e8;
    color: #c81e1e;
  }

  .tag-pill.routine {
    background-color: #f3ece4;
    color: #7c6858;
  }

  .announcement-title {
    font-size: 12px;
    font-weight: 500;
    color: #261a14;
  }

  .announcement-date {
    font-size: 11px;
    color: #9e8b7c;
    white-space: nowrap;
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .history-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .history-table th {
    padding: 10px 10px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
    white-space: nowrap;
  }

  .history-table td {
    padding: 12px 10px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
    color: #261a14;
    white-space: nowrap;
  }

  .history-table tbody tr:last-child td {
    border-bottom: none;
  }

  .cell-strong {
    font-weight: 500;
  }

  .cell-muted {
    color: #8f7c6e;
  }

  .status-paid {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    background-color: #dcfce7;
    color: #15803d;
    font-size: 11px;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: block;
    }

    .guardian-home-page {
      gap: 14px;
    }

    .mobile-header-block {
      display: flex;
      flex-direction: column;
    }

    .mobile-title {
      margin: 0 0 4px;
      font-size: 24px;
      font-weight: 700;
      color: #261a14;
    }

    .mobile-subtitle {
      margin: 0 0 14px;
      font-size: 12px;
      line-height: 1.5;
      color: #9e8b7c;
    }

    .mobile-ward-lbl {
      font-size: 12px;
      font-weight: 600;
      color: #261a14;
      margin-bottom: 6px;
    }

    .mobile-ward-select {
      width: 100%;
      height: 40px;
      padding: 0 12px;
      border: 1px solid #e4dad0;
      border-radius: 8px;
      background-color: #ffffff;
      color: #7c6858;
      font-family: inherit;
      font-size: 13px;
      box-sizing: border-box;
    }

    .mobile-stack {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .surface-card {
      padding: 16px;
    }

    .mobile-bill-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .mobile-bill-sub {
      font-size: 12px;
      color: #9e8b7c;
      line-height: 1.35;
    }

    .mobile-bill-amount {
      font-size: 24px;
      font-weight: 700;
      color: #261a14;
      margin-bottom: 14px;
    }

    .announcement-row {
      align-items: flex-start;
      padding: 10px 0;
    }

    .announcement-left {
      align-items: flex-start;
      gap: 10px;
    }

    .announcement-text-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .announcement-title {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
    }

    .announcement-sub {
      font-size: 11px;
      color: #9e8b7c;
    }
  }
</style>
