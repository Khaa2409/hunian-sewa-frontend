<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  /**
   * @typedef {Object} WardItem
   * @property {string} id
   * @property {string | number | null} tenantId
   * @property {string | number | null} contractId
   * @property {string} name
   * @property {string} roomNumber
   * @property {string} contractStatus
   * @property {string} nextDueDate
   * @property {any} badge
   * @property {any} openInvoice
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

  let activeOpenInvoice = $derived.by(() => {
    const inv = activeWard?.openInvoice;
    if (!inv || typeof inv !== "object") return null;
    return inv;
  });

  let rawDueDateValue = $derived.by(() => {
    return (
      activeOpenInvoice?.due_date ||
      activeOpenInvoice?.next_due_date ||
      activeWard?.nextDueDate ||
      ""
    );
  });

  let isEmptyDueDate = $derived(!rawDueDateValue);

  /**
   * @param {any} inv
   * @returns {boolean}
   */
  function checkInvoiceUnpaid(inv) {
    if (inv && typeof inv === "object") {
      if (inv.has_unpaid !== undefined) {
        return Boolean(inv.has_unpaid);
      }
      const status = String(inv.status || inv.payment_status || "")
        .trim()
        .toLowerCase();
      if (
        [
          "paid",
          "lunas",
          "settled",
          "settlement",
          "capture",
          "completed",
          "success",
          "cancelled",
          "canceled",
          "dibatalkan",
        ].includes(status)
      ) {
        return false;
      }
      if (
        [
          "unpaid",
          "pending",
          "overdue",
          "late",
          "terlambat",
          "menunggu pembayaran",
        ].includes(status)
      ) {
        return true;
      }
      const amt = Number(
        String(inv.amount ?? inv.total_amount ?? inv.gross_amount ?? 0).replace(
          /[^\d.-]/g,
          "",
        ),
      );
      if (Number.isFinite(amt) && amt > 0) return true;
    }
    return false;
  }

  /**
   * @param {WardItem | null | undefined} ward
   * @returns {boolean}
   */
  function wardHasUnpaidBill(ward) {
    if (!ward) return false;
    return checkInvoiceUnpaid(ward.openInvoice);
  }

  let hasUnpaidBill = $derived.by(() => {
    return checkInvoiceUnpaid(activeOpenInvoice);
  });

  let billTitle = $derived.by(() => {
    if (
      hasUnpaidBill &&
      (activeOpenInvoice?.title || activeOpenInvoice?.period_label)
    ) {
      return String(activeOpenInvoice.title || activeOpenInvoice.period_label);
    }
    return "Tagihan";
  });

  let mobileBillTitle = $derived.by(() => {
    const wardName = activeWard?.name || "";
    return wardName ? `${billTitle} · ${wardName}` : billTitle;
  });

  let dueDateText = $derived.by(() => {
    const textCandidate = activeOpenInvoice?.due_date_text;
    if (typeof textCandidate === "string" && textCandidate.trim()) {
      return textCandidate.trim();
    }
    if (!rawDueDateValue) return "Belum ada data jatuh tempo.";
    if (String(rawDueDateValue).toLowerCase().startsWith("jatuh tempo")) {
      return String(rawDueDateValue);
    }
    const formatted = formatShortDate(rawDueDateValue);
    return formatted !== "–"
      ? `Jatuh tempo: ${formatted}`
      : String(rawDueDateValue);
  });

  let dueBadgeText = $derived.by(() => {
    const badgeCandidate =
      activeOpenInvoice?.due_badge ??
      activeOpenInvoice?.badge ??
      activeWard?.badge ??
      null;
    return resolveBadgeText(badgeCandidate, rawDueDateValue);
  });

  let mobileDueBadgeText = $derived.by(() => {
    const mobileCandidate = activeOpenInvoice?.mobile_due_badge ?? dueBadgeText;
    return resolveBadgeText(mobileCandidate, rawDueDateValue);
  });

  let billAmountText = $derived.by(() => {
    if (
      typeof activeOpenInvoice?.amount_rupiah === "string" &&
      activeOpenInvoice.amount_rupiah.trim()
    ) {
      return activeOpenInvoice.amount_rupiah.trim();
    }
    const rawAmt =
      activeOpenInvoice?.amount ??
      activeOpenInvoice?.total_amount ??
      activeOpenInvoice?.gross_amount ??
      0;
    return formatRupiah(rawAmt);
  });

  /**
   * @param {any} rawBadge
   * @param {any} dueDateInput
   * @returns {string}
   */
  function resolveBadgeText(rawBadge, dueDateInput) {
    if (typeof rawBadge === "string") {
      const trimmed = rawBadge.trim();
      if (trimmed && trimmed !== "[object Object]") return trimmed;
    } else if (typeof rawBadge === "number" && Number.isFinite(rawBadge)) {
      if (rawBadge > 0) return `Jatuh tempo ${rawBadge} hari lagi`;
      if (rawBadge === 0) return "Jatuh tempo hari ini";
      return `Terlambat ${Math.abs(rawBadge)} hari`;
    } else if (rawBadge && typeof rawBadge === "object") {
      const possibleText =
        rawBadge.label ||
        rawBadge.text ||
        rawBadge.title ||
        rawBadge.message ||
        rawBadge.status_label ||
        "";
      if (typeof possibleText === "string" && possibleText.trim()) {
        return possibleText.trim();
      }
      const daysVal = Number(
        rawBadge.days_remaining ??
          rawBadge.days_left ??
          rawBadge.diff_days ??
          rawBadge.days ??
          NaN,
      );
      if (Number.isFinite(daysVal)) {
        if (daysVal > 0) return `Jatuh tempo ${daysVal} hari lagi`;
        if (daysVal === 0) return "Jatuh tempo hari ini";
        return `Terlambat ${Math.abs(daysVal)} hari`;
      }
    }

    if (dueDateInput) {
      const parsed = new Date(dueDateInput);
      if (!Number.isNaN(parsed.getTime())) {
        const diffDays = Math.ceil(
          (parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays > 0) return `Jatuh tempo ${diffDays} hari lagi`;
        if (diffDays === 0) return "Jatuh tempo hari ini";
        return `Terlambat ${Math.abs(diffDays)} hari`;
      }
    }

    return "";
  }

  /**
   * @param {any} item
   * @returns {boolean}
   */
  function isPaidInvoiceItem(item) {
    if (!item || typeof item !== "object") return false;
    const rawStatus = String(item?.status || item?.payment_status || "")
      .trim()
      .toLowerCase();
    const paidStatuses = [
      "paid",
      "lunas",
      "settled",
      "settlement",
      "capture",
      "completed",
      "success",
    ];
    return (
      paidStatuses.includes(rawStatus) ||
      Boolean(item?.paid_at || item?.payment_date)
    );
  }

  /**
   * @param {any} val
   */
  function formatRupiah(val) {
    if (typeof val === "string" && val.trim().startsWith("Rp")) {
      return val.trim();
    }
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
   * @param {number} year
   * @param {number} month1Based
   * @returns {string}
   */
  function formatMonthYear(year, month1Based) {
    const d = new Date(year, (month1Based || 1) - 1, 1);
    if (Number.isNaN(d.getTime())) return "–";
    return d.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });
  }

  /**
   * @param {any} raw
   * @returns {string}
   */
  function extractPaymentPeriodLabel(raw) {
    if (!raw || typeof raw !== "object") return "–";
    if (raw?.period_label && String(raw.period_label).trim()) {
      return String(raw.period_label).trim();
    }

    const periodRaw = String(
      raw?.periode ||
        raw?.period ||
        raw?.month_label ||
        raw?.billing_period ||
        "",
    ).trim();

    if (/^\d{4}-\d{2}$/.test(periodRaw)) {
      const [y, m] = periodRaw.split("-").map(Number);
      return formatMonthYear(y, m);
    }

    if (periodRaw) return periodRaw;

    const dateCandidate =
      raw?.period_start ||
      raw?.due_date ||
      raw?.billing_date ||
      raw?.created_at ||
      "";

    if (dateCandidate) {
      const isoMatch = String(dateCandidate).match(/^(\d{4})-(\d{2})/);
      if (isoMatch) {
        return formatMonthYear(Number(isoMatch[1]), Number(isoMatch[2]));
      }
      const parsed = new Date(dateCandidate);
      if (!Number.isNaN(parsed.getTime())) {
        return formatMonthYear(parsed.getFullYear(), parsed.getMonth() + 1);
      }
    }

    const invNum = String(
      raw?.invoice_number || raw?.invoice_code || raw?.number || "",
    );
    const invMatch = invNum.match(/(\d{4})(0[1-9]|1[0-2])-/);
    if (invMatch) {
      return formatMonthYear(Number(invMatch[1]), Number(invMatch[2]));
    }

    return "–";
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
      period: extractPaymentPeriodLabel(raw),
      amount:
        raw?.amount_rupiah ||
        formatRupiah(
          raw?.amount ?? raw?.total_amount ?? raw?.gross_amount ?? 0,
        ),
      paidDate: formatShortDate(
        raw?.paid_at || raw?.payment_date || raw?.paidDate || raw?.updated_at,
      ),
      statusLabel: "Lunas",
    };
  }

  /**
   * @param {any} payload
   * @returns {WardItem[]}
   */
  function extractWards(payload) {
    const root =
      payload?.data && typeof payload.data === "object"
        ? payload.data
        : payload;
    const list = Array.isArray(root?.wards) ? root.wards : [];
    return list.map((/** @type {any} */ w, /** @type {number} */ idx) => {
      const tenantId = w?.tenant_id ?? null;
      const contractId = w?.contract_id ?? null;
      return {
        id: String(tenantId ?? w?.id ?? contractId ?? idx + 1),
        tenantId,
        contractId,
        name: w?.name || w?.tenant_name || "Penyewa",
        roomNumber: w?.room_number || w?.room?.room_number || "-",
        contractStatus: String(w?.contract_status || ""),
        nextDueDate: w?.next_due_date || "",
        badge: w?.badge ?? null,
        openInvoice: w?.open_invoice ?? null,
      };
    });
  }

  /**
   * @param {any} res
   * @returns {any[]}
   */
  function extractList(res) {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.data?.items)) return res.data.items;
    if (Array.isArray(res?.data?.invoices)) return res.data.invoices;
    if (Array.isArray(res?.data?.announcements)) return res.data.announcements;
    if (Array.isArray(res?.invoices)) return res.invoices;
    if (Array.isArray(res?.announcements)) return res.announcements;
    if (Array.isArray(res?.items)) return res.items;
    return [];
  }

  /**
   * @param {WardItem | null} ward
   */
  async function fetchWardSecondaryData(ward) {
    const [annResult, invResult] = await Promise.allSettled([
      apiRequest("/api/announcements"),
      apiRequest("/api/invoices"),
    ]);

    if (annResult.status === "fulfilled") {
      const rawAnn = extractList(annResult.value);
      announcements = rawAnn.slice(0, 3).map(normalizeAnnouncement);
    } else {
      announcements = [];
    }

    if (invResult.status === "fulfilled") {
      const rawInvoices = extractList(invResult.value);
      const filteredByWard = ward?.tenantId
        ? rawInvoices.filter((/** @type {any} */ item) => {
            const itemTenantId = item?.tenant_id ?? item?.tenant?.id ?? null;
            return (
              itemTenantId === null ||
              String(itemTenantId) === String(ward.tenantId)
            );
          })
        : ward?.contractId
          ? rawInvoices.filter(
              (/** @type {any} */ item) =>
                String(item?.contract_id ?? "") === String(ward.contractId),
            )
          : rawInvoices;

      if (ward && !ward.openInvoice) {
        const unpaidForWard = filteredByWard.find(
          (/** @type {any} */ item) =>
            !isPaidInvoiceItem(item) && checkInvoiceUnpaid(item),
        );
        if (unpaidForWard) {
          wards = wards.map((w) =>
            String(w.id) === String(ward.id)
              ? {
                  ...w,
                  openInvoice: unpaidForWard,
                  nextDueDate:
                    w.nextDueDate ||
                    unpaidForWard.due_date ||
                    unpaidForWard.next_due_date ||
                    "",
                }
              : w,
          );
        }
      }

      const paidRows = filteredByWard.filter(isPaidInvoiceItem);
      paymentHistory = paidRows.slice(0, 3).map(normalizePayment);
    } else {
      paymentHistory = [];
    }
  }

  async function fetchGuardianDashboard() {
    loading = true;
    errorMsg = "";

    try {
      /** @type {any} */
      const summaryRes = await apiRequest("/api/dashboard/summary");
      const parsedWards = extractWards(summaryRes);
      wards = parsedWards;

      if (parsedWards.length > 0) {
        const hasCurrent = parsedWards.some(
          (w) => String(w.id) === String(selectedWardId),
        );
        if (!selectedWardId || !hasCurrent) {
          selectedWardId = String(parsedWards[0].id);
        }
      } else {
        selectedWardId = "";
      }

      const currentWard =
        parsedWards.find((w) => String(w.id) === String(selectedWardId)) ||
        parsedWards[0] ||
        null;

      await fetchWardSecondaryData(currentWard);
    } catch (/** @type {any} */ err) {
      wards = [];
      announcements = [];
      paymentHistory = [];
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

  async function handleWardChange() {
    errorMsg = "";
    const currentWard =
      wards.find((w) => String(w.id) === String(selectedWardId)) ||
      wards[0] ||
      null;
    await fetchWardSecondaryData(currentWard);
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
              <option value={ward.id}>
                Penyewa: {ward.name}{wardHasUnpaidBill(ward)
                  ? " (Belum Bayar)"
                  : ""}
              </option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- MOBILE HEADER & WARD SELECTOR -->
    <div class="mobile-only mobile-header-block">
      <h1 class="mobile-title">Halo, {displayGuardianName}</h1>
      <p class="mobile-subtitle">
        {#if activeWard}
          Memantau pembayaran sewa {activeWard.name} · Kamar {activeWard.roomNumber}
        {:else}
          Pantau tagihan sewa dan pengumuman kos anak perwalian.
        {/if}
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
            <option value={ward.id}>
              {ward.name} · Kamar {ward.roomNumber}{wardHasUnpaidBill(ward)
                ? " · Belum Bayar"
                : ""}
            </option>
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
          {#if dueBadgeText}
            <span class="due-badge">{dueBadgeText}</span>
          {/if}
        </div>

        <p class="due-period">{billTitle}</p>
        <div
          class="due-date-main"
          class:due-date-empty={!loading && isEmptyDueDate}
        >
          {loading ? "Memuat..." : dueDateText}
        </div>

        <div class="due-actions">
          {#if hasUnpaidBill}
            <button
              type="button"
              class="btn-brown-sm"
              onclick={() => goToPath("#/guardian/bills-payments")}
            >
              Bayar Sewa
            </button>
          {/if}
          <button
            type="button"
            class="btn-link-muted"
            onclick={() => goToPath("#/guardian/bills-payments")}
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
            onclick={() => goToPath("#/guardian/bills-payments")}
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

    <!-- MOBILE BILL CARD & AKSI CEPAT -->
    <div class="mobile-only mobile-stack" in:fade={{ duration: 160 }}>
      <section
        class="surface-card mobile-bill-card"
        aria-label="Tagihan Anak Perwalian"
      >
        <div class="mobile-bill-top">
          <span class="mobile-bill-sub">{mobileBillTitle}</span>
          {#if mobileDueBadgeText}
            <span class="due-badge">{mobileDueBadgeText}</span>
          {/if}
        </div>

        <div class="mobile-bill-amount">
          {loading ? "Memuat..." : hasUnpaidBill ? billAmountText : dueDateText}
        </div>

        {#if hasUnpaidBill}
          <button
            type="button"
            class="btn-brown-full"
            onclick={() => goToPath("#/guardian/bills-payments")}
          >
            Bayar Sewa
          </button>
        {/if}
      </section>

      <section class="surface-card mobile-quick-card" aria-label="Aksi Cepat">
        <h2 class="card-section-title">Aksi Cepat</h2>
        <div class="quick-btn-stack">
          <button
            type="button"
            class="btn-brown-full"
            onclick={() => goToPath("#/guardian/bills-payments")}
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
          href="#/guardian/bills-payments"
          class="see-all-link"
          onclick={(e) => {
            e.preventDefault();
            goToPath("#/guardian/bills-payments");
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
        <div class="table-wrap desktop-only">
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

        <div class="mobile-only mobile-pay-list">
          {#each paymentHistory as row (row.id)}
            <div class="mobile-pay-card">
              <div class="mobile-pay-top">
                <span class="mobile-pay-period">{row.period}</span>
                <span class="status-paid">{row.statusLabel}</span>
              </div>
              <div class="mobile-pay-meta">
                <span class="mobile-pay-amount">{row.amount}</span>
                <span class="mobile-pay-date">{row.paidDate}</span>
              </div>
            </div>
          {/each}
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

  .due-date-empty {
    font-size: 12px;
    font-weight: 400;
    color: #9e8b7c;
    line-height: 1.5;
    margin-bottom: 18px;
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

    .mobile-pay-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-pay-card {
      padding: 12px;
      border: 1px solid #f0e8df;
      border-radius: 10px;
      background-color: #faf7f2;
    }

    .mobile-pay-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    .mobile-pay-period {
      font-size: 12.5px;
      font-weight: 700;
      color: #261a14;
    }

    .mobile-pay-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
    }

    .mobile-pay-amount {
      font-weight: 600;
      color: #261a14;
    }

    .mobile-pay-date {
      font-size: 11px;
      color: #8f7c6e;
    }
  }
</style>
