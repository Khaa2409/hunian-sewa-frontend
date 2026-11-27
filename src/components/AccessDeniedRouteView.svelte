<script>
  import AccessDenied from "./AccessDenied.svelte";
  import { currentUser } from "../stores/auth.js";
  import { deniedMetaStore } from "../lib/routes.js";

  let activeRole = $derived(String($currentUser?.role || "").toLowerCase());

  let meta = $derived($deniedMetaStore);

  let homeRoute = $derived.by(() => {
    if (activeRole === "owner") return "/owner";
    if (activeRole === "caretaker") return "/caretaker";
    if (activeRole === "guardian") return "/guardian";
    if (activeRole === "tenant") return "/tenant";
    return "/login";
  });

  let viewProps = $derived.by(() => {
    const deniedRole = meta.deniedRole;
    const targetPath = meta.targetPath;

    // 1. Pengelola membuka halaman khusus Pemilik
    if (activeRole === "caretaker" && deniedRole === "owner") {
      const isFinance = targetPath.includes("finance");
      return {
        pageTitle: isFinance ? "Laporan Keuangan" : "Halaman Pemilik",
        title: "Halaman ini khusus Pemilik",
        mobileTitle: "Akses Terbatas",
        subtitle: "Halaman ini hanya untuk Pemilik",
        description: isFinance
          ? "Laporan keuangan hanya dapat dilihat oleh Pemilik hunian. Hubungi Pemilik bila Anda perlu rekap penerimaan."
          : "Halaman ini hanya dapat diakses oleh Pemilik hunian. Hubungi Pemilik bila Anda memerlukan informasi terkait.",
        mobileDescription: isFinance
          ? "Menu Laporan Keuangan hanya dapat diakses langsung oleh Pemilik kos."
          : "Halaman ini hanya dapat diakses langsung oleh Pemilik kos.",
        homeRoute,
      };
    }

    // 2. Wali membuka halaman khusus Penyewa
    if (activeRole === "guardian" && deniedRole === "tenant") {
      const isDamage = targetPath.includes("damage-reports");
      return {
        pageTitle: "Fitur Tidak Tersedia",
        title: "Fitur Tidak Tersedia",
        mobileTitle: "Fitur Tidak Tersedia",
        subtitle: "Peran Wali tidak memiliki izin untuk halaman ini",
        description: isDamage
          ? "Peran Wali tidak memiliki izin untuk mengelola atau melihat menu laporan kerusakan."
          : "Peran Wali tidak memiliki izin untuk mengakses menu khusus Penyewa ini.",
        mobileDescription: isDamage
          ? "Peran Wali tidak memiliki izin untuk mengelola atau melihat menu laporan kerusakan."
          : "Peran Wali tidak memiliki izin untuk mengakses menu khusus Penyewa ini.",
        homeRoute,
      };
    }

    // 3. Penyewa atau Wali membuka halaman khusus Pengelola & Pemilik
    if (
      (activeRole === "tenant" || activeRole === "guardian") &&
      (deniedRole === "caretaker" || deniedRole === "owner")
    ) {
      return {
        pageTitle: "Akses Terbatas",
        title: "Halaman ini khusus Pengelola & Pemilik",
        mobileTitle: "Akses Terbatas",
        subtitle: "Anda tidak memiliki izin untuk membuka halaman ini",
        description:
          "Halaman pengelola dan pemilik tidak dapat diakses oleh Penyewa maupun Wali. Hubungi Pengelola bila Anda memerlukan bantuan.",
        mobileDescription:
          "Halaman ini hanya dapat diakses oleh Pengelola atau Pemilik hunian.",
        homeRoute,
      };
    }

    // Default fallback
    return {
      pageTitle: "Akses Terbatas",
      title: "Akses Halaman Ditolak",
      mobileTitle: "Akses Terbatas",
      subtitle: "Peran akun Anda tidak sesuai untuk halaman ini",
      description:
        "Anda tidak memiliki izin untuk membuka halaman yang diminta. Kembali ke beranda sesuai peran akun Anda.",
      mobileDescription:
        "Peran akun Anda tidak memiliki izin untuk membuka halaman ini.",
      homeRoute,
    };
  });
</script>

<AccessDenied
  pageTitle={viewProps.pageTitle}
  title={viewProps.title}
  mobileTitle={viewProps.mobileTitle}
  subtitle={viewProps.subtitle}
  description={viewProps.description}
  mobileDescription={viewProps.mobileDescription}
  homeRoute={viewProps.homeRoute}
/>
