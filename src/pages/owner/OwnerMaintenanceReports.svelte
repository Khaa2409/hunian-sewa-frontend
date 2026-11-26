<script>
  import { onMount, onDestroy } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest } from "../../services/api.js";

  /** @type {'all' | 'waiting_confirm' | 'in_progress' | 'completed'} */
  let selectedStatus = $state("all");
  let searchQuery = $state("");
  let currentPage = $state(1);
  const perPage = 10;

  // --- STATE DATA DAFTAR API ---
  let loading = $state(true);
  let errorMsg = $state("");
  /** @type {any[]} */
  let reports = $state([]);
  /** @type {any[]} */
  let allTicketsCache = $state([]);
  let totalCount = $state(0);
  let totalPages = $state(1);
  let statusCounts = $state({
    all: 0,
    waiting_confirm: 0,
    in_progress: 0,
    completed: 0,
  });

  /**
   * Pemetaan query param status ke backend untuk tiap tab.
   * @type {Record<'waiting_confirm' | 'in_progress' | 'completed', string[]>}
   */
  const backendStatusCandidates = {
    waiting_confirm: ["waiting_confirm", "pending", "waiting"],
    in_progress: ["in_progress", "progress"],
    completed: ["completed", "resolved", "done"],
  };

  /** @type {Record<'waiting_confirm' | 'in_progress' | 'completed', string>} */
  let resolvedBackendStatus = $state({
    waiting_confirm: "waiting_confirm",
    in_progress: "in_progress",
    completed: "completed",
  });

  // --- STATE DETAIL & LIGHTBOX FOTO ---
  /** @type {'list' | 'detail'} */
  let viewMode = $state("list");
  /** @type {any | null} */
  let selectedReport = $state(null);
  let detailLoading = $state(false);
  let detailError = $state("");
  let isPhotoModalOpen = $state(false);
  let photoObjectUrl = $state("");
  let photoBlobLoading = $state(false);
  let photoBlobError = $state("");
  let activePhotoFetchSeq = 0;

  let displayOwnerName = $derived($currentUser?.name || "Bu Ratna");
  let displayOwnerRole = $derived.by(() => {
    const role = ($currentUser?.role || "owner").toLowerCase();
    if (role === "owner") return "Pemilik";
    return $currentUser?.role || "Pemilik";
  });

  function getAuthToken() {
    if (typeof window === "undefined") return "";
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("auth_token") ||
      localStorage.getItem("access_token") ||
      ""
    );
  }

  function revokeCurrentPhotoUrl() {
    if (
      photoObjectUrl &&
      typeof URL !== "undefined" &&
      photoObjectUrl.startsWith("blob:")
    ) {
      URL.revokeObjectURL(photoObjectUrl);
    }
    photoObjectUrl = "";
  }

  /**
   * @param {string} rawPhoto
   * @returns {string}
   */
  function resolveFileEndpointPath(rawPhoto) {
    const trimmed = String(rawPhoto || "").trim();
    if (!trimmed) return "";

    if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
      return trimmed;
    }

    if (trimmed.startsWith("/api/files/")) {
      return trimmed;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        const match = parsed.pathname.match(/\/api\/files\/([^/?#]+)/);
        if (match && match[1]) {
          return `/api/files/${encodeURIComponent(decodeURIComponent(match[1]))}`;
        }
        return trimmed;
      } catch {
        return trimmed;
      }
    }

    const cleaned = trimmed
      .replace(/^\/+/, "")
      .replace(/^api\/files\//i, "")
      .replace(/^uploads\//i, "");
    const filename = cleaned.split("/").pop() || cleaned;
    return `/api/files/${encodeURIComponent(filename)}`;
  }

  /**
   * @param {string} rawPhoto
   */
  async function loadProtectedPhotoBlob(rawPhoto) {
    const seq = ++activePhotoFetchSeq;
    revokeCurrentPhotoUrl();
    photoBlobError = "";

    const targetPath = resolveFileEndpointPath(rawPhoto);
    if (!targetPath) {
      photoBlobLoading = false;
      return;
    }

    if (targetPath.startsWith("blob:") || targetPath.startsWith("data:")) {
      photoObjectUrl = targetPath;
      photoBlobLoading = false;
      return;
    }

    if (
      /^https?:\/\//i.test(targetPath) &&
      !targetPath.includes("/api/files/")
    ) {
      photoObjectUrl = targetPath;
      photoBlobLoading = false;
      return;
    }

    photoBlobLoading = true;
    try {
      const token = getAuthToken();
      /** @type {Record<string, string>} */
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(targetPath, { headers });
      if (!res.ok) {
        throw new Error(`Gagal memuat foto (HTTP ${res.status})`);
      }

      const blobResult = await res.blob();
      if (seq !== activePhotoFetchSeq) {
        if (typeof URL !== "undefined") {
          const tempUrl = URL.createObjectURL(blobResult);
          URL.revokeObjectURL(tempUrl);
        }
        return;
      }

      if (typeof URL !== "undefined") {
        photoObjectUrl = URL.createObjectURL(blobResult);
      }
    } catch (/** @type {any} */ err) {
      if (seq === activePhotoFetchSeq) {
        photoBlobError = err?.message || "Gagal memuat foto bukti kendala.";
      }
    } finally {
      if (seq === activePhotoFetchSeq) {
        photoBlobLoading = false;
      }
    }
  }

  /**
   * @param {any} dateValue
   * @returns {string}
   */
  function formatDate(dateValue) {
    if (!dateValue) return "-";
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  /**
   * @param {any} dateValue
   * @returns {string}
   */
  function formatDateTime(dateValue) {
    if (!dateValue) return "-";
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * @param {any} rawStatus
   * @returns {'waiting_confirm' | 'in_progress' | 'completed'}
   */
  function normalizeStatus(rawStatus) {
    const val = String(rawStatus || "").toLowerCase();
    if (
      val === "resolved" ||
      val === "completed" ||
      val === "done" ||
      val === "selesai" ||
      val === "closed"
    ) {
      return "completed";
    }
    if (
      val === "in_progress" ||
      val === "progress" ||
      val === "diproses" ||
      val === "processing"
    ) {
      return "in_progress";
    }
    return "waiting_confirm";
  }

  /**
   * @param {'waiting_confirm' | 'in_progress' | 'completed'} normalizedStatus
   * @param {any} rawStatus
   * @returns {string}
   */
  function mapStatusLabel(normalizedStatus, rawStatus) {
    if (normalizedStatus === "completed") return "Selesai";
    if (normalizedStatus === "in_progress") return "Diproses";
    if (rawStatus === "pending") return "Menunggu Konfirmasi";
    return "Menunggu Konfirmasi";
  }

  /**
   * @param {'waiting_confirm' | 'in_progress' | 'completed'} normalizedStatus
   */
  function mapMobileStatus(normalizedStatus) {
    if (normalizedStatus === "completed") {
      return { mobileStatus: "completed", mobileStatusLabel: "Selesai" };
    }
    if (normalizedStatus === "in_progress") {
      return { mobileStatus: "in_progress", mobileStatusLabel: "Diproses" };
    }
    return { mobileStatus: "waiting", mobileStatusLabel: "Menunggu" };
  }

  /**
   * @param {any} rawCategory
   */
  function mapCategoryLabels(rawCategory) {
    const cat = rawCategory || "Lainnya";
    let mobileCat = cat;
    const lower = cat.toLowerCase();
    if (
      lower.includes("air") ||
      lower.includes("sanitasi") ||
      lower.includes("wastafel")
    ) {
      mobileCat = "Air";
    } else if (
      lower.includes("wifi") ||
      lower.includes("internet") ||
      lower.includes("furnitur")
    ) {
      mobileCat = "Fasilitas Kamar";
    }
    return { category: cat, mobileCategory: mobileCat };
  }

  /**
   * @param {any} raw
   * @returns {string}
   */
  function extractPhotoUrl(raw) {
    if (!raw || typeof raw !== "object") return "";
    const candidate =
      raw.photo_url ||
      raw.image_url ||
      raw.evidence_url ||
      raw.attachment_url ||
      raw.photo ||
      raw.image ||
      (Array.isArray(raw.photos) && raw.photos[0]) ||
      (Array.isArray(raw.attachments) && raw.attachments[0]) ||
      (Array.isArray(raw.images) && raw.images[0]) ||
      "";

    if (typeof candidate === "string") return candidate;
    if (candidate && typeof candidate === "object") {
      return (
        candidate.url ||
        candidate.photo_url ||
        candidate.image_url ||
        candidate.filename ||
        candidate.path ||
        ""
      );
    }
    return "";
  }

  /**
   * @param {any} rawList
   * @param {any} fallbackTicket
   */
  function normalizeDiscussionList(rawList, fallbackTicket) {
    if (!Array.isArray(rawList)) return [];
    const currentUserId = $currentUser?.id;

    return rawList.map((msg, idx) => {
      const senderName =
        msg.sender_name ||
        msg.author_name ||
        msg.user_name ||
        msg.sender?.name ||
        msg.user?.name ||
        "Pengguna";
      const roleRaw = String(
        msg.user_role ||
          msg.sender_role ||
          msg.role ||
          msg.sender?.role ||
          msg.user?.role ||
          "",
      ).toLowerCase();

      let roleLabel = "";
      if (roleRaw === "tenant" || roleRaw === "penyewa") roleLabel = "Penyewa";
      else if (
        roleRaw === "caretaker" ||
        roleRaw === "pengelola" ||
        roleRaw === "admin"
      )
        roleLabel = "Pengelola";
      else if (roleRaw === "owner" || roleRaw === "pemilik")
        roleLabel = "Pemilik";

      const timeStr = formatDateTime(
        msg.created_at || msg.sent_at || msg.timestamp,
      );
      const isRightAligned =
        roleRaw === "caretaker" ||
        roleRaw === "pengelola" ||
        roleRaw === "admin" ||
        (currentUserId && msg.sender_id === currentUserId);

      const authorWithRole = roleLabel
        ? `${senderName} (${roleLabel})`
        : senderName;
      const senderMeta = roleLabel
        ? `${senderName} · ${roleLabel}${timeStr !== "-" ? ` · ${timeStr}` : ""}`
        : `${senderName}${timeStr !== "-" ? ` · ${timeStr}` : ""}`;

      return {
        id: msg.id ?? `msg-${fallbackTicket?.id || "x"}-${idx}`,
        sender: senderMeta,
        shortAuthor: authorWithRole,
        shortTime: formatDate(msg.created_at || msg.sent_at || msg.timestamp),
        align: isRightAligned ? "right" : "left",
        text: msg.message || msg.content || msg.text || msg.comment || "",
      };
    });
  }

  /**
   * @param {any} raw
   */
  function normalizeTicketItem(raw) {
    const status = normalizeStatus(raw.status);
    const mobileStatusInfo = mapMobileStatus(status);
    const catInfo = mapCategoryLabels(raw.category || raw.category_name);
    const roomNum =
      raw.room_number || raw.room_code || raw.room?.room_number || "-";
    const tenantName =
      raw.tenant_name ||
      raw.reporter_name ||
      raw.user_name ||
      raw.tenant?.name ||
      "-";
    const photoUrl = extractPhotoUrl(raw);

    const rawComments =
      raw.comments ||
      raw.messages ||
      raw.discussions ||
      raw.ticket_comments ||
      raw.replies ||
      raw.chats ||
      [];

    return {
      id: raw.id,
      ticketCode:
        raw.ticket_number ||
        raw.ticket_code ||
        `T-${String(raw.id || 0).padStart(4, "0")}`,
      title:
        raw.title ||
        raw.subject ||
        `Kendala ${catInfo.category} Kamar ${roomNum}`,
      roomNumber: roomNum,
      locationOrRoom:
        raw.location || (roomNum !== "-" ? `Kamar ${roomNum}` : "Area Umum"),
      tenant: tenantName,
      reporter: raw.reporter_name || tenantName,
      category: catInfo.category,
      mobileCategory: catInfo.mobileCategory,
      reportedDate: formatDate(raw.created_at || raw.reported_at),
      reportedDateTime: formatDateTime(raw.created_at || raw.reported_at),
      status,
      rawStatus: raw.status,
      statusLabel: mapStatusLabel(status, raw.status),
      ...mobileStatusInfo,
      description: raw.description || raw.detail || "-",
      techNote:
        raw.technical_note ||
        raw.technician_note ||
        raw.resolution_note ||
        raw.admin_note ||
        raw.notes ||
        "Belum ada catatan teknis dari pengelola.",
      photoUrl,
      photoCaption: photoUrl
        ? "Foto Bukti - Klik untuk memperbesar"
        : "Foto - Klik untuk memperbesar",
      discussion: normalizeDiscussionList(rawComments, raw),
    };
  }

  /**
   * @param {any} err
   * @returns {boolean}
   */
  function isInvalidStatusError(err) {
    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("status tidak valid") || msg.includes("invalid status");
  }

  /**
   * @param {any[]} items
   */
  function computeCountsFromItems(items) {
    let waiting = 0;
    let progress = 0;
    let completed = 0;
    for (const item of items) {
      if (item.status === "completed") completed += 1;
      else if (item.status === "in_progress") progress += 1;
      else waiting += 1;
    }
    return {
      all: items.length,
      waiting_confirm: waiting,
      in_progress: progress,
      completed,
    };
  }

  /**
   * @param {any} response
   * @param {any[]} items
   */
  function applyCountsFromResponse(response, items) {
    const countsObj =
      response?.counts || response?.meta?.counts || response?.summary;
    if (countsObj && typeof countsObj === "object") {
      const waitingVal = Number(
        countsObj.waiting_confirm ??
          countsObj.waiting ??
          countsObj.pending ??
          0,
      );
      const progressVal = Number(
        countsObj.in_progress ?? countsObj.progress ?? 0,
      );
      const completedVal = Number(
        countsObj.completed ?? countsObj.resolved ?? countsObj.done ?? 0,
      );
      const allVal = Number(
        countsObj.all ??
          countsObj.total ??
          waitingVal + progressVal + completedVal,
      );

      if (allVal > 0 || waitingVal > 0 || progressVal > 0 || completedVal > 0) {
        statusCounts = {
          all: Number.isFinite(allVal) ? allVal : items.length,
          waiting_confirm: Number.isFinite(waitingVal) ? waitingVal : 0,
          in_progress: Number.isFinite(progressVal) ? progressVal : 0,
          completed: Number.isFinite(completedVal) ? completedVal : 0,
        };
        return;
      }
    }

    if (allTicketsCache.length > 0) {
      statusCounts = computeCountsFromItems(allTicketsCache);
    } else if (selectedStatus === "all") {
      const computed = computeCountsFromItems(items);
      statusCounts = {
        ...computed,
        all: Math.max(totalCount, items.length),
      };
    }
  }

  /**
   * @param {string} statusParamValue
   */
  async function requestTicketsWithStatusParam(statusParamValue) {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", String(perPage));

    if (statusParamValue) {
      params.set("status", statusParamValue);
    }

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }

    return await apiRequest(`/api/tickets?${params.toString()}`);
  }

  async function fetchAllTicketsForCache() {
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "100");
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      /** @type {any} */
      const response = await apiRequest(`/api/tickets?${params.toString()}`);
      const rawItems = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.tickets)
          ? response.tickets
          : [];
      const normalized = rawItems.map(normalizeTicketItem);
      allTicketsCache = normalized;
      statusCounts = computeCountsFromItems(normalized);
      return normalized;
    } catch {
      return allTicketsCache;
    }
  }

  /**
   * @param {any} item
   * @returns {boolean}
   */
  function matchesSelectedStatus(item) {
    return item.status === selectedStatus;
  }

  async function fetchTickets() {
    loading = true;
    errorMsg = "";

    try {
      /** @type {any} */
      let response = null;

      if (selectedStatus === "all") {
        response = await requestTicketsWithStatusParam("");
      } else {
        const preferred = resolvedBackendStatus[selectedStatus];
        const candidates = [
          preferred,
          ...backendStatusCandidates[selectedStatus].filter(
            (c) => c !== preferred,
          ),
        ];

        let lastErr = null;
        for (const candidateStatus of candidates) {
          try {
            response = await requestTicketsWithStatusParam(candidateStatus);
            resolvedBackendStatus = {
              ...resolvedBackendStatus,
              [selectedStatus]: candidateStatus,
            };
            lastErr = null;
            break;
          } catch (/** @type {any} */ err) {
            lastErr = err;
            if (!isInvalidStatusError(err)) {
              throw err;
            }
          }
        }

        if (!response && lastErr && isInvalidStatusError(lastErr)) {
          const allItems = await fetchAllTicketsForCache();
          const filteredByStatus = allItems.filter(matchesSelectedStatus);
          const startIdx = (currentPage - 1) * perPage;
          reports = filteredByStatus.slice(startIdx, startIdx + perPage);
          totalCount = filteredByStatus.length;
          totalPages = Math.max(1, Math.ceil(totalCount / perPage));
          return;
        }
      }

      const rawItems = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.tickets)
          ? response.tickets
          : [];

      const normalized = rawItems.map(normalizeTicketItem);
      reports = normalized;

      const pagination = response?.pagination || response?.meta || {};
      totalCount = Number(
        pagination.total ?? response?.total ?? normalized.length,
      );
      totalPages = Math.max(
        1,
        Number(
          pagination.total_pages ??
            pagination.last_page ??
            Math.ceil(totalCount / perPage) ??
            1,
        ),
      );

      if (
        selectedStatus === "all" &&
        !searchQuery.trim() &&
        currentPage === 1
      ) {
        allTicketsCache = normalized;
      }

      applyCountsFromResponse(response, normalized);

      if (
        selectedStatus === "all" &&
        statusCounts.all === 0 &&
        totalCount > 0
      ) {
        await fetchAllTicketsForCache();
      }
    } catch (/** @type {any} */ err) {
      errorMsg = err?.message || "Gagal memuat daftar laporan kerusakan.";
      reports = [];
      totalCount = 0;
      totalPages = 1;
    } finally {
      loading = false;
    }
  }

  /**
   * @param {number | string} ticketId
   */
  async function fetchTicketDetail(ticketId) {
    if (!ticketId) return;
    detailLoading = true;
    detailError = "";

    try {
      /** @type {any} */
      const response = await apiRequest(`/api/tickets/${ticketId}`);
      const payload =
        response?.data && typeof response.data === "object"
          ? response.data
          : response;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const mergedRaw = {
          ...(selectedReport || {}),
          ...payload,
        };
        const normalizedDetail = normalizeTicketItem(mergedRaw);

        if (normalizedDetail.discussion.length === 0) {
          try {
            /** @type {any} */
            const commentsRes = await apiRequest(
              `/api/tickets/${ticketId}/comments`,
            );
            const rawComments = Array.isArray(commentsRes?.data)
              ? commentsRes.data
              : Array.isArray(commentsRes?.comments)
                ? commentsRes.comments
                : Array.isArray(commentsRes)
                  ? commentsRes
                  : [];
            if (rawComments.length > 0) {
              normalizedDetail.discussion = normalizeDiscussionList(
                rawComments,
                normalizedDetail,
              );
            }
          } catch {
            // Abaikan jika endpoint komentar terpisah tidak tersedia
          }
        }

        selectedReport = normalizedDetail;
        if (normalizedDetail.photoUrl) {
          await loadProtectedPhotoBlob(normalizedDetail.photoUrl);
        } else {
          revokeCurrentPhotoUrl();
        }
      }
    } catch (/** @type {any} */ err) {
      detailError = err?.message || "Gagal memuat detail lengkap tiket.";
    } finally {
      detailLoading = false;
    }
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let searchDebounceTimer = null;
  function handleSearchInput() {
    currentPage = 1;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      fetchTickets();
    }, 250);
  }

  /**
   * @param {'all' | 'waiting_confirm' | 'in_progress' | 'completed'} statusKey
   */
  function selectStatusTab(statusKey) {
    selectedStatus = statusKey;
    currentPage = 1;
    fetchTickets();
  }

  /**
   * @param {any} report
   */
  function openReportDetail(report) {
    selectedReport = report;
    detailError = "";
    isPhotoModalOpen = false;
    revokeCurrentPhotoUrl();
    viewMode = "detail";
    if (report?.photoUrl) {
      loadProtectedPhotoBlob(report.photoUrl);
    }
    fetchTicketDetail(report.id);
  }

  function backToReportList() {
    activePhotoFetchSeq += 1;
    revokeCurrentPhotoUrl();
    photoBlobError = "";
    viewMode = "list";
    selectedReport = null;
    detailError = "";
    isPhotoModalOpen = false;
    fetchTickets();
  }

  function openPhotoPreview() {
    isPhotoModalOpen = true;
  }

  function closePhotoPreview() {
    isPhotoModalOpen = false;
  }

  function handlePrevPage() {
    if (currentPage > 1) {
      currentPage -= 1;
      fetchTickets();
    }
  }

  function handleNextPage() {
    if (currentPage < totalPages) {
      currentPage += 1;
      fetchTickets();
    }
  }

  onMount(() => {
    fetchTickets();
  });

  onDestroy(() => {
    activePhotoFetchSeq += 1;
    revokeCurrentPhotoUrl();
  });
</script>

<DashboardLayout
  activeKey="maintenance"
  ownerName={displayOwnerName}
  ownerRole={displayOwnerRole}
>
  {#if viewMode === "detail" && selectedReport}
    <!-- HALAMAN DETAIL LAPORAN KERUSAKAN -->
    <div
      class="detail-page-wrap"
      in:fly={{ y: 16, duration: 250, easing: cubicOut }}
    >
      <button type="button" class="btn-back-link" onclick={backToReportList}>
        &larr; Kembali ke Laporan Kerusakan
      </button>

      {#if detailLoading}
        <div class="state-banner" in:fade={{ duration: 160 }}>
          Memuat detail tiket...
        </div>
      {:else if detailError}
        <div class="state-banner warning" in:fade={{ duration: 160 }}>
          {detailError}
        </div>
      {/if}

      <!-- DETAIL MOBILE sesuai Figma Pemilik - Detail Laporan Kerusakan -->
      <div class="mobile-only mobile-detail-stack" in:fade={{ duration: 160 }}>
        <article class="mobile-detail-main-card">
          <div class="mobile-detail-top-row">
            <span class="mobile-ticket-code">{selectedReport.ticketCode}</span>
            <span class="status-badge {selectedReport.mobileStatus}"
              >{selectedReport.mobileStatusLabel}</span
            >
          </div>

          <h1 class="mobile-detail-heading">{selectedReport.title}</h1>
          <p class="mobile-detail-submeta">
            Pelapor: {selectedReport.reporter} &bull; {selectedReport.locationOrRoom}
            &bull; {selectedReport.reportedDateTime}
          </p>

          <p class="mobile-detail-desc">{selectedReport.description}</p>

          <button
            type="button"
            class="mobile-photo-trigger"
            onclick={openPhotoPreview}
          >
            Lihat Foto Bukti Kendala ({selectedReport.photoCaption})
          </button>
        </article>

        <section
          class="mobile-followup-card"
          aria-label="Riwayat Chat & Tindak Lanjut"
        >
          <h2 class="mobile-followup-title">
            Riwayat Chat &amp; Tindak Lanjut
          </h2>

          <div class="mobile-followup-list">
            {#each selectedReport.discussion as msg (msg.id)}
              <div class="mobile-followup-bubble">
                <div class="mobile-followup-meta">
                  <span class="mobile-followup-author">{msg.shortAuthor}</span>
                  <span class="mobile-followup-time">{msg.shortTime}</span>
                </div>
                <p class="mobile-followup-text">{msg.text}</p>
              </div>
            {:else}
              <p class="mobile-followup-empty">
                Belum ada riwayat chat penyewa dan pengelola.
              </p>
            {/each}
          </div>

          <p class="mobile-followup-readonly-note">
            Pemilik hanya dapat melihat riwayat chat.
          </p>
        </section>
      </div>

      <!-- DETAIL DESKTOP sesuai Figma Pemilik - Detail Laporan -->
      <div class="desktop-only detail-desktop-grid" in:fade={{ duration: 160 }}>
        <div class="detail-main-column">
          <!-- Kartu Utama Tiket -->
          <section class="detail-ticket-card">
            <div class="ticket-header-row">
              <h1 class="ticket-heading">Tiket #{selectedReport.ticketCode}</h1>
              <span class="status-badge {selectedReport.status}"
                >{selectedReport.statusLabel}</span
              >
            </div>

            <div class="ticket-meta-cols">
              <div>
                <span class="meta-label">Nomor kamar</span>
                <span class="meta-val">{selectedReport.roomNumber}</span>
              </div>
              <div>
                <span class="meta-label">Kategori kerusakan</span>
                <span class="meta-val">{selectedReport.category}</span>
              </div>
              <div>
                <span class="meta-label">Tanggal lapor</span>
                <span class="meta-val">{selectedReport.reportedDate}</span>
              </div>
            </div>

            <div class="ticket-section-block">
              <h2 class="sub-block-title">Deskripsi masalah</h2>
              <p class="sub-block-copy">{selectedReport.description}</p>
            </div>

            <div class="ticket-section-block">
              <h2 class="sub-block-title">Foto bukti kendala dari penyewa</h2>
              <button
                type="button"
                class="photo-placeholder-box"
                onclick={openPhotoPreview}
                title="Klik untuk memperbesar foto"
              >
                {#if photoBlobLoading}
                  <span>Memuat...</span>
                {:else if photoObjectUrl}
                  <img
                    src={photoObjectUrl}
                    alt="Foto bukti kendala {selectedReport.ticketCode}"
                    class="photo-thumb-img"
                  />
                {:else}
                  <span>Foto</span>
                  <small>{selectedReport.photoCaption}</small>
                {/if}
              </button>
            </div>
          </section>

          <!-- Kartu Diskusi / Chat Tiket (Read-Only untuk Pemilik) -->
          <section class="detail-discussion-card">
            <h2 class="discussion-heading">Chat Penyewa &amp; Pengelola</h2>

            <div class="discussion-thread-box">
              {#if selectedReport.discussion.length > 0}
                {#each selectedReport.discussion as msg (msg.id)}
                  <div class="chat-row {msg.align}">
                    <span class="chat-sender">{msg.sender}</span>
                    <div class="chat-bubble {msg.align}">{msg.text}</div>
                  </div>
                {/each}
              {:else}
                <p class="empty-discussion-text">
                  Belum ada pesan chat antara penyewa dan pengelola pada tiket
                  ini.
                </p>
              {/if}
            </div>

            <p class="discussion-footer-note">
              Chat dikirim oleh penyewa dan pengelola; Pemilik hanya dapat
              melihat chat.
            </p>
          </section>
        </div>

        <!-- Kolom Kanan: Status Penanganan -->
        <aside class="detail-status-card">
          <h2 class="status-card-title">Status Penanganan</h2>

          <div class="status-field-group">
            <span class="status-field-label">Status</span>
            <div>
              <span class="status-badge {selectedReport.status}"
                >{selectedReport.statusLabel}</span
              >
            </div>
          </div>

          <div class="status-field-group">
            <span class="status-field-label">Catatan teknis dari Pengelola</span
            >
            <p class="tech-note-text">{selectedReport.techNote}</p>
          </div>

          <p class="status-card-footnote">
            Hanya Pengelola yang dapat mengubah status.
          </p>
        </aside>
      </div>
    </div>

    <!-- MODAL PRATINJAU FOTO BUKTI KENDALA -->
    {#if isPhotoModalOpen}
      <div
        class="photo-modal-backdrop"
        transition:fade={{ duration: 160 }}
        onclick={closePhotoPreview}
        role="presentation"
      ></div>
      <div
        class="photo-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Pratinjau Foto Bukti Kendala"
        transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
      >
        <div class="photo-modal-top">
          <div>
            <h3 class="photo-modal-title">
              Bukti Kendala · {selectedReport.ticketCode}
            </h3>
            <p class="photo-modal-sub">
              {selectedReport.title} ({selectedReport.locationOrRoom})
            </p>
          </div>
          <button
            type="button"
            class="photo-modal-close"
            onclick={closePhotoPreview}
            aria-label="Tutup pratinjau foto"
          >
            &times;
          </button>
        </div>

        <div class="photo-preview-stage">
          {#if photoBlobLoading}
            <div class="photo-preview-badge">Memuat Foto Bukti...</div>
          {:else if photoObjectUrl}
            <img
              src={photoObjectUrl}
              alt="Bukti kendala {selectedReport.ticketCode}"
              class="photo-full-img"
            />
          {:else}
            <div class="photo-preview-badge">
              {photoBlobError || "Pratinjau Foto Bukti"}
            </div>
          {/if}
          <p class="photo-preview-caption">{selectedReport.description}</p>
          <span class="photo-preview-hint"
            >Dilaporkan pada {selectedReport.reportedDate} oleh {selectedReport.reporter}</span
          >
        </div>

        <div class="photo-modal-footer">
          <button
            type="button"
            class="photo-modal-done-btn"
            onclick={closePhotoPreview}>Tutup</button
          >
        </div>
      </div>
    {/if}
  {:else}
    <!-- HALAMAN DAFTAR LAPORAN KERUSAKAN -->
    <div
      class="list-page-wrap"
      in:fly={{ y: 16, duration: 250, easing: cubicOut }}
    >
      <div class="page-header-block">
        <h1 class="page-title">Laporan Kerusakan</h1>
        <p class="page-subtitle">
          Semua laporan kendala fasilitas dari penghuni
        </p>
      </div>

      <!-- FILTER & PENCARIAN (DESKTOP) -->
      <div class="filter-search-bar desktop-only">
        <div
          class="status-tabs"
          role="tablist"
          aria-label="Filter status laporan"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "all"}
            class="status-tab {selectedStatus === 'all' ? 'active' : ''}"
            onclick={() => selectStatusTab("all")}
          >
            Semua ({statusCounts.all})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "waiting_confirm"}
            class="status-tab {selectedStatus === 'waiting_confirm'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("waiting_confirm")}
          >
            Menunggu ({statusCounts.waiting_confirm})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "in_progress"}
            class="status-tab {selectedStatus === 'in_progress'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("in_progress")}
          >
            Diproses ({statusCounts.in_progress})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "completed"}
            class="status-tab {selectedStatus === 'completed' ? 'active' : ''}"
            onclick={() => selectStatusTab("completed")}
          >
            Selesai ({statusCounts.completed})
          </button>
        </div>

        <div class="desktop-search-wrap">
          <svg
            class="search-icon-svg"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            class="desktop-search-input"
            bind:value={searchQuery}
            oninput={handleSearchInput}
            placeholder="Cari tiket, kamar, atau penyewa"
            aria-label="Cari tiket, kamar, atau penyewa"
          />
        </div>
      </div>

      <!-- FILTER & PENCARIAN (MOBILE) -->
      <div class="mobile-only mobile-filter-section">
        <div class="mobile-search-wrap">
          <svg
            class="search-icon-svg"
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            class="mobile-search-input"
            bind:value={searchQuery}
            oninput={handleSearchInput}
            placeholder="Cari kamar, judul, atau kode tiket..."
            aria-label="Cari kamar, judul, atau kode tiket"
          />
        </div>

        <div
          class="mobile-status-pills"
          role="tablist"
          aria-label="Filter status laporan mobile"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "all"}
            class="status-tab {selectedStatus === 'all' ? 'active' : ''}"
            onclick={() => selectStatusTab("all")}
          >
            Semua ({statusCounts.all})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "waiting_confirm"}
            class="status-tab {selectedStatus === 'waiting_confirm'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("waiting_confirm")}
          >
            Menunggu ({statusCounts.waiting_confirm})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "in_progress"}
            class="status-tab {selectedStatus === 'in_progress'
              ? 'active'
              : ''}"
            onclick={() => selectStatusTab("in_progress")}
          >
            Diproses ({statusCounts.in_progress})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedStatus === "completed"}
            class="status-tab {selectedStatus === 'completed' ? 'active' : ''}"
            onclick={() => selectStatusTab("completed")}
          >
            Selesai ({statusCounts.completed})
          </button>
        </div>
      </div>

      {#if loading}
        <div class="state-card" in:fade={{ duration: 160 }}>
          Memuat data laporan kerusakan...
        </div>
      {:else if errorMsg}
        <div class="state-card error" in:fade={{ duration: 160 }}>
          <span>{errorMsg}</span>
          <button type="button" class="btn-retry" onclick={fetchTickets}
            >Coba Lagi</button
          >
        </div>
      {:else if reports.length === 0}
        <div class="state-card" in:fade={{ duration: 160 }}>
          Belum ada laporan kerusakan yang ditemukan.
        </div>
      {:else}
        <!-- DAFTAR KARTU LAPORAN (MOBILE) -->
        <div
          class="mobile-only mobile-reports-list"
          in:fade={{ duration: 160 }}
        >
          {#each reports as report (report.id)}
            <article class="mobile-report-card">
              <button
                type="button"
                class="mobile-report-card-btn"
                onclick={() => openReportDetail(report)}
              >
                <div class="mobile-report-top">
                  <div>
                    <h2 class="mobile-report-title">{report.title}</h2>
                    <p class="mobile-report-sub">
                      {report.locationOrRoom} &bull; {report.reporter}
                    </p>
                  </div>
                  <span class="status-badge {report.mobileStatus}"
                    >{report.mobileStatusLabel}</span
                  >
                </div>

                <div class="mobile-report-meta-grid">
                  <div>
                    <span class="mobile-meta-label">Kategori</span>
                    <span class="mobile-meta-value"
                      >{report.mobileCategory}</span
                    >
                  </div>
                  <div>
                    <span class="mobile-meta-label">Dilaporkan</span>
                    <span class="mobile-meta-value"
                      >{report.reportedDateTime}</span
                    >
                  </div>
                </div>
              </button>
            </article>
          {/each}
        </div>

        <!-- KARTU TABEL LAPORAN (DESKTOP) -->
        <section
          class="reports-card desktop-only"
          aria-label="Daftar laporan kerusakan"
          in:fade={{ duration: 160 }}
        >
          <div class="reports-card-header">
            <h2 class="reports-card-title">Daftar Laporan Kerusakan</h2>
            <p class="reports-card-subtitle">
              10 laporan per halaman, terbaru dulu
            </p>
          </div>

          <div class="table-wrap">
            <table class="reports-table">
              <thead>
                <tr>
                  <th>ID Tiket</th>
                  <th>Nomor Kamar</th>
                  <th>Penyewa</th>
                  <th>Kategori</th>
                  <th>Tgl Lapor</th>
                  <th>Status</th>
                  <th class="col-action">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {#each reports as report (report.id)}
                  <tr>
                    <td class="cell-ticket">{report.ticketCode}</td>
                    <td class="cell-room">{report.roomNumber}</td>
                    <td class="cell-muted">{report.tenant}</td>
                    <td class="cell-muted">{report.category}</td>
                    <td class="cell-muted">{report.reportedDate}</td>
                    <td>
                      <span class="status-badge {report.status}"
                        >{report.statusLabel}</span
                      >
                    </td>
                    <td class="col-action">
                      <button
                        type="button"
                        class="btn-detail-outline"
                        onclick={() => openReportDetail(report)}
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <p class="table-footnote">
            Nomor kamar diambil otomatis dari kontrak aktif. Status penanganan
            hanya dapat diubah oleh Pengelola.
          </p>

          <div class="pagination-bar">
            <span class="pagination-summary">
              Menampilkan {(currentPage - 1) * perPage + 1}–{Math.min(
                currentPage * perPage,
                totalCount,
              )} dari {totalCount} laporan
            </span>

            <div class="pagination-controls">
              <span class="pagination-page-info"
                >Halaman {currentPage} dari {totalPages}</span
              >
              <button
                type="button"
                class="page-btn"
                onclick={handlePrevPage}
                disabled={currentPage <= 1}
              >
                Sebelumnya
              </button>
              <button
                type="button"
                class="page-btn"
                onclick={handleNextPage}
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
  .mobile-only {
    display: none;
  }

  .state-card {
    padding: 32px 18px;
    text-align: center;
    color: #9e8b7c;
    font-size: 13px;
    background-color: #ffffff;
    border: 1px solid #ece3d9;
    border-radius: 12px;
  }

  .state-card.error {
    color: #c62828;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .btn-retry {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #d9827b;
    border-radius: 6px;
    background-color: #ffffff;
    color: #c62828;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .state-banner {
    padding: 10px 14px;
    margin-bottom: 14px;
    border-radius: 8px;
    background-color: #ffffff;
    border: 1px solid #ece3d9;
    color: #7c6858;
    font-size: 12px;
  }

  .state-banner.warning {
    background-color: #fff6df;
    border-color: #f3d28a;
    color: #9a5b13;
  }

  .page-header-block {
    margin-bottom: 16px;
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

  .filter-search-bar {
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
    font-weight: 500;
    cursor: pointer;
  }

  .status-tab:hover {
    background-color: #f6f1eb;
  }

  .status-tab.active {
    border-color: #5c432d;
    background-color: #5c432d;
    color: #ffffff;
    font-weight: 600;
  }

  .desktop-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    width: 240px;
  }

  .search-icon-svg {
    position: absolute;
    left: 11px;
    color: #9e8b7c;
    pointer-events: none;
  }

  .desktop-search-input {
    width: 100%;
    height: 34px;
    padding: 0 12px 0 32px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    box-sizing: border-box;
  }

  .desktop-search-input::placeholder {
    color: #b09d8e;
  }

  .reports-card {
    padding: 22px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .reports-card-header {
    margin-bottom: 16px;
  }

  .reports-card-title {
    margin: 0 0 3px;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .reports-card-subtitle {
    margin: 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .reports-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .reports-table th {
    padding: 10px 12px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
    white-space: nowrap;
  }

  .reports-table td {
    padding: 13px 12px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
    vertical-align: middle;
  }

  .cell-ticket {
    font-weight: 600;
    color: #261a14;
    white-space: nowrap;
  }

  .cell-room {
    color: #4a3b30;
    white-space: nowrap;
  }

  .cell-muted {
    color: #8f7c6e;
    white-space: nowrap;
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

  .status-badge.waiting_confirm {
    background-color: #fef3c7;
    color: #b45309;
  }

  .status-badge.waiting {
    background-color: #fef3c7;
    color: #b45309;
  }

  .status-badge.in_progress {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .status-badge.completed {
    background-color: #dcfce7;
    color: #15803d;
  }

  .col-action {
    text-align: right;
    white-space: nowrap;
  }

  .btn-detail-outline {
    height: 28px;
    padding: 0 12px;
    border: 1px solid #e2d8cd;
    border-radius: 6px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-detail-outline:hover {
    background-color: #faf7f2;
  }

  .table-footnote {
    margin: 14px 0 16px;
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 4px;
  }

  .pagination-summary,
  .pagination-page-info {
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-controls {
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
    color: #261a14;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .page-btn:hover:not(:disabled) {
    background-color: #faf7f2;
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- DETAIL DESKTOP --- */
  .btn-back-link {
    padding: 0;
    border: none;
    background: transparent;
    color: #9e8b7c;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    margin-bottom: 14px;
  }

  .detail-desktop-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.85fr) minmax(260px, 1fr);
    gap: 18px;
    align-items: start;
  }

  .detail-main-column {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .detail-ticket-card,
  .detail-discussion-card,
  .detail-status-card {
    padding: 22px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .ticket-header-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
  }

  .ticket-heading {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #261a14;
  }

  .ticket-meta-cols {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    padding-bottom: 18px;
    margin-bottom: 18px;
    border-bottom: 1px solid #f2eae1;
  }

  .meta-label {
    display: block;
    font-size: 11px;
    color: #9e8b7c;
    margin-bottom: 4px;
  }

  .meta-val {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #261a14;
  }

  .ticket-section-block {
    margin-bottom: 18px;
  }

  .ticket-section-block:last-child {
    margin-bottom: 0;
  }

  .sub-block-title {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    color: #261a14;
  }

  .sub-block-copy {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: #4a3b30;
  }

  .photo-placeholder-box {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 112px;
    height: 82px;
    border: 1px solid #dfd3c5;
    border-radius: 8px;
    background-color: #e9dfd4;
    color: #7c6858;
    font-family: inherit;
    font-size: 11px;
    gap: 2px;
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    transition:
      background-color 0.15s ease,
      transform 0.15s ease;
  }

  .photo-placeholder-box:hover {
    background-color: #dfd2c3;
    transform: translateY(-1px);
  }

  .photo-placeholder-box small {
    font-size: 9px;
    color: #8f7b6b;
  }

  .photo-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .discussion-heading {
    margin: 0 0 14px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .discussion-thread-box {
    padding: 16px;
    border-radius: 10px;
    background-color: #f6f0e8;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .chat-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .chat-row.left {
    align-items: flex-start;
  }

  .chat-row.right {
    align-items: flex-end;
  }

  .chat-sender {
    font-size: 10px;
    color: #9e8b7c;
  }

  .chat-bubble {
    max-width: 78%;
    padding: 9px 13px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.45;
  }

  .chat-bubble.left {
    background-color: #ffffff;
    border: 1px solid #ece3d9;
    color: #261a14;
  }

  .chat-bubble.right {
    background-color: #684b36;
    color: #ffffff;
  }

  .empty-discussion-text {
    margin: 0;
    font-size: 12px;
    color: #9e8b7c;
  }

  .discussion-footer-note {
    margin: 12px 0 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .status-card-title {
    margin: 0 0 16px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .status-field-group {
    margin-bottom: 16px;
  }

  .status-field-label {
    display: block;
    font-size: 11px;
    color: #9e8b7c;
    margin-bottom: 6px;
  }

  .tech-note-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: #4a3b30;
  }

  .status-card-footnote {
    margin: 22px 0 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  /* --- LIGHTBOX MODAL FOTO --- */
  .photo-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background-color: rgba(24, 18, 14, 0.55);
  }

  .photo-modal-card {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 90;
    width: 92%;
    max-width: 520px;
    padding: 20px 22px;
    border-radius: 14px;
    background-color: #ffffff;
    box-shadow: 0 16px 40px rgba(24, 18, 14, 0.24);
    box-sizing: border-box;
  }

  .photo-modal-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .photo-modal-title {
    margin: 0 0 2px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .photo-modal-sub {
    margin: 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .photo-modal-close {
    border: none;
    background: transparent;
    font-size: 22px;
    color: #8c7b6e;
    cursor: pointer;
    line-height: 1;
  }

  .photo-preview-stage {
    padding: 24px 20px;
    border: 1px dashed #d6c8b9;
    border-radius: 10px;
    background-color: #f6f0e8;
    text-align: center;
  }

  .photo-full-img {
    max-width: 100%;
    max-height: 280px;
    border-radius: 8px;
    object-fit: contain;
    margin-bottom: 12px;
    display: block;
    margin-inline: auto;
  }

  .photo-preview-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    background-color: #684b36;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .photo-preview-caption {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.5;
    color: #261a14;
  }

  .photo-preview-hint {
    font-size: 11px;
    color: #9e8b7c;
  }

  .photo-modal-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .photo-modal-done-btn {
    height: 34px;
    padding: 0 16px;
    border: 1px solid #e2d8cd;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  /* --- MOBILE RESPONSIVE OVERRIDES --- */
  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: block;
    }

    .page-header-block {
      margin-bottom: 12px;
    }

    .page-title {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.25;
    }

    .page-subtitle {
      font-size: 13px;
      line-height: 1.5;
    }

    .mobile-filter-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 14px;
    }

    .mobile-search-wrap {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }

    .mobile-search-input {
      width: 100%;
      height: 38px;
      padding: 0 12px 0 36px;
      border: 1px solid #e4dad0;
      border-radius: 8px;
      background-color: #ffffff;
      color: #261a14;
      font-size: 12px;
      box-sizing: border-box;
    }

    .mobile-status-pills {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
    }

    .mobile-status-pills .status-tab {
      width: 100%;
      height: 34px;
      padding: 0 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }

    .mobile-reports-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-report-card {
      border: 1px solid #ece3d9;
      border-radius: 10px;
      background-color: #ffffff;
      overflow: hidden;
    }

    .mobile-report-card-btn {
      display: block;
      width: 100%;
      padding: 14px 16px;
      border: none;
      background: transparent;
      text-align: left;
      font-family: inherit;
      cursor: pointer;
    }

    .mobile-report-card-btn:hover {
      background-color: #fcfaf7;
    }

    .mobile-report-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .mobile-report-title {
      margin: 0 0 2px;
      font-size: 13px;
      font-weight: 700;
      color: #261a14;
      line-height: 1.35;
    }

    .mobile-report-sub {
      margin: 0;
      font-size: 11px;
      color: #9e8b7c;
    }

    .mobile-report-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .mobile-meta-label {
      display: block;
      font-size: 10px;
      color: #a88f7a;
      margin-bottom: 2px;
    }

    .mobile-meta-value {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #261a14;
    }

    .mobile-detail-stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mobile-detail-main-card,
    .mobile-followup-card {
      padding: 16px;
      border: 1px solid #ece3d9;
      border-radius: 12px;
      background-color: #ffffff;
    }

    .mobile-detail-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .mobile-ticket-code {
      font-size: 11px;
      font-weight: 600;
      color: #a88f7a;
    }

    .mobile-detail-heading {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 700;
      color: #261a14;
      line-height: 1.35;
    }

    .mobile-detail-submeta {
      margin: 0 0 12px;
      font-size: 11px;
      color: #9e8b7c;
    }

    .mobile-detail-desc {
      margin: 0 0 12px;
      font-size: 12px;
      line-height: 1.55;
      color: #261a14;
    }

    .mobile-photo-trigger {
      width: 100%;
      height: 36px;
      border: 1px solid #e2d8cd;
      border-radius: 8px;
      background-color: #f6f0e8;
      color: #684b36;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .mobile-followup-title {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 700;
      color: #261a14;
    }

    .mobile-followup-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .mobile-followup-bubble {
      padding: 11px 12px;
      border-radius: 8px;
      background-color: #f6f0e8;
    }

    .mobile-followup-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 10px;
    }

    .mobile-followup-author {
      font-weight: 700;
      color: #261a14;
    }

    .mobile-followup-time {
      color: #9e8b7c;
      white-space: nowrap;
    }

    .mobile-followup-text {
      margin: 0;
      font-size: 11px;
      line-height: 1.45;
      color: #4a3b30;
    }

    .mobile-followup-empty {
      margin: 0;
      font-size: 11px;
      color: #9e8b7c;
    }

    .mobile-followup-readonly-note {
      margin: 10px 0 0;
      font-size: 10px;
      color: #9e8b7c;
    }
  }
</style>
