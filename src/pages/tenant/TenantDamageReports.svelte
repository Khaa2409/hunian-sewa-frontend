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
  let reports = $state([]);

  /** @type {Record<string, any> | null} */
  let selectedReport = $state(null);

  /** @type {'all' | 'pending' | 'processing' | 'done'} */
  let activeStatus = $state("all");

  let searchQuery = $state("");
  let currentPage = $state(1);
  const perPage = 10;
  let totalCount = $state(0);
  let totalPages = $state(1);

  /** @type {'list' | 'detail'} */
  let viewMode = $state("list");

  let createPanelOpen = $state(false);
  let isMobileViewport = $state(false);
  let isDragOverPhoto = $state(false);
  let loading = $state(true);
  let detailLoading = $state(false);
  let isSubmitting = $state(false);
  let isSendingComment = $state(false);

  let errorMessage = $state("");
  let detailError = $state("");
  let formError = $state("");
  let feedbackMessage = $state("");

  // Form Buat Laporan Kerusakan
  let formCategory = $state("AC");
  let formDescription = $state("");
  /** @type {File | null} */
  let formPhotoFile = $state(null);
  /** @type {HTMLInputElement | null} */
  let photoInputRef = $state(null);

  // Komentar / Diskusi Tiket
  let commentInput = $state("");

  const categoryOptions = [
    "AC",
    "Listrik",
    "Air",
    "Wi-Fi / Internet",
    "Furniture / Kamar",
    "Lainnya",
  ];

  function syncViewportState() {
    if (typeof window === "undefined") return;
    isMobileViewport = window.innerWidth <= 900;
  }

  /**
   * @param {string} msg
   */
  function notifyFeedback(msg) {
    feedbackMessage = msg;
    setTimeout(() => {
      if (feedbackMessage === msg) feedbackMessage = "";
    }, 3500);
  }

  /**
   * @param {Record<string, any>} item
   */
  function getReportId(item) {
    return item?.id ?? item?.report_id ?? item?.ticket_id ?? "";
  }

  /**
   * @param {Record<string, any>} item
   */
  function getTicketCode(item) {
    if (item?.ticket_number) return String(item.ticket_number);
    if (item?.ticket_code) return String(item.ticket_code);
    if (item?.code) return String(item.code);
    if (item?.id !== null && item?.id !== undefined) {
      return `T-${String(item.id).padStart(4, "0")}`;
    }
    return "-";
  }

  /**
   * @param {string | null | undefined} rawStatus
   * @returns {'pending' | 'processing' | 'done'}
   */
  function normalizeStatus(rawStatus) {
    const val = String(rawStatus || "")
      .trim()
      .toLowerCase();
    if (
      val === "completed" ||
      val === "done" ||
      val === "resolved" ||
      val === "closed" ||
      val === "selesai"
    ) {
      return "done";
    }
    if (
      val === "in_progress" ||
      val === "progress" ||
      val === "processing" ||
      val === "diproses"
    ) {
      return "processing";
    }
    return "pending";
  }

  /**
   * @param {'pending' | 'processing' | 'done'} statusKey
   * @param {string | null | undefined} [rawLabel]
   */
  function getStatusLabel(statusKey, rawLabel) {
    if (rawLabel && String(rawLabel).trim()) return String(rawLabel).trim();
    if (statusKey === "done") return "Selesai";
    if (statusKey === "processing") return "Diproses";
    return "Menunggu";
  }

  /**
   * @param {'pending' | 'processing' | 'done'} statusKey
   * @returns {string[]}
   */
  function getBackendStatusCandidates(statusKey) {
    if (statusKey === "done") return ["completed", "resolved", "done"];
    if (statusKey === "processing") return ["in_progress", "progress"];
    return ["waiting_confirm", "pending", "waiting"];
  }

  /**
   * @param {any} err
   */
  function isInvalidStatusError(err) {
    const msg = String(err?.message || err?.data?.pesan || "").toLowerCase();
    return msg.includes("status tidak valid") || msg.includes("invalid status");
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
   * @param {string | null | undefined} dateStr
   */
  function formatTanggalWaktu(dateStr) {
    if (!dateStr) return "-";
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  }

  /**
   * @param {Record<string, any>} raw
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
      "";
    if (typeof candidate === "string") return candidate;
    if (candidate && typeof candidate === "object") {
      return candidate.url || candidate.photo_url || candidate.image_url || "";
    }
    return "";
  }

  /**
   * @param {Record<string, any> | null | undefined} item
   * @returns {Array<Record<string, any>>}
   */
  function getDiscussionList(item) {
    if (!item || typeof item !== "object") return [];
    const list =
      item.comments ||
      item.messages ||
      item.discussions ||
      item.ticket_comments ||
      item.replies ||
      item.follow_ups ||
      [];
    return Array.isArray(list) ? list : [];
  }

  let statusCounts = $derived.by(() => {
    let pending = 0;
    let processing = 0;
    let done = 0;

    for (const item of reports) {
      const st = normalizeStatus(item?.status);
      if (st === "pending") pending += 1;
      else if (st === "processing") processing += 1;
      else done += 1;
    }

    return {
      all: Math.max(totalCount, reports.length),
      pending,
      processing,
      done,
    };
  });

  const USER_ROLE_LABELS = {
    owner: "Pemilik",
    caretaker: "Pengelola",
    tenant: "Penyewa",
    penyewa: "Penyewa",
    guardian: "Wali",
  };

  let discussionItems = $derived.by(() => {
    const uid = get(currentUser)?.id;
    return getDiscussionList(selectedReport).map((msg) => {
      const roleRaw = String(
        msg?.user_role || msg?.role || msg?.role_label || "",
      ).toLowerCase();
      const name = msg?.user_name || msg?.author_name || "Pengguna";
      const timeStr = formatTanggalWaktu(
        msg?.created_at || msg?.sent_at || msg?.timestamp,
      );
      const isMine =
        (uid != null && msg?.user_id === uid) ||
        roleRaw === "tenant" ||
        roleRaw === "penyewa";
      return {
        ...msg,
        sender: [
          name,
          USER_ROLE_LABELS[roleRaw] || "",
          timeStr !== "-" ? timeStr : "",
        ]
          .filter(Boolean)
          .join(" · "),
        align: isMine ? "right" : "left",
        text: msg?.message || msg?.content || msg?.text || msg?.comment || "",
      };
    });
  });

  /**
   * @param {string} statusParamValue
   */
  async function requestTickets(statusParamValue) {    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", String(perPage));

    if (statusParamValue) {
      params.set("status", statusParamValue);
    }

    const q = searchQuery.trim();
    if (q) {
      params.set("q", q);
    }

    return await apiRequest(`/api/tickets?${params.toString()}`, {
      method: "GET",
    });
  }

  /**
   * @param {'all' | 'pending' | 'processing' | 'done'} statusKey
   */
  function selectStatusTab(statusKey) {
    activeStatus = statusKey;
    currentPage = 1;
    fetchReportsPage();
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let searchDebounceTimer = null;
  function handleSearchInput() {
    currentPage = 1;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      fetchReportsPage();
    }, 250);
  }

  function openCreateDrawer() {
    syncViewportState();
    formError = "";
    formCategory = "AC";
    formDescription = "";
    formPhotoFile = null;
    isDragOverPhoto = false;
    createPanelOpen = true;
  }

  function closeCreateDrawer() {
    if (isSubmitting) return;
    createPanelOpen = false;
    isDragOverPhoto = false;
    formError = "";
  }

  /**
   * @param {File | null} file
   */
  function applyPhotoFile(file) {
    if (!file) {
      formPhotoFile = null;
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      formError = "Format foto harus JPG atau PNG.";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      formError = "Ukuran foto maksimal adalah 2 MB.";
      return;
    }
    formError = "";
    formPhotoFile = file;
  }

  /**
   * @param {Event} e
   */
  function handlePhotoChange(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input?.files && input.files[0] ? input.files[0] : null;
    applyPhotoFile(file);
  }

  function triggerPhotoPicker() {
    if (isSubmitting) return;
    photoInputRef?.click();
  }

  /**
   * @param {DragEvent} e
   */
  function handleDropzoneDragOver(e) {
    e.preventDefault();
    if (isSubmitting) return;
    isDragOverPhoto = true;
  }

  /**
   * @param {DragEvent} e
   */
  function handleDropzoneDragLeave(e) {
    e.preventDefault();
    isDragOverPhoto = false;
  }

  /**
   * @param {DragEvent} e
   */
  function handleDropzoneDrop(e) {
    e.preventDefault();
    isDragOverPhoto = false;
    if (isSubmitting) return;
    const droppedFile =
      e.dataTransfer?.files && e.dataTransfer.files[0]
        ? e.dataTransfer.files[0]
        : null;
    applyPhotoFile(droppedFile);
  }

  /**
   * @param {Record<string, any>} item
   */
  async function openReportDetail(item) {
    /** @type {Record<string, any>} */
    let current = { ...item };
    selectedReport = current;
    detailError = "";
    commentInput = "";
    viewMode = "detail";

    const id = getReportId(item);
    if (!id) return;

    detailLoading = true;
    try {
      /** @type {any} */
      const res = await apiRequest(`/api/tickets/${encodeURIComponent(id)}`, {
        method: "GET",
      });
      const detail = res?.data && typeof res.data === "object" ? res.data : res;
      if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        current = { ...current, ...detail };
        selectedReport = current;
      }

      if (getDiscussionList(current).length === 0) {
        try {
          /** @type {any} */
          const commentsRes = await apiRequest(
            `/api/tickets/${encodeURIComponent(id)}/comments`,
            { method: "GET" },
          );
          const rawComments = Array.isArray(commentsRes?.data)
            ? commentsRes.data
            : Array.isArray(commentsRes?.comments)
              ? commentsRes.comments
              : Array.isArray(commentsRes)
                ? commentsRes
                : [];
          if (rawComments.length > 0) {
            current = { ...current, comments: rawComments };
            selectedReport = current;
          }
        } catch {
          // Abaikan jika komentar sudah menyatu pada detail tiket
        }
      }
    } catch (/** @type {any} */ err) {
      detailError =
        err?.data?.pesan ||
        err?.message ||
        "Rincian terbaru tiket belum dapat dimuat dari server.";
    } finally {
      detailLoading = false;
    }
  }

  function backToList() {
    viewMode = "list";
    selectedReport = null;
    detailError = "";
    fetchReportsPage();
  }

  async function fetchReportsPage() {
    loading = true;
    errorMessage = "";

    const fallbackUser = get(currentUser);

    try {
      const profilePromise = apiRequest("/api/me", { method: "GET" });

      const ticketsPromise = (async () => {
        if (activeStatus === "all") {
          return await requestTickets("");
        }

        const candidates = getBackendStatusCandidates(activeStatus);
        let lastErr = null;
        for (const candidate of candidates) {
          try {
            return await requestTickets(candidate);
          } catch (/** @type {any} */ err) {
            lastErr = err;
            if (!isInvalidStatusError(err)) {
              throw err;
            }
          }
        }

        const fallbackAll = await requestTickets("");
        const allList = Array.isArray(fallbackAll?.data)
          ? fallbackAll.data
          : Array.isArray(fallbackAll?.tickets)
            ? fallbackAll.tickets
            : [];
        const filteredList = allList.filter(
          (/** @type {any} */ item) =>
            normalizeStatus(item?.status) === activeStatus,
        );
        return {
          ...fallbackAll,
          data: filteredList,
          meta: {
            page: 1,
            limit: perPage,
            total: filteredList.length,
            total_pages: Math.max(1, Math.ceil(filteredList.length / perPage)),
          },
        };
      })();

      const [profileRes, ticketsRes] = await Promise.allSettled([
        profilePromise,
        ticketsPromise,
      ]);

      const pVal = profileRes.status === "fulfilled" ? profileRes.value : null;
      profile = pVal?.data ?? pVal?.user ?? pVal ?? fallbackUser ?? null;

      if (ticketsRes.status === "fulfilled") {
        /** @type {any} */
        const tVal = ticketsRes.value;
        const list = Array.isArray(tVal?.data)
          ? tVal.data
          : Array.isArray(tVal?.tickets)
            ? tVal.tickets
            : Array.isArray(tVal)
              ? tVal
              : [];
        reports = list;

        const meta = tVal?.meta || tVal?.pagination || {};
        totalCount = Number(meta.total ?? tVal?.total ?? list.length);
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
        const reason = /** @type {any} */ (ticketsRes.reason);
        reports = [];
        totalCount = 0;
        totalPages = 1;
        errorMessage =
          reason?.data?.pesan ||
          reason?.message ||
          "Gagal memuat daftar laporan kerusakan dari server.";
      }
    } catch (/** @type {any} */ err) {
      reports = [];
      totalCount = 0;
      totalPages = 1;
      errorMessage =
        err?.data?.pesan ||
        err?.message ||
        "Gagal memuat daftar laporan kerusakan.";
    } finally {
      loading = false;
    }
  }

  /**
   * @param {SubmitEvent} e
   */
  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;
    formError = "";

    const cleanDesc = formDescription.trim();

    if (!cleanDesc) {
      formError = "Deskripsi kendala wajib diisi.";
      return;
    }

    isSubmitting = true;
    try {
      if (formPhotoFile) {
        const formData = new FormData();
        formData.append("category", formCategory);
        formData.append("description", cleanDesc);
        formData.append("photo", formPhotoFile);

        await apiRequest("/api/tickets", {
          method: "POST",
          body: formData,
        });
      } else {
        await apiRequest("/api/tickets", {
          method: "POST",
          body: {
            category: formCategory,
            description: cleanDesc,
          },
        });
      }

      createPanelOpen = false;
      currentPage = 1;
      notifyFeedback("Laporan kerusakan berhasil dikirim.");
      await fetchReportsPage();
    } catch (/** @type {any} */ err) {
      formError =
        err?.data?.pesan ||
        err?.message ||
        "Gagal mengirim laporan kerusakan ke server.";
    } finally {
      isSubmitting = false;
    }
  }

  /**
   * @param {SubmitEvent} e
   */
  async function handleSendComment(e) {
    e.preventDefault();
    if (!selectedReport || isSendingComment) return;

    const cleanMsg = commentInput.trim();
    if (!cleanMsg) return;

    const id = getReportId(selectedReport);
    if (!id) return;

    isSendingComment = true;
    try {
      /** @type {any} */
      const res = await apiRequest(
        `/api/tickets/${encodeURIComponent(id)}/comments`,
        {
          method: "POST",
          body: { message: cleanMsg },
        },
      );

      const newComment = res?.data ?? {
        id: Date.now(),
        author_name: profile?.name || "Penyewa",
        role_label: "Penyewa",
        message: cleanMsg,
        created_at: new Date().toISOString(),
      };

      selectedReport = {
        ...selectedReport,
        comments: [...discussionItems, newComment],
      };
      commentInput = "";
    } catch (/** @type {any} */ err) {
      detailError =
        err?.data?.pesan ||
        err?.message ||
        "Gagal mengirim pesan diskusi tiket.";
    } finally {
      isSendingComment = false;
    }
  }

  onMount(() => {
    syncViewportState();
    window.addEventListener("resize", syncViewportState);
    fetchReportsPage();

    return () => {
      window.removeEventListener("resize", syncViewportState);
    };
  });
</script>

<DashboardLayout
  role="tenant"
  activeKey="damage-reports"
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

  {#if viewMode === "detail" && selectedReport}
    {@const stKey = normalizeStatus(selectedReport.status)}
    {@const photoUrl = extractPhotoUrl(selectedReport)}
    {@const techNote =
      selectedReport.technical_note ||
      selectedReport.technician_note ||
      selectedReport.technician_notes ||
      selectedReport.resolution_note ||
      selectedReport.notes ||
      ""}
    <div in:fly={{ y: 14, duration: 220 }} class="detail-page-stack">
      <button type="button" class="btn-back-link" onclick={backToList}>
        &larr; Kembali ke Laporan Kerusakan
      </button>

      {#if detailError}
        <div class="inline-notice" role="status">{detailError}</div>
      {/if}

      <div class="detail-grid">
        <div class="dr-card">
          <div class="detail-top-row">
              <span class="ticket-code-label">
                {getTicketCode(selectedReport)}
              </span>
              <span class="status-pill {stKey}">
                {getStatusLabel(stKey, selectedReport.status_label)}
              </span>
            </div>

            <h1 class="detail-title">
              {selectedReport.category ||
                selectedReport.subject ||
                "Laporan Kerusakan"}
            </h1>

            <p class="detail-meta-line">
              Pelapor: {selectedReport.reporter_name ||
                selectedReport.tenant_name ||
                profile?.name ||
                "-"} &middot; Kamar {selectedReport.room_number ||
                selectedReport.room?.room_number ||
                "-"} &middot; {formatTanggal(
                selectedReport.created_at || selectedReport.reported_at,
              )}
            </p>

            <div class="detail-meta-grid">
              <div>
                <span class="meta-lbl">Kategori</span>
                <span class="meta-val">{selectedReport.category || "-"}</span>
              </div>
              <div>
                <span class="meta-lbl">Tanggal Lapor</span>
                <span class="meta-val"
                  >{formatTanggal(
                    selectedReport.created_at || selectedReport.reported_at,
                  )}</span
                >
              </div>
            </div>

            <div class="detail-section-block">
              <span class="meta-lbl">Deskripsi Masalah</span>
              <p class="detail-desc-text">
                {selectedReport.description || selectedReport.detail || "-"}
              </p>
            </div>

            {#if photoUrl}
              <div class="detail-section-block">
                <span class="meta-lbl">Foto bukti kendala</span>
                <img
                  src={photoUrl}
                  alt="Foto bukti kerusakan"
                  class="detail-photo-img"
                />
              </div>
            {/if}

            {#if techNote}
              <div class="detail-section-block">
                <span class="meta-lbl">Catatan teknis dari Pengelola</span>
                <p class="detail-desc-text">{techNote}</p>
              </div>
            {/if}

            {#if detailLoading}
              <p class="dr-muted">Memperbarui detail tiket...</p>
            {/if}
          </div>

          <section
            class="dr-card detail-status-card"
            aria-label="Status Penanganan"
          >
            <h2 class="section-heading">Status Penanganan</h2>

            <div class="side-kv">
              <span class="meta-lbl">Status</span>
              <span class="status-pill {stKey}">
                {getStatusLabel(stKey, selectedReport.status_label)}
              </span>
            </div>
            {#if techNote}
              <div class="side-note-box">
                <span class="meta-lbl">Catatan teknis dari Pengelola</span>
                <p class="detail-desc-text">{techNote}</p>
              </div>
            {/if}
          </section>

          <section class="detail-discussion-card" aria-label="Diskusi Tiket">
            <h2 class="discussion-heading">Diskusi Tiket</h2>

            {#if discussionItems.length === 0}
              <p class="empty-discussion-text">
                Belum ada pesan diskusi pada tiket ini.
              </p>
            {:else}
              <div class="discussion-thread-box">
                {#each discussionItems as msg, idx (msg?.id ?? idx)}
                  <div class="chat-row {msg.align}">
                    <span class="chat-sender">{msg.sender}</span>
                    <div class="chat-bubble {msg.align}">{msg.text}</div>
                  </div>
                {/each}
              </div>
            {/if}

            <form class="chat-reply-form" onsubmit={handleSendComment}>
              <input
                type="text"
                class="chat-reply-input"
                bind:value={commentInput}
                placeholder="Tulis balasan untuk pengelola..."
                aria-label="Tulis balasan untuk pengelola"
                disabled={isSendingComment}
              />
              <button
                type="submit"
                class="btn-primary-brown chat-send-btn"
                disabled={isSendingComment || !commentInput.trim()}
              >
                {isSendingComment ? "Mengirim..." : "Kirim"}
              </button>
            </form>
          </section>
      </div>
    </div>
  {:else}
    <div in:fade={{ duration: 200 }} class="dr-page-stack">
      <!-- Top Header -->
      <div class="dr-top-bar">
        <div>
          <h1 class="dr-title">Laporan Kerusakan</h1>
          <p class="dr-subtitle">
            <span class="desktop-sub">
              Laporan kendala fasilitas di kamar dan area bersama
            </span>
            <span class="mobile-sub">
              Laporan kendala fasilitas di kamar dan area bersama
            </span>
          </p>
        </div>

        <button
          type="button"
          class="btn-brown btn-create-dr"
          onclick={openCreateDrawer}
        >
          <span class="desktop-sub">Buat Laporan</span>
          <span class="mobile-sub">+ Buat Laporan Kerusakan Baru</span>
        </button>
      </div>

      <!-- Search Input -->
      <div class="search-row">
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
          class="search-input"
          bind:value={searchQuery}
          placeholder="Cari tiket laporan saya..."
          aria-label="Cari tiket laporan saya"
          oninput={handleSearchInput}
        />
      </div>

      <!-- Filter Pills -->
      <div
        class="filter-pills"
        role="tablist"
        aria-label="Filter status laporan"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeStatus === "all"}
          class="filter-pill {activeStatus === 'all' ? 'active' : ''}"
          onclick={() => selectStatusTab("all")}
        >
          Semua ({statusCounts.all})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeStatus === "pending"}
          class="filter-pill {activeStatus === 'pending' ? 'active' : ''}"
          onclick={() => selectStatusTab("pending")}
        >
          Menunggu ({statusCounts.pending})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeStatus === "processing"}
          class="filter-pill {activeStatus === 'processing' ? 'active' : ''}"
          onclick={() => selectStatusTab("processing")}
        >
          Diproses ({statusCounts.processing})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeStatus === "done"}
          class="filter-pill {activeStatus === 'done' ? 'active' : ''}"
          onclick={() => selectStatusTab("done")}
        >
          Selesai ({statusCounts.done})
        </button>
      </div>

      {#if loading}
        <div class="dr-card">
          <p class="dr-muted">Memuat laporan kerusakan...</p>
        </div>
      {:else if errorMessage}
        <div class="dr-error-box" role="alert">
          <div class="dr-error-row">
            <div>
              <p class="dr-error-title">Gagal memuat laporan kerusakan</p>
              <p class="dr-error-desc">{errorMessage}</p>
            </div>
            <button type="button" class="btn-brown" onclick={fetchReportsPage}>
              Coba Lagi
            </button>
          </div>
        </div>
      {:else}
        <!-- Desktop Table Card -->
        <section class="dr-card desktop-table-card" aria-label="Daftar laporan">
          <div class="card-head-block">
            <h2 class="section-heading">Daftar Laporan</h2>
            <p class="card-sub-hint">
              {perPage} laporan per halaman, urut laporan terbaru
            </p>
          </div>

          <div class="table-scroll">
            <table class="dr-table">
              <thead>
                <tr>
                  <th>ID Tiket</th>
                  <th>Kategori</th>
                  <th>Tanggal Lapor</th>
                  <th>Status</th>
                  <th class="th-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {#if reports.length === 0}
                  <tr>
                    <td colspan="5" class="td-empty">
                      Belum ada laporan kerusakan yang ditemukan.
                    </td>
                  </tr>
                {:else}
                  {#each reports as item, idx (getReportId(item) || idx)}
                    {@const stKey = normalizeStatus(item.status)}
                    <tr>
                      <td class="td-bold">{getTicketCode(item)}</td>
                      <td>{item.category || item.title || "-"}</td>
                      <td class="td-date">
                        {formatTanggal(item.created_at || item.reported_at)}
                      </td>
                      <td>
                        <span class="status-pill {stKey}">
                          {getStatusLabel(stKey, item.status_label)}
                        </span>
                      </td>
                      <td class="td-right">
                        <button
                          type="button"
                          class="btn-detail-sm"
                          onclick={() => openReportDetail(item)}
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

          <p class="table-footnote">
            Kamar terisi otomatis sesuai kontrak aktif. Penyebab atau status
            tiket diatur pengelola.
          </p>

          <div class="pagination-bar">
            <span class="pagination-info">
              {#if totalCount > 0}
                Menampilkan {(currentPage - 1) * perPage + 1}&ndash;{Math.min(
                  currentPage * perPage,
                  totalCount,
                )} dari {totalCount} laporan
              {:else}
                Menampilkan 0 laporan
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
                    fetchReportsPage();
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
                    fetchReportsPage();
                  }
                }}
                disabled={currentPage >= totalPages}
              >
                Berikutnya
              </button>
            </div>
          </div>
        </section>

        <!-- Mobile Card List -->
        <div class="mobile-cards-list">
          {#if reports.length === 0}
            <div class="dr-card">
              <p class="dr-empty-sm">
                Belum ada laporan kerusakan yang ditemukan.
              </p>
            </div>
          {:else}
            {#each reports as item, idx (getReportId(item) || idx)}
              {@const stKey = normalizeStatus(item.status)}
              <button
                type="button"
                class="mobile-dr-card-btn"
                onclick={() => openReportDetail(item)}
              >
                <div class="mobile-dr-top">
                  <div>
                    <h2 class="mobile-dr-title">
                      {item.category || item.title || "Laporan Kerusakan"}
                    </h2>
                    <p class="mobile-dr-sub">
                      Kamar {item.room_number || item.room?.room_number || "-"} &middot;
                      {getTicketCode(item)}
                    </p>
                  </div>
                  <span class="status-pill {stKey}">
                    {getStatusLabel(stKey, item.status_label)}
                  </span>
                </div>

                <div class="mobile-dr-meta">
                  <div>
                    <span class="meta-lbl">Kategori</span>
                    <span class="meta-val">{item.category || "-"}</span>
                  </div>
                  <div>
                    <span class="meta-lbl">Dilaporkan</span>
                    <span class="meta-val">
                      {formatTanggal(item.created_at || item.reported_at)}
                    </span>
                  </div>
                </div>
              </button>
            {/each}
          {/if}

          <div class="mobile-pagination">
            <span class="pagination-info">
              Halaman {currentPage} dari {totalPages}
            </span>
            <div class="mobile-pagination-btns">
              <button
                type="button"
                class="page-btn"
                onclick={() => {
                  if (currentPage > 1) {
                    currentPage -= 1;
                    fetchReportsPage();
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
                    fetchReportsPage();
                  }
                }}
                disabled={currentPage >= totalPages}
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- DRAWER / BOTTOM SHEET BUAT LAPORAN -->
  {#if createPanelOpen}
    <div
      class="drawer-backdrop"
      transition:fade={{ duration: 160 }}
      onclick={closeCreateDrawer}
      role="presentation"
    ></div>

    <aside
      class="create-drawer"
      aria-label="Buat Laporan Kerusakan"
      transition:fly={isMobileViewport
        ? { y: 260, duration: 220 }
        : { x: 280, duration: 220 }}
    >
      <div class="sheet-grab-bar"></div>
      <div class="drawer-head">
        <h2 class="drawer-title">Buat Laporan Kerusakan</h2>
        <button
          type="button"
          class="drawer-close-btn"
          onclick={closeCreateDrawer}
          aria-label="Tutup panel buat laporan"
        >
          &times;
        </button>
      </div>

      {#if formError}
        <div class="form-error-banner" role="alert">{formError}</div>
      {/if}

      <form class="drawer-form" onsubmit={handleCreateSubmit}>
        <div class="form-group">
          <label class="form-label" for="dr-category">Kategori Kerusakan</label>
          <select
            id="dr-category"
            class="form-control"
            bind:value={formCategory}
            disabled={isSubmitting}
          >
            {#each categoryOptions as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="dr-desc">Deskripsi Detail</label>
          <textarea
            id="dr-desc"
            class="form-textarea"
            rows="4"
            bind:value={formDescription}
            placeholder="Jelaskan kondisi kerusakan yang dialami..."
            disabled={isSubmitting}
            required></textarea>
        </div>

        <div class="form-group">
          <span class="form-label">Foto bukti kendala</span>
          <input
            bind:this={photoInputRef}
            id="dr-photo"
            type="file"
            accept="image/jpeg,image/png"
            class="sr-file-input"
            onchange={handlePhotoChange}
            disabled={isSubmitting}
          />
          <button
            type="button"
            class="photo-dropzone {isDragOverPhoto ? 'drag-over' : ''}"
            onclick={triggerPhotoPicker}
            ondragover={handleDropzoneDragOver}
            ondragleave={handleDropzoneDragLeave}
            ondrop={handleDropzoneDrop}
          >
            <span class="dropzone-main-text">
              Tarik dan lepas foto di sini, atau
            </span>
            <span class="dropzone-pick-btn">Pilih File</span>
            <span class="dropzone-hint-text">
              {formPhotoFile
                ? formPhotoFile.name
                : "Opsional. Format JPG/PNG, maks 2MB."}
            </span>
          </button>
        </div>

        <div class="drawer-actions">
          <button
            type="submit"
            class="btn-brown btn-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Mengirim..." : "Kirim Laporan"}
          </button>
          <button
            type="button"
            class="btn-outline btn-full"
            onclick={closeCreateDrawer}
            disabled={isSubmitting}
          >
            Batal
          </button>
        </div>
      </form>
    </aside>
  {/if}
</DashboardLayout>

<style>
  .dr-page-stack,
  .detail-page-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .dr-top-bar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .dr-title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    color: #231f1e;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .dr-subtitle {
    margin: 4px 0 0;
    font-size: 12.5px;
    color: #8e7e6e;
    line-height: 1.45;
  }

  .mobile-sub {
    display: none;
  }

  .search-row {
    position: relative;
    display: flex;
    align-items: center;
    max-width: 340px;
    width: 100%;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    color: #9e8b7c;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 38px;
    padding: 0 12px 0 36px;
    border: 1px solid #e6ddd2;
    border-radius: 10px;
    background-color: #ffffff;
    color: #231f1e;
    font-size: 12px;
    box-sizing: border-box;
  }

  .search-input:focus {
    outline: none;
    border-color: #684b36;
  }

  .filter-pills {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-pill {
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

  .filter-pill.active {
    background-color: #5a3e28;
    border-color: #5a3e28;
    color: #ffffff;
    font-weight: 600;
  }

  .dr-card {
    background-color: #ffffff;
    border: 1px solid #eae2d7;
    border-radius: 14px;
    padding: 20px;
    box-sizing: border-box;
  }

  .card-head-block {
    margin-bottom: 14px;
  }

  .section-heading {
    margin: 0 0 3px;
    font-size: 15px;
    font-weight: 700;
    color: #231f1e;
  }

  .card-sub-hint {
    margin: 0;
    font-size: 11px;
    color: #9e8b7c;
  }

  .table-scroll {
    width: 100%;
    overflow-x: auto;
  }

  .dr-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .dr-table th {
    padding: 10px 12px;
    border-bottom: 1px solid #f0e8df;
    font-size: 11px;
    font-weight: 600;
    color: #8f7c6e;
  }

  .dr-table td {
    padding: 12px;
    border-bottom: 1px solid #f4ede5;
    font-size: 12px;
    color: #231f1e;
    vertical-align: middle;
  }

  .td-bold {
    font-weight: 700;
  }

  .td-date {
    color: #9e8b7c !important;
  }

  .td-empty {
    text-align: center;
    padding: 24px 12px !important;
    color: #8e7e6e !important;
  }

  .th-right,
  .td-right {
    text-align: right;
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

  .status-pill.pending {
    background-color: #fef3c7;
    color: #b45309;
  }

  .status-pill.processing {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .status-pill.done {
    background-color: #dcfce7;
    color: #15803d;
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

  .table-footnote {
    margin: 14px 0 10px;
    font-size: 11px;
    color: #9e8b7c;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid #f4ede5;
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

  .mobile-cards-list {
    display: none;
  }

  /* Detail View */
  .btn-back-link {
    align-self: flex-start;
    border: none;
    background: transparent;
    padding: 0;
    font-size: 12.5px;
    font-weight: 500;
    color: #8e7e6e;
    cursor: pointer;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.75fr) minmax(250px, 1fr);
    gap: 16px;
    align-items: start;
  }

  .detail-status-card {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .detail-discussion-card {
    padding: 22px 24px;
    border: 1px solid #ece3d9;
    border-radius: 12px;
    background-color: #ffffff;
  }

  .discussion-heading {
    margin: 0 0 14px;
    font-size: 15px;
    font-weight: 700;
    color: #261a14;
  }

  .empty-discussion-text {
    margin: 0;
    font-size: 12px;
    color: #9e8b7c;
  }

  .detail-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }

  .ticket-code-label {
    font-size: 12px;
    font-weight: 600;
    color: #9e8b7c;
  }

  .detail-title {
    margin: 0 0 6px;
    font-size: 20px;
    font-weight: 700;
    color: #231f1e;
  }

  .detail-meta-line {
    margin: 0 0 14px;
    font-size: 11.5px;
    color: #9e8b7c;
  }

  .detail-meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid #f2ece4;
  }

  .detail-section-block {
    margin-top: 14px;
  }

  .meta-lbl {
    display: block;
    font-size: 10.5px;
    color: #9e8b7c;
    margin-bottom: 3px;
  }

  .meta-val {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #231f1e;
  }

  .detail-desc-text {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: #3b2e25;
  }

  .detail-photo-img {
    margin-top: 6px;
    max-width: 100%;
    max-height: 260px;
    border-radius: 10px;
    border: 1px solid #eae2d7;
    object-fit: cover;
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

  .side-kv {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .side-note-box {
    margin-top: 16px;
  }

  /* Drawer / Bottom Sheet Buat Laporan */
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background-color: rgba(24, 18, 14, 0.45);
  }

  .create-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 70;
    width: 100%;
    max-width: 440px;
    padding: 22px 24px;
    background-color: #ffffff;
    box-shadow: -8px 0 28px rgba(24, 18, 14, 0.16);
    overflow-y: auto;
    box-sizing: border-box;
  }

  .sheet-grab-bar {
    display: none;
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .drawer-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #231f1e;
  }

  .drawer-close-btn {
    border: none;
    background: transparent;
    font-size: 22px;
    color: #8c7b6e;
    cursor: pointer;
  }

  .drawer-form {
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
    color: #231f1e;
  }

  .form-control,
  .form-textarea {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    font-size: 12.5px;
    color: #231f1e;
    background-color: #ffffff;
    box-sizing: border-box;
    font-family: inherit;
  }

  .form-textarea {
    min-height: 92px;
    resize: vertical;
  }

  .sr-file-input {
    display: none;
  }

  .photo-dropzone {
    width: 100%;
    border: 1px dashed #dfd4c8;
    border-radius: 10px;
    background-color: #fcfaf7;
    padding: 16px 14px;
    text-align: center;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-family: inherit;
    box-sizing: border-box;
  }

  .photo-dropzone:hover,
  .photo-dropzone.drag-over {
    border-color: #5a3e28;
    background-color: #f6efe7;
  }

  .dropzone-main-text {
    font-size: 11px;
    color: #8e7e6e;
  }

  .dropzone-pick-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px 12px;
    border: 1px solid #dfd4c8;
    border-radius: 6px;
    background-color: #ffffff;
    color: #231f1e;
    font-size: 11px;
    font-weight: 500;
  }

  .dropzone-hint-text {
    font-size: 10.5px;
    color: #9e8b7c;
    word-break: break-word;
  }

  .drawer-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }

  .btn-brown {
    background-color: #5a3e28;
    color: #ffffff;
    border: 1px solid #5a3e28;
    border-radius: 8px;
    padding: 9px 15px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
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

  .btn-outline {
    background-color: #ffffff;
    color: #231f1e;
    border: 1px solid #e4dad0;
    border-radius: 8px;
    padding: 9px 15px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-full {
    width: 100%;
    height: 38px;
    box-sizing: border-box;
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

  .inline-notice {
    padding: 10px 14px;
    border-radius: 10px;
    background-color: #fff8e7;
    border: 1px solid #f0dfb1;
    color: #7c5812;
    font-size: 12px;
  }

  .form-error-banner {
    padding: 10px 12px;
    margin-bottom: 12px;
    border-radius: 8px;
    background-color: #fde8e8;
    border: 1px solid #f8b4b4;
    color: #9b1c1c;
    font-size: 12px;
  }

  .dr-muted,
  .dr-empty-sm {
    margin: 0;
    font-size: 12.5px;
    color: #8e7e6e;
  }

  .dr-error-box {
    background-color: #fdf4f4;
    border: 1px solid #e8c4c4;
    border-radius: 14px;
    padding: 16px 18px;
    color: #9e2a2b;
  }

  .dr-error-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .dr-error-title {
    margin: 0;
    font-size: 13.5px;
    font-weight: 700;
  }

  .dr-error-desc {
    margin: 3px 0 0;
    font-size: 12px;
    color: #7e2223;
  }

  @media (max-width: 900px) {
    .desktop-sub,
    .desktop-table-card {
      display: none;
    }

    .mobile-sub {
      display: inline;
    }

    .dr-top-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .btn-create-dr {
      width: 100%;
      height: 40px;
    }

    .search-row {
      max-width: 100%;
    }

    .filter-pills {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .filter-pill {
      width: 100%;
      height: 36px;
      padding: 0 10px;
      justify-content: center;
      box-sizing: border-box;
    }

    .mobile-cards-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mobile-dr-card-btn {
      display: block;
      width: 100%;
      text-align: left;
      background-color: #ffffff;
      border: 1px solid #eae2d7;
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      font-family: inherit;
      color: inherit;
      box-sizing: border-box;
    }

    .mobile-dr-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }

    .mobile-dr-title {
      margin: 0 0 3px;
      font-size: 14px;
      font-weight: 700;
      color: #231f1e;
    }

    .mobile-dr-sub {
      margin: 0;
      font-size: 11.5px;
      color: #8e7e6e;
    }

    .mobile-dr-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .mobile-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding-top: 4px;
    }

    .mobile-pagination-btns {
      display: flex;
      gap: 8px;
    }

    .detail-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .detail-status-card {
      grid-column: auto;
      grid-row: auto;
    }

    .create-drawer {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 100%;
      max-height: 90vh;
      border-radius: 18px 18px 0 0;
      padding: 14px 18px 24px;
      box-shadow: 0 -8px 28px rgba(24, 18, 14, 0.16);
    }

    .sheet-grab-bar {
      display: block;
      width: 36px;
      height: 4px;
      border-radius: 999px;
      background-color: #dfd5ca;
      margin: 0 auto 12px;
    }
  }
</style>
