<script>
  import { onMount, onDestroy } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import DashboardLayout from "../../layouts/DashboardLayout.svelte";
  import { currentUser } from "../../stores/auth.js";
  import { apiRequest, API_BASE_URL } from "../../services/api.js";
  import { getToken } from "../../services/token.js";

  /** @type {'all' | 'pending' | 'in_progress' | 'resolved'} */
  let selectedStatus = $state("all");
  let searchQuery = $state("");
  let currentPage = $state(1);
  const perPage = 10;

  let isMobileViewport = $state(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );

  // --- STATE DATA DAFTAR API ---
  let loading = $state(true);
  let errorMsg = $state("");
  /** @type {any[]} */
  let reports = $state([]);
  let totalCount = $state(0);
  let totalPages = $state(1);
  let statusCounts = $state({
    all: 0,
    pending: 0,
    in_progress: 0,
    resolved: 0,
  });

  // --- STATE DETAIL, KOMENTAR, UBAH STATUS & LIGHTBOX FOTO ---
  /** @type {'list' | 'detail'} */
  let viewMode = $state("list");
  /** @type {any | null} */
  let selectedReport = $state(null);
  let detailLoading = $state(false);
  let detailError = $state("");

  // Form balasan chat / komentar
  let commentInput = $state("");
  let commentSubmitting = $state(false);
  let commentError = $state("");

  // Drawer / Modal Ubah Status Tiket
  let isStatusModalOpen = $state(false);
  let nextStatusValue = $state("in_progress");
  let technicalNoteInput = $state("");
  let statusSubmitting = $state(false);
  let statusFormError = $state("");

  // Lightbox foto
  let isPhotoModalOpen = $state(false);
  let photoObjectUrl = $state("");
  let photoBlobLoading = $state(false);
  let photoBlobError = $state("");
  let activePhotoFetchSeq = 0;

  let displayCaretakerName = $derived($currentUser?.name || "Pak Andi");
  let displayCaretakerRole = $derived.by(() => {
    const role = String($currentUser?.role || "caretaker").toLowerCase();
    if (role === "caretaker") return "Pengelola";
    return $currentUser?.role || "Pengelola";
  });

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
   * @param {string | null | undefined} rawPhotoPath
   */
  async function loadProtectedPhotoBlob(rawPhotoPath) {
    const seq = ++activePhotoFetchSeq;
    revokeCurrentPhotoUrl();
    photoBlobError = "";

    const filename = String(rawPhotoPath || "").trim();
    if (!filename) {
      photoBlobLoading = false;
      return;
    }

    photoBlobLoading = true;
    try {
      const token = getToken();
      /** @type {Record<string, string>} */
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/files/${encodeURIComponent(filename)}`,
        { headers },
      );

      if (!res.ok) {
        let pesan = `Gagal memuat foto (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.pesan || errJson?.message) {
            pesan = errJson.pesan || errJson.message;
          }
        } catch {
          // Abaikan jika body bukan JSON
        }
        throw new Error(pesan);
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
   * @returns {'pending' | 'in_progress' | 'resolved'}
   */
  function normalizeStatus(rawStatus) {
    const val = String(rawStatus || "").toLowerCase();
    if (val === "resolved") return "resolved";
    if (val === "in_progress") return "in_progress";
    return "pending";
  }

  /**
   * @param {'pending' | 'in_progress' | 'resolved'} status
   * @returns {string}
   */
  function mapStatusLabel(status) {
    if (status === "resolved") return "Selesai";
    if (status === "in_progress") return "Diproses";
    return "Menunggu Konfirmasi";
  }

  /**
   * @param {'pending' | 'in_progress' | 'resolved'} status
   */
  function mapMobileStatus(status) {
    if (status === "resolved") {
      return { mobileStatus: "resolved", mobileStatusLabel: "Selesai" };
    }
    if (status === "in_progress") {
      return { mobileStatus: "in_progress", mobileStatusLabel: "Diproses" };
    }
    return { mobileStatus: "pending", mobileStatusLabel: "Menunggu" };
  }

  /**
   * @param {string | null | undefined} userRole
   * @returns {string}
   */
  function formatUserRoleLabel(userRole) {
    switch (String(userRole || "").toLowerCase()) {
      case "owner":
        return "Pemilik";
      case "caretaker":
        return "Pengelola";
      case "tenant":
        return "Penyewa";
      case "guardian":
        return "Wali";
      default:
        return "";
    }
  }

  /**
   * @param {any} rawList
   * @param {any} fallbackTicket
   */
  function normalizeDiscussionList(rawList, fallbackTicket) {
    if (!Array.isArray(rawList)) return [];
    const currentUserId = $currentUser?.id;

    return rawList.map((msg, idx) => {
      const senderName = msg.user_name || "Pengguna";
      const roleRaw = String(msg.user_role || "").toLowerCase();
      const roleLabel = formatUserRoleLabel(roleRaw);
      const timeStr = formatDateTime(msg.created_at);

      const isRightAligned =
        roleRaw === "caretaker" ||
        (currentUserId != null && msg.user_id === currentUserId);

      const senderMeta = roleLabel
        ? `${senderName} · ${roleLabel}${timeStr !== "-" ? ` · ${timeStr}` : ""}`
        : `${senderName}${timeStr !== "-" ? ` · ${timeStr}` : ""}`;

      return {
        id: msg.id ?? `msg-${fallbackTicket?.id || "x"}-${idx}`,
        sender: senderMeta,
        align: isRightAligned ? "right" : "left",
        text: msg.message || "",
      };
    });
  }

  /**
   * @param {any} raw
   */
  function normalizeTicketItem(raw) {
    const status = normalizeStatus(raw.status);
    const mobileStatusInfo = mapMobileStatus(status);
    const category = raw.category || "Lainnya";
    const roomNum = raw.room_number || "-";
    const tenantName = raw.tenant_name || "-";
    const photoPath = raw.photo_path || "";

    const rawComments = Array.isArray(raw.comments) ? raw.comments : [];

    return {
      id: raw.id,
      ticketCode:
        raw.ticket_number || `T-${String(raw.id || 0).padStart(4, "0")}`,
      title: `Kendala ${category} Kamar ${roomNum}`,
      roomNumber: roomNum,
      locationOrRoom: roomNum !== "-" ? `Kamar ${roomNum}` : "Area Umum",
      tenant: tenantName,
      reporter: tenantName,
      category,
      mobileCategory: category,
      reportedDate: formatDate(raw.created_at),
      reportedDateTime: formatDateTime(raw.created_at),
      status,
      rawStatus: raw.status,
      statusLabel: mapStatusLabel(status),
      ...mobileStatusInfo,
      description: raw.description || "-",
      techNote: raw.technical_note || "Belum ada catatan teknis.",
      rawTechNote: raw.technical_note || "",
      photoPath,
      photoCaption: photoPath ? "Foto Bukti - Klik untuk memperbesar" : "",
      discussion: normalizeDiscussionList(rawComments, raw),
    };
  }

  async function syncStatusCounts() {
    try {
      const qParam = searchQuery.trim()
        ? `&q=${encodeURIComponent(searchQuery.trim())}`
        : "";

      const [allRes, pendingRes, progressRes, resolvedRes] = await Promise.all([
        apiRequest(`/api/tickets?page=1&limit=1${qParam}`),
        apiRequest(`/api/tickets?page=1&limit=1&status=pending${qParam}`),
        apiRequest(`/api/tickets?page=1&limit=1&status=in_progress${qParam}`),
        apiRequest(`/api/tickets?page=1&limit=1&status=resolved${qParam}`),
      ]);

      statusCounts = {
        all: Number(allRes?.meta?.total ?? 0),
        pending: Number(pendingRes?.meta?.total ?? 0),
        in_progress: Number(progressRes?.meta?.total ?? 0),
        resolved: Number(resolvedRes?.meta?.total ?? 0),
      };
    } catch {
      // Abaikan jika sinkronisasi badge gagal
    }
  }

  async function fetchTickets() {
    loading = true;
    errorMsg = "";

    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(perPage));

      if (selectedStatus !== "all") {
        params.set("status", selectedStatus);
      }

      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      /** @type {any} */
      const response = await apiRequest(`/api/tickets?${params.toString()}`);
      const rawItems = Array.isArray(response?.data) ? response.data : [];
      const normalized = rawItems.map(normalizeTicketItem);
      reports = normalized;

      const meta = response?.meta || {};
      totalCount = Number(meta.total ?? normalized.length);
      totalPages = Math.max(
        1,
        Number(meta.total_pages ?? Math.ceil(totalCount / perPage) ?? 1),
      );
    } catch (/** @type {any} */ err) {
      errorMsg =
        err?.data?.pesan ||
        err?.message ||
        "Gagal memuat daftar laporan kerusakan.";
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
  async function fetchTicketComments(ticketId) {
    if (!ticketId) return [];
    try {
      /** @type {any} */
      const commentsRes = await apiRequest(
        `/api/tickets/${ticketId}/comments?page=1&limit=50`,
      );
      const rawComments = Array.isArray(commentsRes?.data)
        ? commentsRes.data
        : [];
      return normalizeDiscussionList(rawComments, { id: ticketId });
    } catch {
      return [];
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
          : null;

      if (payload) {
        const mergedRaw = {
          ...(selectedReport || {}),
          ...payload,
        };
        const normalizedDetail = normalizeTicketItem(mergedRaw);
        const comments = await fetchTicketComments(ticketId);
        if (comments.length > 0) {
          normalizedDetail.discussion = comments;
        }
        selectedReport = normalizedDetail;

        if (normalizedDetail.photoPath) {
          await loadProtectedPhotoBlob(normalizedDetail.photoPath);
        } else {
          revokeCurrentPhotoUrl();
        }
      }
    } catch (/** @type {any} */ err) {
      detailError =
        err?.data?.pesan || err?.message || "Gagal memuat detail tiket.";
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
      syncStatusCounts();
    }, 250);
  }

  /**
   * @param {'all' | 'pending' | 'in_progress' | 'resolved'} statusKey
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
    commentInput = "";
    commentError = "";
    isPhotoModalOpen = false;
    isStatusModalOpen = false;
    revokeCurrentPhotoUrl();
    viewMode = "detail";
    if (report?.photoPath) {
      loadProtectedPhotoBlob(report.photoPath);
    }
    fetchTicketDetail(report.id);
  }

  function backToReportList() {
    activePhotoFetchSeq += 1;
    revokeCurrentPhotoUrl();
    photoBlobError = "";
    isStatusModalOpen = false;
    isPhotoModalOpen = false;
    viewMode = "list";
    selectedReport = null;
    detailError = "";
    commentInput = "";
    commentError = "";
    fetchTickets();
    syncStatusCounts();
  }

  function openPhotoPreview() {
    if (!selectedReport?.photoPath) return;
    isPhotoModalOpen = true;
  }

  function closePhotoPreview() {
    isPhotoModalOpen = false;
  }

  function getAllowedNextStatuses() {
    const current = selectedReport?.status;
    if (current === "pending") {
      return [
        { value: "in_progress", label: "Diproses" },
        { value: "resolved", label: "Selesai" },
      ];
    }
    if (current === "in_progress") {
      return [{ value: "resolved", label: "Selesai" }];
    }
    return [];
  }

  function openStatusModal() {
    const allowed = getAllowedNextStatuses();
    if (allowed.length === 0) return;
    nextStatusValue = allowed[0].value;
    technicalNoteInput = selectedReport?.rawTechNote || "";
    statusFormError = "";
    isStatusModalOpen = true;
  }

  function closeStatusModal() {
    isStatusModalOpen = false;
    statusFormError = "";
  }

  /**
   * @param {SubmitEvent} [e]
   */
  async function handleUpdateStatus(e) {
    if (e) e.preventDefault();
    if (!selectedReport?.id) return;

    const trimmedNote = technicalNoteInput.trim();
    if (!trimmedNote) {
      statusFormError = "Catatan teknis wajib diisi.";
      return;
    }

    statusSubmitting = true;
    statusFormError = "";

    try {
      /** @type {any} */
      const res = await apiRequest(`/api/tickets/${selectedReport.id}/status`, {
        method: "PATCH",
        body: {
          status: nextStatusValue,
          technical_note: trimmedNote,
        },
      });

      const updatedRaw =
        res?.data && typeof res.data === "object" ? res.data : null;
      if (updatedRaw) {
        const merged = {
          ...selectedReport,
          ...updatedRaw,
          comments: undefined,
        };
        const normalizedUpdated = normalizeTicketItem(merged);
        normalizedUpdated.discussion = selectedReport.discussion || [];
        selectedReport = normalizedUpdated;
      } else {
        await fetchTicketDetail(selectedReport.id);
      }

      isStatusModalOpen = false;
      syncStatusCounts();
    } catch (/** @type {any} */ err) {
      statusFormError =
        err?.data?.pesan || err?.message || "Gagal memperbarui status tiket.";
    } finally {
      statusSubmitting = false;
    }
  }

  /**
   * @param {SubmitEvent} [e]
   */
  async function handleSendComment(e) {
    if (e) e.preventDefault();
    if (!selectedReport?.id) return;

    const trimmedMsg = commentInput.trim();
    if (!trimmedMsg) {
      commentError = "Pesan balasan tidak boleh kosong.";
      return;
    }

    commentSubmitting = true;
    commentError = "";

    try {
      await apiRequest(`/api/tickets/${selectedReport.id}/comments`, {
        method: "POST",
        body: {
          message: trimmedMsg,
        },
      });

      commentInput = "";
      const latestComments = await fetchTicketComments(selectedReport.id);
      if (selectedReport) {
        selectedReport = {
          ...selectedReport,
          discussion: latestComments,
        };
      }
    } catch (/** @type {any} */ err) {
      commentError =
        err?.data?.pesan || err?.message || "Gagal mengirim balasan chat.";
    } finally {
      commentSubmitting = false;
    }
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

  /**
   * @param {{ href?: string }} item
   */
  function handleNavigate(item) {
    if (!item?.href || typeof window === "undefined") return;
    window.location.hash = `#${item.href}`;
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => {
      isMobileViewport = window.innerWidth <= 768;
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  });

  onMount(() => {
    fetchTickets();
    syncStatusCounts();
  });

  onDestroy(() => {
    activePhotoFetchSeq += 1;
    revokeCurrentPhotoUrl();
  });
</script>

<DashboardLayout
  activeKey="maintenance"
  role="caretaker"
  ownerName={displayCaretakerName}
  ownerRole={displayCaretakerRole}
  onNavigate={handleNavigate}
>
  {#if viewMode === "detail" && selectedReport}
    <!-- HALAMAN DETAIL LAPORAN KERUSAKAN PENGELOLA -->
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

      <!-- DETAIL MOBILE -->
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

          {#if selectedReport.photoPath}
            <button
              type="button"
              class="mobile-photo-trigger"
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
          {/if}
        </article>

        <section class="detail-status-card" aria-label="Status Penanganan">
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

          {#if getAllowedNextStatuses().length > 0}
            <button
              type="button"
              class="btn-outline-full"
              onclick={openStatusModal}
            >
              Ubah Status
            </button>
          {:else}
            <p class="status-card-footnote">Tiket sudah berstatus Selesai.</p>
          {/if}
        </section>

        <section class="mobile-followup-card" aria-label="Diskusi Tiket">
          <h2 class="discussion-heading">Diskusi Tiket</h2>

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
                Belum ada pesan diskusi pada tiket ini.
              </p>
            {/if}
          </div>

          {#if commentError}
            <div class="form-error-banner reply-error">{commentError}</div>
          {/if}

          <form class="chat-reply-form" onsubmit={handleSendComment}>
            <input
              type="text"
              class="chat-reply-input"
              bind:value={commentInput}
              placeholder="Tulis balasan untuk penyewa..."
              aria-label="Tulis balasan untuk penyewa"
              disabled={commentSubmitting}
            />
            <button
              type="submit"
              class="btn-primary-brown chat-send-btn"
              disabled={commentSubmitting}
            >
              {commentSubmitting ? "Mengirim..." : "Kirim"}
            </button>
          </form>
        </section>
      </div>

      <!-- DETAIL DESKTOP -->
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
                <span class="meta-label">Pelapor</span>
                <span class="meta-val">{selectedReport.reporter}</span>
              </div>
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

            {#if selectedReport.photoPath}
              <div class="ticket-section-block">
                <h2 class="sub-block-title">Foto bukti kendala</h2>
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
            {/if}
          </section>

          <!-- Kartu Diskusi / Chat Tiket -->
          <section class="detail-discussion-card">
            <h2 class="discussion-heading">Diskusi Tiket</h2>

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
                  Belum ada pesan diskusi pada tiket ini.
                </p>
              {/if}
            </div>

            {#if commentError}
              <div class="form-error-banner reply-error">{commentError}</div>
            {/if}

            <form class="chat-reply-form" onsubmit={handleSendComment}>
              <input
                type="text"
                class="chat-reply-input"
                bind:value={commentInput}
                placeholder="Tulis balasan untuk penyewa..."
                aria-label="Tulis balasan untuk penyewa"
                disabled={commentSubmitting}
              />
              <button
                type="submit"
                class="btn-primary-brown chat-send-btn"
                disabled={commentSubmitting}
              >
                {commentSubmitting ? "Mengirim..." : "Kirim"}
              </button>
            </form>
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

          {#if getAllowedNextStatuses().length > 0}
            <button
              type="button"
              class="btn-outline-full"
              onclick={openStatusModal}
            >
              Ubah Status
            </button>
          {:else}
            <p class="status-card-footnote">Tiket sudah berstatus Selesai.</p>
          {/if}
        </aside>
      </div>
    </div>

    <!-- MODAL / SHEET UBAH STATUS TIKET -->
    {#if isStatusModalOpen}
      <div
        class="modal-backdrop"
        transition:fade={{ duration: 160 }}
        onclick={closeStatusModal}
        role="presentation"
      ></div>
      <div
        class="status-modal-card sheet-capable"
        role="dialog"
        aria-modal="true"
        aria-label="Ubah Status Laporan Kerusakan"
        transition:scale={{ start: 0.96, duration: 180, easing: cubicOut }}
      >
        <div class="sheet-handle mobile-only"></div>
        <div class="status-modal-top">
          <h3 class="status-modal-title">Ubah Status Laporan Kerusakan</h3>
          <button
            type="button"
            class="photo-modal-close"
            onclick={closeStatusModal}
            aria-label="Tutup modal ubah status"
          >
            &times;
          </button>
        </div>

        {#if statusFormError}
          <div class="form-error-banner">{statusFormError}</div>
        {/if}

        <form class="status-modal-form" onsubmit={handleUpdateStatus}>
          <div class="form-group">
            <label class="form-label" for="next-ticket-status"
              >Status Penanganan</label
            >
            <select
              id="next-ticket-status"
              class="form-select"
              bind:value={nextStatusValue}
              required
            >
              {#each getAllowedNextStatuses() as opt (opt.value)}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="technical-note-input"
              >Catatan Teknis</label
            >
            <textarea
              id="technical-note-input"
              class="form-textarea"
              rows="4"
              bind:value={technicalNoteInput}
              placeholder="Tuliskan catatan penanganan atau tindak lanjut teknisi..."
              required></textarea>
          </div>

          <div class="status-modal-actions">
            <button
              type="submit"
              class="btn-primary-brown full-width"
              disabled={statusSubmitting}
            >
              {statusSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
            <button
              type="button"
              class="btn-secondary-full"
              onclick={closeStatusModal}
              disabled={statusSubmitting}
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    {/if}

    <!-- MODAL PRATINJAU FOTO BUKTI KENDALA -->
    {#if isPhotoModalOpen && selectedReport.photoPath}
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
              {photoBlobError || "Gagal memuat foto bukti."}
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
            aria-selected={selectedStatus === "pending"}
            class="status-tab {selectedStatus === 'pending' ? 'active' : ''}"
            onclick={() => selectStatusTab("pending")}
          >
            Menunggu ({statusCounts.pending})
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
            aria-selected={selectedStatus === "resolved"}
            class="status-tab {selectedStatus === 'resolved' ? 'active' : ''}"
            onclick={() => selectStatusTab("resolved")}
          >
            Selesai ({statusCounts.resolved})
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
            placeholder="Cari tiket, kamar, atau penyewa..."
            aria-label="Cari tiket, kamar, atau penyewa"
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
            aria-selected={selectedStatus === "pending"}
            class="status-tab {selectedStatus === 'pending' ? 'active' : ''}"
            onclick={() => selectStatusTab("pending")}
          >
            Menunggu ({statusCounts.pending})
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
            aria-selected={selectedStatus === "resolved"}
            class="status-tab {selectedStatus === 'resolved' ? 'active' : ''}"
            onclick={() => selectStatusTab("resolved")}
          >
            Selesai ({statusCounts.resolved})
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
        <!-- EMPTY STATE LAPORAN KERUSAKAN FIGMA -->
        <div class="empty-tickets-wrap" in:fade={{ duration: 160 }}>
          <div class="empty-tickets-card">
            <div class="empty-inbox-circle" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                <path
                  d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
                ></path>
              </svg>
            </div>

            <h2 class="empty-tickets-title">Tidak ada tiket kerusakan aktif</h2>
            <p class="empty-tickets-desc">
              Semua laporan fasilitas telah diselesaikan dengan baik oleh tim
              pengelola.
            </p>
          </div>

          <button
            type="button"
            class="btn-history-completed"
            onclick={() => selectStatusTab("resolved")}
          >
            Lihat Riwayat Selesai
          </button>
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
            Nomor kamar diambil otomatis dari kontrak aktif. Ubah status ke
            Diproses saat teknisi mulai menangani.
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

  /* --- EMPTY STATE FIGMA LAPORAN KERUSAKAN --- */
  .empty-tickets-wrap {
    padding: 24px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
  }

  .empty-tickets-card {
    width: 100%;
    max-width: 420px;
    padding: 36px 24px;
    border-radius: 12px;
    border: 1px solid #ece3d9;
    background-color: #ffffff;
    text-align: center;
    box-sizing: border-box;
  }

  .empty-inbox-circle {
    width: 44px;
    height: 44px;
    margin: 0 auto 14px;
    border-radius: 999px;
    background-color: #f3ede6;
    color: #7c6858;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-tickets-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .empty-tickets-desc {
    margin: 0 auto;
    max-width: 280px;
    font-size: 12px;
    line-height: 1.5;
    color: #9e8b7c;
  }

  .btn-history-completed {
    width: 100%;
    max-width: 420px;
    height: 40px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-history-completed:hover {
    background-color: #faf7f2;
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

  .form-error-banner {
    padding: 10px 12px;
    margin-bottom: 12px;
    border-radius: 6px;
    background-color: #fdecec;
    border: 1px solid #f2c6c2;
    color: #c62828;
    font-size: 12px;
  }

  .reply-error {
    margin-top: 10px;
    margin-bottom: 0;
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

  .status-badge.pending {
    background-color: #fef3c7;
    color: #b45309;
  }

  .status-badge.in_progress {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .status-badge.resolved {
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
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
    background-color: #5a3e28;
    color: #ffffff;
  }

  .empty-discussion-text {
    margin: 0;
    font-size: 12px;
    color: #9e8b7c;
  }

  .chat-reply-form {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }

  .chat-reply-input {
    flex: 1;
    height: 38px;
    padding: 0 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    box-sizing: border-box;
  }

  .chat-reply-input:focus {
    outline: none;
    border-color: #5a3e28;
  }

  .btn-primary-brown {
    height: 38px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background-color: #5a3e28;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-primary-brown:hover:not(:disabled) {
    background-color: #49311f;
  }

  .btn-primary-brown:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary-brown.full-width {
    width: 100%;
  }

  .btn-secondary-full {
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

  .btn-outline-full {
    width: 100%;
    height: 36px;
    border: 1px solid #e2d8cd;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 6px;
  }

  .btn-outline-full:hover {
    background-color: #faf7f2;
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
    margin: 14px 0 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  /* --- MODAL UBAH STATUS & LIGHTBOX FOTO --- */
  .modal-backdrop,
  .photo-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background-color: rgba(24, 18, 14, 0.55);
  }

  .status-modal-card {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 90;
    width: 92%;
    max-width: 440px;
    padding: 22px;
    border-radius: 14px;
    background-color: #ffffff;
    box-shadow: 0 16px 40px rgba(24, 18, 14, 0.24);
    box-sizing: border-box;
  }

  .status-modal-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .status-modal-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #261a14;
  }

  .status-modal-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    font-size: 12px;
    font-weight: 600;
    color: #261a14;
  }

  .form-select,
  .form-textarea {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    background-color: #ffffff;
    color: #261a14;
    font-family: inherit;
    font-size: 12px;
    box-sizing: border-box;
  }

  .form-textarea {
    resize: vertical;
  }

  .status-modal-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    background-color: #5a3e28;
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

    .mobile-detail-stack .mobile-detail-heading {
      margin: 0 0 6px;
      font-size: 18px;
      font-weight: 700;
      color: #261a14;
      line-height: 1.35;
      letter-spacing: 0;
      word-spacing: 0.08em;
      overflow-wrap: break-word;
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
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 160px;
      border: 1px solid #dfd3c5;
      border-radius: 8px;
      background-color: #e9dfd4;
      color: #5a3e28;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      gap: 2px;
      cursor: pointer;
      overflow: hidden;
      padding: 0;
      transition:
        background-color 0.15s ease,
        transform 0.15s ease;
    }

    .mobile-photo-trigger:hover {
      background-color: #dfd2c3;
      transform: translateY(-1px);
    }

    .mobile-photo-trigger small {
      font-size: 9px;
      color: #8f7b6b;
    }

    .status-modal-card.sheet-capable {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      transform: none;
      width: 100%;
      max-width: 100%;
      border-radius: 18px 18px 0 0;
      padding: 14px 18px 22px;
    }

    .sheet-handle {
      width: 36px;
      height: 4px;
      border-radius: 999px;
      background-color: #dfd5ca;
      margin: 0 auto 12px;
    }
  }
</style>
