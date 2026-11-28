<script>
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { push } from "svelte-spa-router";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import {
    fetchContracts,
    fetchContractDetail,
    fetchVacantRooms,
    fetchTenantUsers,
    createContract,
    extendContract,
    terminateContract,
  } from "../../lib/contractsApi.js";

  const OWNER_OPEN_TICKET_KEY = "hunify_open_owner_ticket_id";

  const MONTHS_ID = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];

  const MONTHS_FULL_ID = [
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

  const WEEKDAYS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  function getTodayLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /** @param {string} isoStr */
  function parseIsoDateParts(isoStr) {
    const clean = String(isoStr || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const [y, m, d] = clean.split("-").map(Number);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return { year: y, month: m - 1, day: d };
      }
    }
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
    };
  }

  /**
   * @param {number} year
   * @param {number} monthIndex
   * @param {number} day
   */
  function toIsoDate(year, monthIndex, day) {
    const m = String(monthIndex + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  }

  /** @param {any} amount */
  function formatRupiah(amount) {
    if (amount === null || amount === undefined) return "Rp 0";
    const num =
      typeof amount === "number"
        ? amount
        : Number(String(amount).replace(/[^\d]/g, ""));
    return `Rp ${(Number.isFinite(num) ? num : 0).toLocaleString("id-ID")}`;
  }

  /** @param {any} dateStr */
  function formatDateId(dateStr) {
    if (!dateStr) return "-";
    const clean = String(dateStr).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const [y, m, d] = clean.split("-").map(Number);
      if (m >= 1 && m <= 12) {
        return `${d} ${MONTHS_ID[m - 1]} ${y}`;
      }
    }
    return String(dateStr);
  }

  /** @param {string} dateStr */
  function formatPickerHeaderDate(dateStr) {
    if (!dateStr) return "Pilih tanggal";
    const { year, month, day } = parseIsoDateParts(dateStr);
    const dt = new Date(year, month, day);
    const dow = WEEKDAYS_ID[dt.getDay()] || "";
    return `${dow}, ${day} ${MONTHS_ID[month]} ${year}`;
  }

  /** @param {any} dateStr */
  function formatMonthYearId(dateStr) {
    if (!dateStr) return "";
    const clean = String(dateStr).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const [y, m] = clean.split("-").map(Number);
      if (m >= 1 && m <= 12) {
        return `${MONTHS_ID[m - 1]} ${y}`;
      }
    }
    return "";
  }

  /** @param {any} contract */
  function formatContractCode(contract) {
    if (!contract) return "-";
    if (typeof contract === "object") {
      const code = contract.contract_code || contract.code;
      if (code) return String(code);
      if (contract.id !== null && contract.id !== undefined) {
        return `KTR-${contract.id}`;
      }
      return "-";
    }
    return `KTR-${contract}`;
  }

  /** @param {any} status */
  function formatStatusLabel(status) {
    /** @type {Record<string, string>} */
    const map = {
      pending: "Menunggu Pembayaran",
      active: "Aktif",
      completed: "Selesai",
      terminated: "Dihentikan",
      cancelled: "Dibatalkan",
    };
    const key = String(status || "");
    return map[key] || key || "-";
  }

  /** @param {any} status */
  function getStatusClass(status) {
    if (status === "active") return "active";
    if (status === "pending") return "expiring";
    if (status === "completed") return "completed";
    if (status === "terminated" || status === "cancelled") return "ended";
    return "ended";
  }

  /** @param {any} payment */
  function getPaymentStatusLabel(payment) {
    const raw = String(payment?.status_label || payment?.status || "")
      .trim()
      .toLowerCase();
    if (["settlement", "capture", "paid", "lunas", "completed"].includes(raw))
      return "Lunas";
    if (["expire", "deny", "failure", "cancel", "cancelled"].includes(raw))
      return "Gagal";
    if (payment?.paid_at) return "Lunas";
    return "Menunggu Pembayaran";
  }

  /** @param {any} payment */
  function getPaymentStatusClass(payment) {
    const label = getPaymentStatusLabel(payment);
    if (label === "Lunas") return "active";
    if (label === "Gagal") return "failed";
    return "expiring";
  }

  /** @param {any} ticket */
  function formatTicketStatusLabel(ticket) {
    const raw =
      ticket?.status_label || ticket?.status || ticket?.ticket_status || "";
    const normalized = String(raw).trim().toLowerCase();

    if (
      normalized === "resolved" ||
      normalized === "completed" ||
      normalized === "done" ||
      normalized === "selesai"
    ) {
      return "Selesai";
    }

    if (
      normalized === "in_progress" ||
      normalized === "processing" ||
      normalized === "diproses"
    ) {
      return "Diproses";
    }

    if (
      normalized === "pending" ||
      normalized === "waiting" ||
      normalized === "waiting_confirmation" ||
      normalized === "menunggu" ||
      normalized === "menunggu konfirmasi"
    ) {
      return "Menunggu Konfirmasi";
    }

    return raw ? String(raw) : "Menunggu Konfirmasi";
  }

  /** @param {any} ticket */
  function getTicketStatusClass(ticket) {
    const label = formatTicketStatusLabel(ticket).toLowerCase();
    if (label === "selesai") return "ticket-resolved";
    if (label === "diproses") return "ticket-in-progress";
    return "ticket-pending";
  }

  /** @param {any} status */
  function getRoomStatusLabel(status) {
    /** @type {Record<string, string>} */
    const map = {
      occupied: "Terisi",
      available: "Kosong",
      maintenance: "Perbaikan",
    };
    const key = String(status || "");
    return map[key] || key || "-";
  }

  /** @param {any} name */
  function getInitials(name) {
    if (!name) return "P";
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  /** @param {any} res */
  function extractArray(res) {
    if (Array.isArray(res)) return res;
    if (res && typeof res === "object") {
      if (Array.isArray(res.data)) return res.data;
      if (Array.isArray(res.rooms)) return res.rooms;
      if (Array.isArray(res.users)) return res.users;
      if (Array.isArray(res.items)) return res.items;
    }
    return [];
  }

  /**
   * Extract total dari respons backend (baca meta.total)
   * @param {any} res
   * @param {number} [fallbackLen=0]
   */
  function extractTotal(res, fallbackLen = 0) {
    if (!res || typeof res !== "object") return fallbackLen;
    if (res.meta && typeof res.meta.total === "number") return res.meta.total;
    if (typeof res.total === "number") return res.total;
    if (Array.isArray(res.data)) return res.data.length;
    return fallbackLen;
  }

  // --- STATE MODUL & FILTER ---
  let selectedStatus = $state("all");
  let searchQuery = $state("");
  let currentPage = $state(1);
  const perPage = 10;

  let isMobileViewport = $state(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );
  let isLoading = $state(true);
  let isSubmitting = $state(false);
  let errorMessage = $state("");
  let feedbackMessage = $state("");

  /** @type {'list' | 'detail'} */
  let viewMode = $state("list");
  /** @type {any} */
  let selectedContract = $state(null);
  let paymentPage = $state(1);
  const paymentPerPage = 5;

  // Data dari API backend
  /** @type {any[]} */
  let contracts = $state([]);
  /** @type {any[]} */
  let vacantRooms = $state([]);
  /** @type {any[]} */
  let availableTenantUsers = $state([]);
  let paginationMeta = $state({ total: 0, page: 1, total_pages: 1 });
  let tabCounts = $state({
    all: 0,
    pending: 0,
    active: 0,
    completed: 0,
    terminated: 0,
  });

  // Overlay state: 'create' | 'extend' | 'terminate' | null
  /** @type {'create' | 'extend' | 'terminate' | null} */
  let activeOverlay = $state(null);
  /** @type {any} */
  let targetContract = $state(null);

  // Form State Buat Kontrak
  let formTenantId = $state("");
  let formRoomId = $state("");
  let formStartDate = $state(getTodayLocalDate());
  let formDurationMonths = $state("12");

  // Form State Perpanjang Kontrak
  let extendEndDate = $state("");

  // State Popup Date Picker ('start' | 'extend' | null)
  /** @type {'start' | 'extend' | null} */
  let openDatePicker = $state(null);
  let pickerYear = $state(new Date().getFullYear());
  let pickerMonth = $state(new Date().getMonth());

  /** @param {'start' | 'extend'} target */
  function toggleDatePicker(target) {
    if (openDatePicker === target) {
      openDatePicker = null;
      return;
    }
    const baseIso =
      target === "start"
        ? formStartDate || getTodayLocalDate()
        : extendEndDate || getTodayLocalDate();
    const parts = parseIsoDateParts(baseIso);
    pickerYear = parts.year;
    pickerMonth = parts.month;
    openDatePicker = target;
  }

  function prevPickerMonth() {
    if (pickerMonth === 0) {
      pickerMonth = 11;
      pickerYear -= 1;
    } else {
      pickerMonth -= 1;
    }
  }

  function nextPickerMonth() {
    if (pickerMonth === 11) {
      pickerMonth = 0;
      pickerYear += 1;
    } else {
      pickerMonth += 1;
    }
  }

  /** @param {number} day */
  function selectCalendarDay(day) {
    const iso = toIsoDate(pickerYear, pickerMonth, day);
    if (openDatePicker === "start") {
      formStartDate = iso;
    } else if (openDatePicker === "extend") {
      extendEndDate = iso;
    }
    openDatePicker = null;
  }

  function selectTodayInPicker() {
    const todayIso = getTodayLocalDate();
    const parts = parseIsoDateParts(todayIso);
    pickerYear = parts.year;
    pickerMonth = parts.month;
    if (openDatePicker === "start") {
      formStartDate = todayIso;
    } else if (openDatePicker === "extend") {
      extendEndDate = todayIso;
    }
    openDatePicker = null;
  }

  function clearExtendDateInPicker() {
    extendEndDate = "";
    openDatePicker = null;
  }

  let calendarCells = $derived.by(() => {
    const firstDayOfMonth = new Date(pickerYear, pickerMonth, 1).getDay();
    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    /** @type {Array<{ day: number | null, iso: string }>} */
    const cells = [];
    for (let i = 0; i < firstDayOfMonth; i += 1) {
      cells.push({ day: null, iso: "" });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push({ day: d, iso: toIsoDate(pickerYear, pickerMonth, d) });
    }
    return cells;
  });

  /** @param {string} msg */
  function notifyFeedback(msg) {
    feedbackMessage = msg;
    setTimeout(() => {
      if (feedbackMessage === msg) feedbackMessage = "";
    }, 3500);
  }

  async function refreshTabCounts() {
    try {
      /** @type {any[]} */
      const [allRes, pendingRes, activeRes, completedRes, terminatedRes] =
        await Promise.all([
          fetchContracts({
            status: "",
            q: searchQuery,
            page: 1,
            limit: 1,
          }).catch(() => null),
          fetchContracts({
            status: "pending",
            q: searchQuery,
            page: 1,
            limit: 1,
          }).catch(() => null),
          fetchContracts({
            status: "active",
            q: searchQuery,
            page: 1,
            limit: 1,
          }).catch(() => null),
          fetchContracts({
            status: "completed",
            q: searchQuery,
            page: 1,
            limit: 1,
          }).catch(() => null),
          fetchContracts({
            status: "terminated",
            q: searchQuery,
            page: 1,
            limit: 1,
          }).catch(() => null),
        ]);

      tabCounts = {
        all: allRes ? extractTotal(allRes) : tabCounts.all,
        pending: pendingRes ? extractTotal(pendingRes) : 0,
        active: activeRes ? extractTotal(activeRes) : 0,
        completed: completedRes ? extractTotal(completedRes) : 0,
        terminated: terminatedRes ? extractTotal(terminatedRes) : 0,
      };
    } catch {
      // Abaikan error minor saat menghitung badge tab
    }
  }

  // --- QUERY KE BACKEND ---
  async function loadContractsList() {
    isLoading = true;
    errorMessage = "";
    try {
      const apiStatusParam = selectedStatus === "all" ? "" : selectedStatus;
      /** @type {any} */
      const res = await fetchContracts({
        status: apiStatusParam,
        q: searchQuery,
        page: currentPage,
        limit: perPage,
      });

      const list = extractArray(res);
      contracts = list;

      const totalCount = extractTotal(res, list.length);
      const totalPages =
        res?.meta?.total_pages ||
        res?.pagination?.total_pages ||
        Math.max(1, Math.ceil(totalCount / perPage));

      paginationMeta = {
        total: totalCount,
        page: res?.meta?.page || currentPage,
        total_pages: totalPages,
      };

      await refreshTabCounts();
    } catch (/** @type {any} */ err) {
      errorMessage =
        err?.message ||
        err?.data?.pesan ||
        "Gagal mengambil daftar kontrak sewa dari database.";
      contracts = [];
    } finally {
      isLoading = false;
    }
  }

  async function loadFormOptions() {
    try {
      const [roomsRes, tenantsRes, allContractsRes] = await Promise.all([
        fetchVacantRooms().catch(() => []),
        fetchTenantUsers().catch(() => []),
        fetchContracts({ limit: 100 }).catch(() => []),
      ]);

      vacantRooms = extractArray(roomsRes);
      const allTenants = extractArray(tenantsRes);
      const allContracts = extractArray(allContractsRes);

      const activeTenantIds = new Set(
        allContracts
          .filter(
            (/** @type {any} */ c) =>
              c.status === "active" ||
              c.status === "pending" ||
              c.is_active === true,
          )
          .map((/** @type {any} */ c) => String(c.tenant_id || c.tenant?.id))
          .filter(Boolean),
      );

      availableTenantUsers = allTenants.filter((/** @type {any} */ u) => {
        if (u.is_active === false) return false;
        return !activeTenantIds.has(String(u.id));
      });
    } catch (err) {
      console.error("Gagal memuat opsi form:", err);
    }
  }

  /** @param {any} item */
  async function openContractDetail(item) {
    const id = typeof item === "object" && item !== null ? item.id : item;
    isLoading = true;
    errorMessage = "";
    try {
      /** @type {any} */
      const res = await fetchContractDetail(id);
      const detailData = res?.data || res;
      selectedContract = {
        ...(typeof item === "object" && item !== null ? item : {}),
        ...detailData,
      };
      paymentPage = 1;
      viewMode = "detail";
    } catch (/** @type {any} */ err) {
      errorMessage =
        err?.message || err?.data?.pesan || "Gagal memuat detail kontrak.";
    } finally {
      isLoading = false;
    }
  }

  function backToContractList() {
    viewMode = "list";
    selectedContract = null;
    loadContractsList();
  }

  async function openCreateOverlay() {
    targetContract = null;
    openDatePicker = null;
    await loadFormOptions();

    formTenantId = availableTenantUsers[0]?.id
      ? String(availableTenantUsers[0].id)
      : "";
    formRoomId = vacantRooms[0]?.id ? String(vacantRooms[0].id) : "";
    formStartDate = getTodayLocalDate();
    formDurationMonths = "12";

    activeOverlay = "create";
  }

  /** @param {any} item */
  function openExtendOverlay(item) {
    targetContract = item;
    openDatePicker = null;
    extendEndDate = item.end_date ? String(item.end_date).slice(0, 10) : "";
    activeOverlay = "extend";
  }

  /** @param {any} item */
  function openTerminateOverlay(item) {
    targetContract = item;
    openDatePicker = null;
    activeOverlay = "terminate";
  }

  function closeOverlay() {
    if (isSubmitting) return;
    openDatePicker = null;
    activeOverlay = null;
    targetContract = null;
  }

  /** @param {any} ticket */
  function navigateToTicketDetail(ticket) {
    if (!ticket) return;
    const ticketId = ticket.id || ticket.ticket_id || ticket.ticket_number;
    if (!ticketId || typeof window === "undefined") return;

    try {
      window.sessionStorage.setItem(OWNER_OPEN_TICKET_KEY, String(ticketId));
    } catch {
      // Abaikan jika sessionStorage tidak tersedia
    }

    push(
      `/owner/maintenance?ticket_id=${encodeURIComponent(String(ticketId))}`,
    );
  }

  // --- MUTASI DATA KE BACKEND ---
  /** @param {SubmitEvent} e */
  async function handleCreateContractSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    errorMessage = "";

    try {
      const payload = {
        tenant_id: Number(formTenantId),
        room_id: Number(formRoomId),
        start_date: formStartDate,
        duration_months: formDurationMonths ? Number(formDurationMonths) : null,
      };

      /** @type {any} */
      const res = await createContract(payload);
      activeOverlay = null;
      notifyFeedback(
        res?.message || res?.pesan || "Kontrak sewa berhasil dibuat.",
      );
      await loadContractsList();
    } catch (/** @type {any} */ err) {
      errorMessage =
        err?.data?.pesan || err?.message || "Gagal membuat kontrak sewa.";
    } finally {
      isSubmitting = false;
    }
  }

  /** @param {SubmitEvent} e */
  async function handleExtendContractSubmit(e) {
    e.preventDefault();
    if (!targetContract || isSubmitting) return;
    isSubmitting = true;
    errorMessage = "";

    try {
      const payload = {
        end_date: extendEndDate.trim() ? extendEndDate.trim() : null,
      };

      /** @type {any} */
      const res = await extendContract(targetContract.id, payload);
      activeOverlay = null;
      notifyFeedback(
        res?.message || res?.pesan || "Kontrak sewa berhasil diperpanjang.",
      );

      if (viewMode === "detail" && selectedContract?.id === targetContract.id) {
        await openContractDetail(targetContract.id);
      } else {
        await loadContractsList();
      }
    } catch (/** @type {any} */ err) {
      errorMessage =
        err?.data?.pesan || err?.message || "Gagal memperpanjang kontrak.";
    } finally {
      isSubmitting = false;
    }
  }

  async function handleTerminateContractConfirm() {
    if (!targetContract || isSubmitting) return;
    isSubmitting = true;
    errorMessage = "";

    try {
      /** @type {any} */
      const res = await terminateContract(targetContract.id);
      activeOverlay = null;
      notifyFeedback(
        res?.message || res?.pesan || "Kontrak berhasil diakhiri.",
      );

      if (viewMode === "detail" && selectedContract?.id === targetContract.id) {
        await openContractDetail(targetContract.id);
      } else {
        await loadContractsList();
      }
    } catch (/** @type {any} */ err) {
      errorMessage =
        err?.data?.pesan || err?.message || "Gagal mengakhiri kontrak.";
    } finally {
      isSubmitting = false;
    }
  }

  /** @param {string} statusKey */
  function selectStatusTab(statusKey) {
    selectedStatus = statusKey;
    currentPage = 1;
  }

  function handlePrevPage() {
    if (currentPage > 1) {
      currentPage -= 1;
    }
  }

  function handleNextPage() {
    if (currentPage < paginationMeta.total_pages) {
      currentPage += 1;
    }
  }

  $effect(() => {
    void selectedStatus;
    void searchQuery;
    void currentPage;
    if (viewMode === "list") {
      loadContractsList();
    }
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => {
      isMobileViewport = window.innerWidth <= 768;
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  });

  let startItemIndex = $derived.by(() => {
    if (contracts.length === 0) return 0;
    return (currentPage - 1) * perPage + 1;
  });

  let endItemIndex = $derived.by(() => {
    if (contracts.length === 0) return 0;
    return (currentPage - 1) * perPage + contracts.length;
  });

  let currentInvoice = $derived.by(() => {
    if (!selectedContract) return null;
    if (
      Array.isArray(selectedContract.open_invoices) &&
      selectedContract.open_invoices.length > 0
    ) {
      return selectedContract.open_invoices[0];
    }
    return selectedContract.current_invoice || null;
  });

  let paymentHistory = $derived.by(() => {
    if (!selectedContract) return [];
    if (Array.isArray(selectedContract.payments))
      return selectedContract.payments;
    if (Array.isArray(selectedContract.payment_history))
      return selectedContract.payment_history;
    return [];
  });

  let paymentTotalPages = $derived.by(() => {
    return Math.max(1, Math.ceil(paymentHistory.length / paymentPerPage));
  });

  let pagedPayments = $derived.by(() => {
    const start = (paymentPage - 1) * paymentPerPage;
    return paymentHistory
      .slice(start, start + paymentPerPage)
      .map((/** @type {any} */ pay) => {
        let rawPeriod = pay.period_label || pay.period || pay.billing_period;
        if (!rawPeriod || rawPeriod === "-") {
          const dateSource = pay.paid_at || pay.payment_date || pay.created_at;
          const formatted = formatMonthYearId(dateSource);
          rawPeriod = formatted ? formatted : "-";
        }
        return {
          ...pay,
          computedPeriod: rawPeriod,
        };
      });
  });

  let relatedTickets = $derived.by(() => {
    if (!selectedContract || !Array.isArray(selectedContract.tickets))
      return [];
    return selectedContract.tickets;
  });
</script>

<DashboardLayout activeKey="contracts">
  {#if feedbackMessage}
    <div
      class="toast-banner"
      role="status"
      transition:fly={{ y: -12, duration: 200, easing: cubicOut }}
    >
      {feedbackMessage}
    </div>
  {/if}

  {#if errorMessage}
    <div class="error-banner" role="alert">
      <span>{errorMessage}</span>
      <button type="button" class="retry-link-btn" onclick={loadContractsList}
        >Coba Lagi</button
      >
    </div>
  {/if}

  {#if viewMode === "detail" && selectedContract}
    <!-- VIEW DETAIL KONTRAK SEWA -->
    <div
      class="detail-page-wrap"
      in:fly={{ y: 16, duration: 250, easing: cubicOut }}
    >
      <button type="button" class="btn-back-link" onclick={backToContractList}>
        &larr; Kembali ke Kontrak Sewa
      </button>

      <div class="detail-top-header">
        <div class="detail-title-group">
          <div class="detail-title-row">
            <h1 class="desktop-detail-heading">Detail Kontrak</h1>
            <span class="status-pill {getStatusClass(selectedContract.status)}">
              {formatStatusLabel(selectedContract.status)}
            </span>
          </div>
          <p class="desktop-detail-sub">
            {formatContractCode(selectedContract)} &middot; {selectedContract
              .tenant?.name ||
              selectedContract.tenant_name ||
              "-"} &middot; Kamar {selectedContract.room?.room_number ||
              selectedContract.room_number ||
              "-"}
          </p>
        </div>

        <div class="detail-header-actions">
          {#if selectedContract.status === "active" || selectedContract.status === "pending"}
            <button
              type="button"
              class="btn-extend-white"
              onclick={() => openExtendOverlay(selectedContract)}
            >
              Perpanjang Kontrak
            </button>
            <button
              type="button"
              class="btn-terminate-red"
              onclick={() => openTerminateOverlay(selectedContract)}
            >
              Akhiri Kontrak
            </button>
          {/if}
        </div>
      </div>

      <div class="detail-main-grid">
        <!-- KOLOM KIRI (UTAMA) -->
        <div class="detail-col-left">
          <section class="figma-card">
            <div class="figma-card-head">
              <h2 class="figma-card-title">Ringkasan Kontrak</h2>
              <span
                class="status-pill {getStatusClass(selectedContract.status)}"
              >
                {formatStatusLabel(selectedContract.status)}
              </span>
            </div>

            <div class="summary-two-col">
              <div>
                <span class="summary-lbl">Penyewa</span>
                <span class="summary-val">
                  {selectedContract.tenant?.name ||
                    selectedContract.tenant_name ||
                    "-"} &middot; Kamar {selectedContract.room?.room_number ||
                    selectedContract.room_number ||
                    "-"}
                </span>
              </div>
              <div>
                <span class="summary-lbl">Nomor kontrak</span>
                <span class="summary-val"
                  >{formatContractCode(selectedContract)}</span
                >
              </div>

              <div>
                <span class="summary-lbl">Tanggal mulai</span>
                <span class="summary-val"
                  >{formatDateId(selectedContract.start_date)}</span
                >
              </div>
              <div>
                <span class="summary-lbl">Tanggal berakhir</span>
                <span class="summary-val">
                  {selectedContract.end_date
                    ? `${formatDateId(selectedContract.end_date)}${selectedContract.duration_months ? ` (${selectedContract.duration_months} bulan)` : ""}`
                    : "Tanpa batas waktu (Rolling)"}
                </span>
              </div>

              <div>
                <span class="summary-lbl">Tarif bulanan</span>
                <span class="summary-val"
                  >{selectedContract.monthly_rate_rupiah ||
                    formatRupiah(selectedContract.monthly_rate)}</span
                >
              </div>
              <div>
                <span class="summary-lbl">Jatuh tempo berikutnya</span>
                <span class="summary-val"
                  >{formatDateId(selectedContract.next_due_date)}</span
                >
              </div>

              <div>
                <span class="summary-lbl">Dibuat oleh</span>
                <span class="summary-val">
                  {selectedContract.created_by_name ||
                    selectedContract.creator_name ||
                    "Pengelola"}
                  {#if selectedContract.created_at}
                    &middot; {formatDateId(selectedContract.created_at)}
                  {/if}
                </span>
              </div>
              <div>
                <span class="summary-lbl">Tipe kamar</span>
                <span class="summary-val"
                  >{selectedContract.room?.room_type ||
                    selectedContract.room_type ||
                    "-"}</span
                >
              </div>
            </div>
          </section>

          <section class="figma-card">
            <div class="figma-card-head">
              <h2 class="figma-card-title">Riwayat Pembayaran</h2>
              <span class="badge-pill-soft"
                >{paymentHistory.length} pembayaran</span
              >
            </div>

            {#if pagedPayments.length > 0}
              {#if isMobileViewport}
                <div class="mobile-payment-list">
                  {#each pagedPayments as pay (pay.id || pay.invoice_number)}
                    <div class="mobile-payment-card">
                      <div class="mobile-payment-top">
                        <div>
                          <div class="mobile-payment-period">
                            Periode {pay.computedPeriod}
                          </div>
                          <div class="mobile-payment-amount">
                            {pay.amount_rupiah ||
                              formatRupiah(pay.amount || pay.gross_amount)}
                          </div>
                        </div>
                        <span
                          class="status-pill {getPaymentStatusClass(pay)}"
                          >{getPaymentStatusLabel(pay)}</span
                        >
                      </div>

                      <div class="mobile-payment-meta-grid">
                        <div>
                          <span class="summary-lbl">Tgl Bayar</span>
                          <span class="mobile-payment-meta-val"
                            >{pay.paid_at_wib ||
                              formatDateId(
                                pay.paid_at || pay.payment_date,
                              )}</span
                          >
                        </div>
                        <div>
                          <span class="summary-lbl">Metode</span>
                          <span class="mobile-payment-meta-val"
                            >{pay.payment_method || pay.method || "-"}</span
                          >
                        </div>
                        <div>
                          <span class="summary-lbl">Dibayar Oleh</span>
                          <span class="mobile-payment-meta-val"
                            >{pay.paid_by_name ||
                              pay.payer_name ||
                              selectedContract.tenant_name ||
                              "-"}</span
                          >
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="table-wrap">
                  <table class="mini-table">
                    <thead>
                      <tr>
                        <th>Periode</th>
                        <th>Nominal</th>
                        <th>Tgl Bayar</th>
                        <th>Metode</th>
                        <th>Dibayar Oleh</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each pagedPayments as pay (pay.id || pay.invoice_number)}
                        <tr>
                          <td>{pay.computedPeriod}</td>
                          <td
                            >{pay.amount_rupiah ||
                              formatRupiah(pay.amount || pay.gross_amount)}</td
                          >
                          <td class="cell-muted-date"
                            >{pay.paid_at_wib ||
                              formatDateId(pay.paid_at || pay.payment_date)}</td
                          >
                          <td>{pay.payment_method || pay.method || "-"}</td>
                          <td
                            >{pay.paid_by_name ||
                              pay.payer_name ||
                              selectedContract.tenant_name ||
                              "-"}</td
                          >
                          <td>
                            <span
                              class="status-pill {getPaymentStatusClass(pay)}"
                              >{getPaymentStatusLabel(pay)}</span
                            >
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}

              <div class="mini-pagination-bar">
                <span class="pagination-summary">
                  Menampilkan {(paymentPage - 1) * paymentPerPage +
                    1}-{Math.min(
                    paymentPage * paymentPerPage,
                    paymentHistory.length,
                  )} dari {paymentHistory.length} pembayaran
                </span>
                <div class="pagination-controls">
                  <span class="pagination-page-info"
                    >Halaman {paymentPage} dari {paymentTotalPages}</span
                  >
                  <button
                    type="button"
                    class="page-btn"
                    onclick={() => (paymentPage = Math.max(1, paymentPage - 1))}
                    disabled={paymentPage <= 1}
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    class="page-btn"
                    onclick={() =>
                      (paymentPage = Math.min(
                        paymentTotalPages,
                        paymentPage + 1,
                      ))}
                    disabled={paymentPage >= paymentTotalPages}
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            {:else}
              <p class="empty-sub-text">
                Belum ada riwayat pembayaran tercatat untuk kontrak ini.
              </p>
            {/if}
          </section>

          <section class="figma-card">
            <div class="figma-card-head">
              <h2 class="figma-card-title">Tiket Terkait</h2>
              <span class="badge-pill-soft">{relatedTickets.length} tiket</span>
            </div>

            {#if relatedTickets.length > 0}
              <div class="ticket-list">
                {#each relatedTickets as ticket (ticket.id || ticket.ticket_number)}
                  <div
                    class="ticket-row ticket-clickable"
                    role="button"
                    tabindex="0"
                    onclick={() => navigateToTicketDetail(ticket)}
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigateToTicketDetail(ticket);
                      }
                    }}
                  >
                    <div class="ticket-left">
                      <span class="ticket-code"
                        >{ticket.ticket_number || `#${ticket.id}`}</span
                      >
                      <span class="ticket-cat"
                        >{ticket.category || ticket.title || "-"}</span
                      >
                    </div>
                    <span class="ticket-date"
                      >{formatDateId(ticket.created_at || ticket.date)}</span
                    >
                    <span class="ticket-badge {getTicketStatusClass(ticket)}">
                      {formatTicketStatusLabel(ticket)}
                    </span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="empty-sub-text">
                Tidak ada tiket laporan kerusakan terkait kontrak ini.
              </p>
            {/if}
          </section>
        </div>

        <!-- KOLOM KANAN (SAMPING / DI BAWAH PADA MOBILE) -->
        <div class="detail-col-right">
          <section class="figma-card">
            <div class="figma-card-head">
              <h2 class="figma-card-title">Tagihan Berjalan</h2>
              {#if currentInvoice}
                <span class="status-pill expiring">Menunggu Pembayaran</span>
              {:else}
                <span class="status-pill ended">Tidak Ada Tagihan</span>
              {/if}
            </div>

            {#if currentInvoice}
              <div class="invoice-number-sub">
                {currentInvoice.invoice_number}
              </div>
              <div class="invoice-amount-big">
                {currentInvoice.amount_rupiah ||
                  formatRupiah(currentInvoice.amount)}
              </div>

              <div class="kv-rows">
                <div class="kv-row">
                  <span class="kv-label">Periode</span>
                  <span class="kv-value"
                    >{currentInvoice.period_label ||
                      formatDateId(
                        currentInvoice.period_start || currentInvoice.due_date,
                      )}</span
                  >
                </div>
                <div class="kv-row">
                  <span class="kv-label">Jatuh tempo</span>
                  <span class="kv-value kv-danger"
                    >{formatDateId(currentInvoice.due_date)}</span
                  >
                </div>
              </div>
            {:else}
              <p class="empty-sub-text">Tidak ada tagihan terbuka saat ini.</p>
            {/if}
          </section>

          <section class="figma-card">
            <h2 class="figma-card-title card-title-mb">Penyewa</h2>

            <div class="tenant-profile-head">
              <div class="tenant-avatar">
                {getInitials(
                  selectedContract.tenant?.name || selectedContract.tenant_name,
                )}
              </div>
              <div>
                <div class="tenant-profile-name">
                  {selectedContract.tenant?.name ||
                    selectedContract.tenant_name ||
                    "-"}
                </div>
                <div class="tenant-profile-sub">
                  Penyewa &middot; Kamar {selectedContract.room?.room_number ||
                    selectedContract.room_number ||
                    "-"}
                </div>
              </div>
            </div>

            <div class="kv-stack">
              <div>
                <span class="summary-lbl">Email</span>
                <span class="summary-val"
                  >{selectedContract.tenant?.email ||
                    selectedContract.tenant_email ||
                    "-"}</span
                >
              </div>
              <div class="kv-two-mini">
                <div>
                  <span class="summary-lbl">Telepon</span>
                  <span class="summary-val"
                    >{selectedContract.tenant?.phone ||
                      selectedContract.tenant_phone ||
                      "-"}</span
                  >
                </div>
                <div>
                  <span class="summary-lbl">Wali</span>
                  <span class="summary-val"
                    >{selectedContract.tenant?.guardian_name ||
                      selectedContract.guardian_name ||
                      "-"}</span
                  >
                </div>
              </div>
            </div>
          </section>

          <section class="figma-card">
            <div class="figma-card-head">
              <h2 class="figma-card-title">Kamar</h2>
              <span
                class="status-pill {selectedContract.room?.status ===
                  'occupied' || selectedContract.room_status === 'occupied'
                  ? 'active'
                  : 'ended'}"
              >
                {getRoomStatusLabel(
                  selectedContract.room?.status || selectedContract.room_status,
                )}
              </span>
            </div>

            <div class="kv-rows">
              <div class="kv-row">
                <span class="kv-label">Nomor</span>
                <span class="kv-value"
                  >{selectedContract.room?.room_number ||
                    selectedContract.room_number ||
                    "-"}</span
                >
              </div>
              <div class="kv-row">
                <span class="kv-label">Tipe</span>
                <span class="kv-value"
                  >{selectedContract.room?.room_type ||
                    selectedContract.room_type ||
                    "-"}</span
                >
              </div>
              <div class="kv-row">
                <span class="kv-label">Harga kamar sekarang</span>
                <span class="kv-value">
                  {selectedContract.room?.price_rupiah ||
                    formatRupiah(
                      selectedContract.room?.price ||
                        selectedContract.monthly_rate,
                    )}
                </span>
              </div>
              <div class="kv-row">
                <span class="kv-label">Tarif kontrak</span>
                <span class="kv-value">
                  {selectedContract.monthly_rate_rupiah ||
                    formatRupiah(selectedContract.monthly_rate)}
                </span>
              </div>
            </div>
          </section>

          <section class="figma-card">
            <h2 class="figma-card-title card-title-mb">Info Sistem</h2>

            <div class="summary-two-col compact-grid">
              <div>
                <span class="summary-lbl">ID kontrak</span>
                <span class="summary-val"
                  >{formatContractCode(selectedContract)}</span
                >
              </div>
              <div>
                <span class="summary-lbl">Dibuat pada</span>
                <span class="summary-val"
                  >{formatDateId(selectedContract.created_at)}</span
                >
              </div>
              <div>
                <span class="summary-lbl">Dibuat oleh</span>
                <span class="summary-val"
                  >{selectedContract.created_by_name ||
                    selectedContract.creator_name ||
                    "Pengelola"}</span
                >
              </div>
              <div>
                <span class="summary-lbl">Diakhiri pada</span>
                <span class="summary-val"
                  >{formatDateId(selectedContract.terminated_at)}</span
                >
              </div>
            </div>

            <div class="facility-block">
              <span class="summary-lbl">Fasilitas kamar</span>
              <span class="summary-val">
                {selectedContract.room?.facilities ||
                  selectedContract.room_facilities ||
                  "-"}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  {:else}
    <!-- VIEW DAFTAR KONTRAK SEWA -->
    <div
      class="list-page-wrap"
      in:fly={{ y: 16, duration: 250, easing: cubicOut }}
    >
      <div class="contracts-top-bar">
        <div>
          <h1 class="page-title">Kontrak Sewa</h1>
          <p class="page-subtitle">
            {isMobileViewport
              ? "Kelola kontrak aktif, perpanjangan, dan pengakhiran sewa"
              : "Kontrak bulanan yang berjalan sampai diakhiri"}
          </p>
        </div>

        <button
          type="button"
          class="btn-create-contract"
          onclick={openCreateOverlay}
        >
          Buat Kontrak
        </button>
      </div>

      <div class="desktop-filter-search-row">
        <div
          class="status-tabs"
          role="tablist"
          aria-label="Filter status kontrak"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "all"}
            class="status-tab tab-top {selectedStatus === 'all'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("all")}
          >
            Semua ({tabCounts.all})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "pending"}
            class="status-tab tab-top {selectedStatus === 'pending'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("pending")}
          >
            Menunggu ({tabCounts.pending})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "active"}
            class="status-tab tab-bottom {selectedStatus === 'active'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("active")}
          >
            Aktif ({tabCounts.active})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "completed"}
            class="status-tab tab-bottom {selectedStatus === 'completed'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("completed")}
          >
            Selesai ({tabCounts.completed})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "terminated"}
            class="status-tab tab-bottom {selectedStatus === 'terminated'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("terminated")}
          >
            Dihentikan ({tabCounts.terminated})
          </button>
        </div>

        <div class="desktop-search-wrap">
          <svg
            class="search-icon"
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
            class="desktop-search-input"
            bind:value={searchQuery}
            placeholder={isMobileViewport
              ? "Cari kode kontrak, kamar, atau penyewa..."
              : "Cari penyewa atau nomor kamar"}
            aria-label="Cari penyewa atau nomor kamar"
          />
        </div>
      </div>

      {#if isMobileViewport}
        <!-- LIST KARTU MOBILE -->
        <div class="mobile-card-list" in:fade={{ duration: 150 }}>
          {#if isLoading}
            <div class="mobile-empty-box">Memuat data kontrak...</div>
          {:else}
            {#each contracts as item (item.id)}
              <div
                class="mobile-contract-card"
                role="button"
                tabindex="0"
                onclick={() => openContractDetail(item)}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openContractDetail(item);
                  }
                }}
              >
                <div class="mobile-card-top">
                  <div>
                    <div class="mobile-card-code">
                      {formatContractCode(item)}
                    </div>
                    <div class="mobile-card-sub">
                      Kamar {item.room_number || item.room?.room_number || "-"} &middot;
                      {item.tenant_name || item.tenant?.name || "-"}
                    </div>
                  </div>
                  <span class="status-pill {getStatusClass(item.status)}">
                    {formatStatusLabel(item.status)}
                  </span>
                </div>

                <div class="mobile-card-bottom">
                  <div>
                    <span class="mobile-meta-lbl">Periode Sewa</span>
                    <span class="mobile-meta-val">
                      {formatDateId(item.start_date)} &ndash; {item.end_date
                        ? formatDateId(item.end_date)
                        : "Rolling"}
                    </span>
                  </div>
                  <div class="mobile-meta-right">
                    <span class="mobile-meta-lbl">Tarif / Bulan</span>
                    <span class="mobile-meta-val"
                      >{item.monthly_rate_rupiah ||
                        formatRupiah(item.monthly_rate)}</span
                    >
                  </div>
                </div>
              </div>
            {:else}
              <div class="mobile-empty-box">
                Tidak ada kontrak sewa ditemukan.
              </div>
            {/each}
          {/if}

          {#if paginationMeta.total_pages > 1}
            <div class="pagination-bar mobile-pagination">
              <button
                type="button"
                class="page-btn"
                onclick={handlePrevPage}
                disabled={currentPage <= 1 || isLoading}
              >
                Sebelumnya
              </button>
              <span class="pagination-page-info"
                >Hal {currentPage} / {paginationMeta.total_pages}</span
              >
              <button
                type="button"
                class="page-btn"
                onclick={handleNextPage}
                disabled={currentPage >= paginationMeta.total_pages ||
                  isLoading}
              >
                Berikutnya
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <!-- TABEL DAFTAR KONTRAK (DESKTOP) -->
        <section class="contracts-card" in:fade={{ duration: 160 }}>
          <div class="contracts-card-header">
            <h2 class="contracts-card-title">Daftar Kontrak</h2>
            <p class="contracts-card-subtitle">
              {perPage} kontrak per halaman, urut tanggal mulai terbaru
            </p>
          </div>

          <div class="table-wrap">
            <table class="contracts-table">
              <thead>
                <tr>
                  <th>Penyewa</th>
                  <th>Kamar</th>
                  <th>Tanggal Mulai</th>
                  <th>Jatuh Tempo Berikutnya</th>
                  <th>Status</th>
                  <th class="col-action">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {#if isLoading}
                  <tr>
                    <td colspan="6" class="empty-table-cell"
                      >Memuat data kontrak...</td
                    >
                  </tr>
                {:else}
                  {#each contracts as item (item.id)}
                    <tr>
                      <td class="cell-tenant"
                        >{item.tenant_name || item.tenant?.name || "-"}</td
                      >
                      <td class="cell-room"
                        >{item.room_number || item.room?.room_number || "-"}</td
                      >
                      <td class="cell-date">{formatDateId(item.start_date)}</td>
                      <td class="cell-due"
                        >{formatDateId(item.next_due_date)}</td
                      >
                      <td>
                        <span class="status-pill {getStatusClass(item.status)}">
                          {formatStatusLabel(item.status)}
                        </span>
                      </td>
                      <td class="col-action">
                        <div class="action-group">
                          <button
                            type="button"
                            class="btn-detail-box"
                            onclick={() => openContractDetail(item)}
                          >
                            Detail
                          </button>
                          {#if item.status === "active" || item.status === "pending"}
                            <button
                              type="button"
                              class="btn-danger-sm"
                              onclick={() => openTerminateOverlay(item)}
                            >
                              Akhiri
                            </button>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {:else}
                    <tr>
                      <td colspan="6" class="empty-table-cell"
                        >Tidak ada kontrak sewa ditemukan.</td
                      >
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>

          <p class="table-footnote">
            Kontrak baru berstatus Menunggu Pembayaran sampai invoice pertama
            lunas. Akhiri kontrak mengembalikan kamar ke Kosong dan membatalkan
            invoice terbuka.
          </p>

          <div class="pagination-bar">
            <span class="pagination-summary">
              {#if paginationMeta.total > 0}
                Menampilkan {startItemIndex}-{endItemIndex} dari {paginationMeta.total}
                kontrak
              {:else}
                Menampilkan 0 kontrak
              {/if}
            </span>
            <div class="pagination-controls">
              <span class="pagination-page-info"
                >Halaman {currentPage} dari {paginationMeta.total_pages ||
                  1}</span
              >
              <button
                type="button"
                class="page-btn"
                onclick={handlePrevPage}
                disabled={currentPage <= 1 || isLoading}
              >
                Sebelumnya
              </button>
              <button
                type="button"
                class="page-btn"
                onclick={handleNextPage}
                disabled={currentPage >= (paginationMeta.total_pages || 1) ||
                  isLoading}
              >
                Berikutnya
              </button>
            </div>
          </div>
        </section>
      {/if}
    </div>
  {/if}

  <!-- OVERLAY BUAT KONTRAK BARU -->
  {#if activeOverlay === "create"}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeOverlay}
      role="presentation"
    ></div>
    <aside
      class="right-sheet"
      transition:fly={{
        x: isMobileViewport ? 0 : 48,
        y: isMobileViewport ? 48 : 0,
        duration: 220,
        easing: cubicOut,
      }}
    >
      <div class="sheet-header">
        <h2 class="sheet-title">Buat Kontrak Baru</h2>
        <button type="button" class="sheet-close" onclick={closeOverlay}
          >&times;</button
        >
      </div>

      <form class="sheet-form" onsubmit={handleCreateContractSubmit}>
        <div class="form-field">
          <label class="field-label" for="select-tenant"
            >Pilih Akun Penyewa (Role Tenant)</label
          >
          <select
            id="select-tenant"
            class="field-control"
            bind:value={formTenantId}
            required
          >
            {#if availableTenantUsers.length === 0}
              <option value="" disabled
                >Tidak ada penyewa tanpa kontrak aktif</option
              >
            {:else}
              <option value="" disabled>-- Pilih Penyewa --</option>
              {#each availableTenantUsers as user (user.id)}
                <option value={String(user.id)}>
                  {user.name || user.full_name} ({user.email ||
                    user.phone ||
                    "Penyewa"})
                </option>
              {/each}
            {/if}
          </select>
        </div>

        <div class="form-field">
          <label class="field-label" for="select-room"
            >Pilih Kamar Tersedia</label
          >
          <select
            id="select-room"
            class="field-control"
            bind:value={formRoomId}
            required
          >
            {#if vacantRooms.length === 0}
              <option value="" disabled>Tidak ada kamar kosong tersedia</option>
            {:else}
              <option value="" disabled>-- Pilih Kamar --</option>
              {#each vacantRooms as rm (rm.id)}
                <option value={String(rm.id)}>
                  {rm.room_number || rm.code} &middot; {formatRupiah(
                    rm.price || rm.monthly_price,
                  )}/bln
                </option>
              {/each}
            {/if}
          </select>
        </div>

        <div class="form-field date-picker-anchor">
          <label class="field-label" for="start-date">Tanggal Mulai Sewa</label>
          <div class="date-input-trigger-wrap">
            <input
              id="start-date"
              type="text"
              readonly
              class="field-control date-trigger-input"
              value={formatDateId(formStartDate)}
              onclick={() => toggleDatePicker("start")}
              required
            />
            <button
              type="button"
              class="date-trigger-icon-btn"
              aria-label="Buka kalender tanggal mulai"
              onclick={() => toggleDatePicker("start")}
            >
              <svg
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
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </button>
          </div>

          {#if openDatePicker === "start"}
            <div
              class="calendar-popup"
              role="dialog"
              aria-label="Pilih tanggal mulai sewa"
              transition:fade={{ duration: 130 }}
            >
              <div class="cal-top-summary">
                <span class="cal-top-label">Pilih tanggal</span>
                <div class="cal-top-selected">
                  <span>{formatPickerHeaderDate(formStartDate)}</span>
                </div>
              </div>

              <div class="cal-month-bar">
                <button
                  type="button"
                  class="cal-nav-btn"
                  aria-label="Bulan sebelumnya"
                  onclick={prevPickerMonth}>&lsaquo;</button
                >
                <span class="cal-month-title"
                  >{MONTHS_FULL_ID[pickerMonth]} {pickerYear}</span
                >
                <button
                  type="button"
                  class="cal-nav-btn"
                  aria-label="Bulan berikutnya"
                  onclick={nextPickerMonth}>&rsaquo;</button
                >
              </div>

              <div class="cal-weekdays">
                {#each WEEKDAYS_ID as wd}
                  <span class="cal-weekday">{wd}</span>
                {/each}
              </div>

              <div class="cal-days-grid">
                {#each calendarCells as cell}
                  {#if cell.day === null}
                    <span class="cal-day-empty"></span>
                  {:else}
                    <button
                      type="button"
                      class="cal-day-btn {formStartDate === cell.iso
                        ? 'selected'
                        : ''} {getTodayLocalDate() === cell.iso ? 'today' : ''}"
                      onclick={() => selectCalendarDay(cell.day || 1)}
                    >
                      {cell.day}
                    </button>
                  {/if}
                {/each}
              </div>

              <div class="cal-footer-bar">
                <button
                  type="button"
                  class="cal-link-action"
                  onclick={selectTodayInPicker}>Hari Ini</button
                >
                <button
                  type="button"
                  class="cal-done-btn"
                  onclick={() => (openDatePicker = null)}>Tutup</button
                >
              </div>
            </div>
          {/if}
        </div>

        <div class="form-field">
          <label class="field-label" for="duration-months"
            >Durasi Sewa (Bulan)</label
          >
          <select
            id="duration-months"
            class="field-control"
            bind:value={formDurationMonths}
          >
            <option value="12">12 Bulan (1 Tahun)</option>
            <option value="6">6 Bulan</option>
            <option value="3">3 Bulan</option>
            <option value="1">1 Bulan</option>
            <option value="">Tanpa Batas Waktu (Rolling)</option>
          </select>
        </div>

        <div class="sheet-actions">
          <button
            type="submit"
            class="btn-brown-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : "Buat Kontrak"}
          </button>
          <button
            type="button"
            class="btn-white-outline"
            onclick={closeOverlay}
            disabled={isSubmitting}
          >
            Batal
          </button>
        </div>
      </form>
    </aside>
  {/if}

  <!-- OVERLAY PERPANJANG KONTRAK -->
  {#if activeOverlay === "extend" && targetContract}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeOverlay}
      role="presentation"
    ></div>
    <aside
      class="right-sheet"
      transition:fly={{
        x: isMobileViewport ? 0 : 48,
        y: isMobileViewport ? 48 : 0,
        duration: 220,
        easing: cubicOut,
      }}
    >
      <div class="sheet-header">
        <h2 class="sheet-title">
          Perpanjang Kontrak {formatContractCode(targetContract)}
        </h2>
        <button type="button" class="sheet-close" onclick={closeOverlay}
          >&times;</button
        >
      </div>

      <form class="sheet-form" onsubmit={handleExtendContractSubmit}>
        <div class="form-field date-picker-anchor">
          <label class="field-label" for="extend-date">Tanggal Akhir Baru</label
          >
          <div class="date-input-trigger-wrap">
            <input
              id="extend-date"
              type="text"
              readonly
              class="field-control date-trigger-input"
              value={extendEndDate ? formatDateId(extendEndDate) : ""}
              placeholder="Tanpa batas waktu (Rolling)"
              onclick={() => toggleDatePicker("extend")}
            />
            <button
              type="button"
              class="date-trigger-icon-btn"
              aria-label="Buka kalender tanggal akhir"
              onclick={() => toggleDatePicker("extend")}
            >
              <svg
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
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </button>
          </div>

          {#if openDatePicker === "extend"}
            <div
              class="calendar-popup"
              role="dialog"
              aria-label="Pilih tanggal akhir baru"
              transition:fade={{ duration: 130 }}
            >
              <div class="cal-top-summary">
                <span class="cal-top-label">Pilih tanggal</span>
                <div class="cal-top-selected">
                  <span
                    >{extendEndDate
                      ? formatPickerHeaderDate(extendEndDate)
                      : "Rolling"}</span
                  >
                </div>
              </div>

              <div class="cal-month-bar">
                <button
                  type="button"
                  class="cal-nav-btn"
                  aria-label="Bulan sebelumnya"
                  onclick={prevPickerMonth}>&lsaquo;</button
                >
                <span class="cal-month-title"
                  >{MONTHS_FULL_ID[pickerMonth]} {pickerYear}</span
                >
                <button
                  type="button"
                  class="cal-nav-btn"
                  aria-label="Bulan berikutnya"
                  onclick={nextPickerMonth}>&rsaquo;</button
                >
              </div>

              <div class="cal-weekdays">
                {#each WEEKDAYS_ID as wd}
                  <span class="cal-weekday">{wd}</span>
                {/each}
              </div>

              <div class="cal-days-grid">
                {#each calendarCells as cell}
                  {#if cell.day === null}
                    <span class="cal-day-empty"></span>
                  {:else}
                    <button
                      type="button"
                      class="cal-day-btn {extendEndDate === cell.iso
                        ? 'selected'
                        : ''} {getTodayLocalDate() === cell.iso ? 'today' : ''}"
                      onclick={() => selectCalendarDay(cell.day || 1)}
                    >
                      {cell.day}
                    </button>
                  {/if}
                {/each}
              </div>

              <div class="cal-footer-bar">
                <button
                  type="button"
                  class="cal-link-action"
                  onclick={clearExtendDateInPicker}>Kosongkan</button
                >
                <button
                  type="button"
                  class="cal-done-btn"
                  onclick={() => (openDatePicker = null)}>Tutup</button
                >
              </div>
            </div>
          {/if}

          <span class="field-hint"
            >Kosongkan untuk mengubah ke kontrak rolling tanpa batas waktu.</span
          >
        </div>

        <div class="sheet-actions">
          <button
            type="submit"
            class="btn-brown-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : "Simpan Perpanjangan"}
          </button>
          <button
            type="button"
            class="btn-white-outline"
            onclick={closeOverlay}
            disabled={isSubmitting}
          >
            Batal
          </button>
        </div>
      </form>
    </aside>
  {/if}

  <!-- MODAL AKHIRI KONTRAK -->
  {#if activeOverlay === "terminate" && targetContract}
    <div
      class="overlay-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeOverlay}
      role="presentation"
    ></div>
    <div
      class="confirm-modal"
      role="dialog"
      aria-modal="true"
      transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
    >
      {#if isMobileViewport}
        <div class="sheet-grab-bar"></div>
      {/if}
      <h3 class="confirm-title">
        Akhiri kontrak {formatContractCode(targetContract)}?
      </h3>
      <p class="confirm-desc">
        Status kamar {targetContract.room_number ||
          targetContract.room?.room_number ||
          "-"} akan otomatis dikembalikan menjadi Kosong dan penagihan berikutnya
        dihentikan.
      </p>

      <div class="confirm-actions">
        <button
          type="button"
          class="btn-confirm-red"
          onclick={handleTerminateContractConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Memproses..." : "Ya, lanjutkan"}
        </button>
        <button
          type="button"
          class="btn-cancel-confirm"
          onclick={closeOverlay}
          disabled={isSubmitting}
        >
          Batal
        </button>
      </div>
    </div>
  {/if}
</DashboardLayout>

<style>
  .list-page-wrap,
  .detail-page-wrap {
    letter-spacing: normal;
  }

  .toast-banner {
    position: fixed;
    top: 76px;
    right: 24px;
    z-index: 80;
    padding: 10px 16px;
    border-radius: 10px;
    background-color: #261a14;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(24, 18, 14, 0.18);
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    margin-bottom: 14px;
    border-radius: 8px;
    background-color: #fff5f5;
    border: 1px solid #f3c6c6;
    color: #c92a2a;
    font-size: 12px;
  }

  .retry-link-btn {
    border: none;
    background: transparent;
    color: #c92a2a;
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
  }

  .contracts-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .page-title {
    margin: 0 0 4px;
    font-size: 24px;
    font-weight: 700;
    color: #261a14;
    letter-spacing: -0.01em;
  }

  .page-subtitle {
    margin: 0;
    font-size: 12px;
    color: #9e8b7c;
  }

  .btn-create-contract {
    height: 36px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .desktop-filter-search-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  .status-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .status-tab {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #e6ddd2;
    border-radius: 999px;
    background-color: #ffffff;
    color: #5c4d42;
    font-size: 12px;
    cursor: pointer;
  }

  .status-tab.active {
    border-color: #5c432d;
    background-color: #5c432d;
    color: #ffffff;
    font-weight: 600;
  }

  .desktop-search-wrap {
    position: relative;
    width: 260px;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    color: #9e8b7c;
    pointer-events: none;
  }

  .desktop-search-input {
    width: 100%;
    height: 36px;
    padding: 0 12px 0 36px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    box-sizing: border-box;
  }

  .contracts-card {
    padding: 22px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .contracts-card-header {
    margin-bottom: 16px;
  }

  .contracts-card-title {
    margin: 0 0 3px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .contracts-card-subtitle {
    margin: 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .contracts-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .contracts-table th {
    padding: 10px 12px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
  }

  .contracts-table td {
    padding: 13px 12px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
    color: #261a14;
    vertical-align: middle;
  }

  .empty-table-cell {
    text-align: center;
    color: #9e8b7c;
    padding: 24px 12px !important;
  }

  .cell-tenant {
    font-weight: 600;
    color: #261a14;
  }

  .cell-room {
    color: #3c2e25;
  }

  .cell-date,
  .cell-due {
    color: #b08968;
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

  .status-pill.active {
    background-color: #dcfce7;
    color: #15803d;
  }

  .status-pill.expiring {
    background-color: #fef3c7;
    color: #b45309;
  }

  .status-pill.completed {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .status-pill.ended {
    background-color: #f3efe9;
    color: #7c6858;
  }

  .status-pill.failed {
    background-color: #ffe4e6;
    color: #e11d48;
  }

  /* BADGE STATUS TIKET SESUAI LAPORAN KERUSAKAN */
  .ticket-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .ticket-badge.ticket-pending {
    background-color: #fef3c7;
    color: #b45309;
  }

  .ticket-badge.ticket-in-progress {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .ticket-badge.ticket-resolved {
    background-color: #dcfce7;
    color: #15803d;
  }

  .col-action {
    text-align: right;
  }

  .action-group {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }

  .btn-detail-box {
    height: 28px;
    padding: 0 11px;
    border: 1px solid #e2d8cd;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-danger-sm {
    height: 28px;
    padding: 0 11px;
    border: none;
    border-radius: 6px;
    background-color: #e02424;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .table-footnote {
    margin: 14px 0 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 14px;
    margin-top: 10px;
    border-top: 1px solid #f4ede5;
  }

  .pagination-summary,
  .pagination-page-info {
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .page-btn {
    height: 30px;
    padding: 0 12px;
    border: 1px solid #e2d8cd;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    cursor: pointer;
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- DETAIL PAGE GRID & CARDS --- */
  .btn-back-link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    width: fit-content;
    padding: 0;
    border: none;
    background: transparent;
    color: #9e8b7c;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    margin-bottom: 10px;
    text-align: left;
  }

  .detail-top-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .detail-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 3px;
  }

  .desktop-detail-heading {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    line-height: 1.25;
    color: #261a14;
    letter-spacing: -0.01em;
  }

  .desktop-detail-sub {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: #9e8b7c;
  }

  .detail-header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn-extend-white {
    height: 34px;
    padding: 0 14px;
    border: 1px solid #e2d8cd;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-terminate-red {
    height: 34px;
    padding: 0 14px;
    border: none;
    border-radius: 8px;
    background-color: #e02424;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .detail-main-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.75fr) minmax(270px, 1fr);
    gap: 14px;
    align-items: start;
  }

  .detail-col-left,
  .detail-col-right {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .figma-card {
    padding: 18px 20px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .figma-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .figma-card-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
    color: #261a14;
    letter-spacing: normal;
  }

  .card-title-mb {
    margin-bottom: 10px;
  }

  .badge-pill-soft {
    padding: 3px 10px;
    border-radius: 999px;
    background-color: #f3efe9;
    color: #6b5b4e;
    font-size: 11px;
    font-weight: 500;
  }

  .summary-two-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 18px;
  }

  .compact-grid {
    gap: 10px 14px;
  }

  .summary-lbl {
    display: block;
    font-size: 11px;
    line-height: 1.3;
    color: #9e8b7c;
    margin-bottom: 2px;
  }

  .summary-val {
    display: block;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    color: #261a14;
  }

  .mini-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .mini-table th {
    padding: 8px 8px;
    border-bottom: 1px solid #f0e8df;
    font-size: 10px;
    font-weight: 600;
    color: #9e8b7c;
  }

  .mini-table td {
    padding: 10px 8px;
    border-bottom: 1px solid #f4ede5;
    font-size: 11px;
    color: #261a14;
    vertical-align: middle;
  }

  .cell-muted-date {
    color: #b08968 !important;
  }

  /* MOBILE PAYMENT CARD */
  .mobile-payment-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mobile-payment-card {
    padding: 12px;
    border: 1px solid #f0e8df;
    border-radius: 10px;
    background-color: #fcfaf7;
  }

  .mobile-payment-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid #f2eae1;
  }

  .mobile-payment-period {
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
    margin-bottom: 2px;
  }

  .mobile-payment-amount {
    font-size: 14px;
    font-weight: 700;
    color: #261a14;
  }

  .mobile-payment-meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
  }

  .mobile-payment-meta-val {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: #261a14;
  }

  .mini-pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 12px;
    flex-wrap: wrap;
  }

  .empty-sub-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: #9e8b7c;
  }

  .ticket-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ticket-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
  }

  .ticket-clickable {
    cursor: pointer;
    border-radius: 6px;
    transition: background-color 0.15s ease;
  }

  .ticket-clickable:hover {
    background-color: #faf7f2;
  }

  .ticket-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .ticket-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ticket-code {
    font-weight: 700;
    color: #261a14;
  }

  .ticket-cat {
    color: #5c4d42;
  }

  .ticket-date {
    font-size: 11px;
    color: #b08968;
  }

  .invoice-number-sub {
    font-size: 11px;
    line-height: 1.3;
    color: #9e8b7c;
    margin-bottom: 3px;
  }

  .invoice-amount-big {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.25;
    color: #261a14;
    margin-bottom: 10px;
    letter-spacing: -0.01em;
  }

  .kv-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .kv-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
  }

  .kv-label {
    color: #9e8b7c;
  }

  .kv-value {
    font-weight: 600;
    color: #261a14;
  }

  .kv-danger {
    color: #d93829;
  }

  .tenant-profile-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .tenant-avatar {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    background-color: #f3ede6;
    color: #5c432d;
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tenant-profile-name {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.3;
    color: #261a14;
  }

  .tenant-profile-sub {
    font-size: 11px;
    line-height: 1.3;
    color: #9e8b7c;
  }

  .kv-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .kv-two-mini {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .facility-block {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #f4ede5;
  }

  /* OVERLAY & SHEET */
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background-color: rgba(24, 18, 14, 0.45);
  }

  .right-sheet {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    width: 100%;
    max-width: 440px;
    padding: 24px;
    background-color: #ffffff;
    box-shadow: -8px 0 28px rgba(24, 18, 14, 0.14);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
  }

  .sheet-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #261a14;
  }

  .sheet-close {
    border: none;
    background: transparent;
    font-size: 22px;
    color: #8c7b6e;
    cursor: pointer;
  }

  .sheet-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .date-picker-anchor {
    position: relative;
  }

  .date-input-trigger-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .date-trigger-input {
    padding-right: 36px;
    cursor: pointer;
  }

  .date-trigger-icon-btn {
    position: absolute;
    right: 6px;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #684b36;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .date-trigger-icon-btn:hover {
    background-color: #f6f1eb;
  }

  /* POPUP DATE PICKER KALENDER */
  .calendar-popup {
    margin-top: 4px;
    padding: 12px;
    border: 1px solid #e4dad0;
    border-radius: 12px;
    background-color: #ffffff;
    box-shadow: 0 10px 24px rgba(24, 18, 14, 0.12);
    z-index: 30;
  }

  .cal-top-summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 1px solid #f2eae1;
  }

  .cal-top-label {
    font-size: 10px;
    font-weight: 600;
    color: #9e8b7c;
  }

  .cal-top-selected {
    font-size: 14px;
    font-weight: 700;
    color: #261a14;
  }

  .cal-month-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .cal-month-title {
    font-size: 12px;
    font-weight: 700;
    color: #261a14;
  }

  .cal-nav-btn {
    width: 28px;
    height: 28px;
    border: 1px solid #ece3d9;
    border-radius: 6px;
    background-color: #ffffff;
    color: #5c432d;
    font-size: 15px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .cal-nav-btn:hover {
    background-color: #f6f1eb;
  }

  .cal-weekdays {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
    margin-bottom: 4px;
    text-align: center;
  }

  .cal-weekday {
    font-size: 10px;
    font-weight: 600;
    color: #9e8b7c;
    padding: 4px 0;
  }

  .cal-days-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 3px;
  }

  .cal-day-empty {
    height: 30px;
  }

  .cal-day-btn {
    height: 30px;
    border: none;
    border-radius: 999px;
    background-color: transparent;
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .cal-day-btn:hover {
    background-color: #f3ede6;
  }

  .cal-day-btn.today {
    border: 1px solid #684b36;
    font-weight: 700;
  }

  .cal-day-btn.selected {
    background-color: #684b36;
    color: #ffffff;
    font-weight: 700;
  }

  .cal-footer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #f2eae1;
  }

  .cal-link-action {
    border: none;
    background: transparent;
    color: #684b36;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 6px;
  }

  .cal-done-btn {
    height: 26px;
    padding: 0 12px;
    border: 1px solid #e4dad0;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .field-label {
    font-size: 12px;
    font-weight: 600;
    color: #261a14;
  }

  .field-hint {
    font-size: 10px;
    color: #9e8b7c;
  }

  .field-control {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    box-sizing: border-box;
  }

  .sheet-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }

  .btn-brown-primary {
    height: 38px;
    width: 100%;
    border: none;
    border-radius: 8px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-brown-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-white-outline {
    height: 38px;
    width: 100%;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .confirm-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 70;
    width: 92%;
    max-width: 440px;
    padding: 22px 24px;
    border-radius: 12px;
    background-color: #ffffff;
    box-shadow: 0 14px 36px rgba(24, 18, 14, 0.22);
    box-sizing: border-box;
  }

  .confirm-title {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .confirm-desc {
    margin: 0 0 20px;
    font-size: 12px;
    line-height: 1.5;
    color: #8c7b6e;
  }

  .confirm-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-confirm-red {
    height: 36px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background-color: #e02424;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-cancel-confirm {
    height: 36px;
    padding: 0 16px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  /* --- MOBILE RESPONSIVE OVERRIDES (<= 768px) --- */
  @media (max-width: 768px) {
    .toast-banner {
      top: 68px;
      right: 14px;
      left: 14px;
      text-align: center;
    }

    .contracts-top-bar {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      margin-bottom: 14px;
    }

    .page-title {
      font-size: 22px;
    }

    .btn-create-contract {
      width: 100%;
      height: 40px;
      font-size: 13px;
    }

    .desktop-filter-search-row {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      margin-bottom: 14px;
    }

    .status-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .status-tab {
      height: 36px;
      padding: 0 10px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      box-sizing: border-box;
      border-radius: 999px;
    }

    .status-tab:nth-child(-n + 2) {
      flex: 0 0 calc(50% - 4px);
    }

    .status-tab:nth-child(n + 3) {
      flex: 0 0 calc(33.3333% - 5.34px);
    }

    .desktop-search-wrap {
      width: 100%;
    }

    .desktop-search-input {
      height: 38px;
      font-size: 12px;
    }

    .mobile-card-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-contract-card {
      padding: 14px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
      cursor: pointer;
    }

    .mobile-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid #f4ede5;
    }

    .mobile-card-code {
      font-size: 13px;
      font-weight: 700;
      color: #261a14;
      margin-bottom: 2px;
    }

    .mobile-card-sub {
      font-size: 11px;
      color: #8c7b6e;
    }

    .mobile-card-bottom {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px;
      padding-top: 10px;
    }

    .mobile-meta-lbl {
      display: block;
      font-size: 10px;
      color: #9e8b7c;
      margin-bottom: 2px;
    }

    .mobile-meta-val {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #261a14;
    }

    .mobile-meta-right {
      text-align: right;
    }

    .mobile-empty-box {
      padding: 24px 14px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
      text-align: center;
      font-size: 12px;
      color: #9e8b7c;
    }

    .mobile-pagination {
      border-top: none;
      padding-top: 4px;
    }

    /* --- MOBILE DETAIL PAGE ADJUSTMENTS --- */
    .detail-top-header {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      margin-bottom: 12px;
    }

    .detail-title-row {
      justify-content: space-between;
      width: 100%;
    }

    .desktop-detail-heading {
      font-size: 20px;
    }

    .detail-header-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    .btn-extend-white,
    .btn-terminate-red {
      width: 100%;
      height: 38px;
    }

    .detail-main-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }

    .detail-col-left,
    .detail-col-right {
      gap: 12px;
    }

    .figma-card {
      padding: 15px 16px;
      border-radius: 10px;
    }

    .summary-two-col {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 12px;
    }

    .right-sheet {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 100%;
      max-height: 88vh;
      border-radius: 18px 18px 0 0;
      padding: 20px 18px 24px;
    }

    .cal-day-btn,
    .cal-day-empty {
      height: 34px;
    }

    .confirm-modal {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      transform: none;
      width: 100%;
      max-width: 100%;
      border-radius: 18px 18px 0 0;
      padding: 14px 18px 24px;
    }

    .sheet-grab-bar {
      width: 36px;
      height: 4px;
      border-radius: 999px;
      background-color: #e2d8cd;
      margin: 0 auto 14px;
    }

    .confirm-actions {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .btn-confirm-red,
    .btn-cancel-confirm {
      width: 100%;
      height: 38px;
    }
  }
</style>
