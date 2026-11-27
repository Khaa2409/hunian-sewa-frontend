import { writable, get } from "svelte/store";
import { wrap } from "svelte-spa-router/wrap";
import { replace } from "svelte-spa-router";

// 1. LOGIN & HALAMAN UMUM
import Login from "../pages/auth/Login.svelte";
import ProfilePage from "../pages/public/ProfilePage.svelte";
import AccessDenied from "../components/AccessDenied.svelte";
import AccessDeniedRouteView from "../components/AccessDeniedRouteView.svelte";

// 2. PAGE PEMILIK (OWNER)
import OwnerHome from "../pages/owner/OwnerHome.svelte";
import OwnerAnnouncements from "../pages/owner/OwnerAnnouncements.svelte";
import OwnerMaintenanceReports from "../pages/owner/OwnerMaintenanceReports.svelte";
import OwnerRooms from "../pages/owner/OwnerRooms.svelte";
import OwnerUsers from "../pages/owner/OwnerUsers.svelte";
import OwnerContracts from "../pages/owner/OwnerContracts.svelte";
import OwnerFinanceReport from "../pages/owner/OwnerFinanceReport.svelte";

// 3. PAGE PENGELOLA (CARETAKER)
import CaretakerHome from "../pages/caretaker/CaretakerHome.svelte";
import CaretakerAnnouncements from "../pages/caretaker/CaretakerAnnouncements.svelte";
import CaretakerMaintenanceReports from "../pages/caretaker/CaretakerMaintenanceReports.svelte";
import CaretakerRooms from "../pages/caretaker/CaretakerRooms.svelte";
import CaretakerUsers from "../pages/caretaker/CaretakerUsers.svelte";
import CaretakerContracts from "../pages/caretaker/CaretakerContracts.svelte";

// 4. PAGE PENYEWA (TENANT)
import TenantHome from "../pages/tenant/TenantHome.svelte";
import TenantAnnouncements from "../pages/tenant/TenantAnnouncements.svelte";
import TenantDamageReports from "../pages/tenant/TenantDamageReports.svelte";
import TenantBillsPayments from "../pages/tenant/TenantBillsPayments.svelte";

// 5. PAGE WALI (GUARDIAN)
import GuardianHome from "../pages/guardian/GuardianHome.svelte";
import GuardianAnnouncements from "../pages/guardian/GuardianAnnouncements.svelte";
import GuardianBillsPayments from "../pages/guardian/GuardianBillsPayments.svelte";

import { isAuthenticated, hasRole } from "../stores/auth.js";

export const deniedMetaStore = writable({
  deniedRole: "",
  targetPath: "",
});

/**
 * Guard untuk rute yang mewajibkan role tertentu.
 * @param {"tenant" | "guardian" | "caretaker" | "owner"} allowedRole
 * @param {string} targetPath
 */
function createRoleGuard(allowedRole, targetPath) {
  return () => {
    if (!get(isAuthenticated)) {
      replace("/login");
      return false;
    }

    if (!hasRole(allowedRole)) {
      deniedMetaStore.set({
        deniedRole: allowedRole,
        targetPath,
      });
      replace("/access-denied");
      return false;
    }

    return true;
  };
}

function authGuard() {
  if (!get(isAuthenticated)) {
    replace("/login");
    return false;
  }

  return true;
}

const accessDeniedRoute = wrap({
  component: AccessDeniedRouteView,
  conditions: [authGuard],
});

const notFoundRoute = wrap({
  component: AccessDenied,
  props: {
    variant: "not-found",
    pageTitle: "Halaman Tidak Ditemukan",
    title: "Halaman tidak ditemukan",
    mobileTitle: "Halaman tidak ditemukan",
    subtitle:
      "Tautan yang Anda akses mungkin sudah kedaluwarsa atau tidak valid",
    description:
      "Tautan yang Anda akses mungkin sudah kedaluwarsa atau alamat URL tidak valid (404).",
    mobileDescription:
      "Tautan yang Anda akses mungkin sudah kedaluwarsa atau alamat URL tidak valid (404).",
  },
});

// --- Guard Rute Pemilik ---
const ownerRoute = wrap({
  component: OwnerHome,
  conditions: [createRoleGuard("owner", "/owner")],
  userData: { role: "owner" },
});

const ownerAnnouncementsRoute = wrap({
  component: OwnerAnnouncements,
  conditions: [createRoleGuard("owner", "/owner/announcements")],
  userData: { role: "owner" },
});

const ownerMaintenanceRoute = wrap({
  component: OwnerMaintenanceReports,
  conditions: [createRoleGuard("owner", "/owner/maintenance")],
  userData: { role: "owner" },
});

const ownerRoomsRoute = wrap({
  component: OwnerRooms,
  conditions: [createRoleGuard("owner", "/owner/rooms")],
  userData: { role: "owner" },
});

const ownerUsersRoute = wrap({
  component: OwnerUsers,
  conditions: [createRoleGuard("owner", "/owner/users")],
  userData: { role: "owner" },
});

const ownerContractsRoute = wrap({
  component: OwnerContracts,
  conditions: [createRoleGuard("owner", "/owner/contracts")],
  userData: { role: "owner" },
});

const ownerFinanceRoute = wrap({
  component: OwnerFinanceReport,
  conditions: [createRoleGuard("owner", "/owner/finance")],
  userData: { role: "owner" },
});

// --- Guard Rute Pengelola ---
const caretakerRoute = wrap({
  component: CaretakerHome,
  conditions: [createRoleGuard("caretaker", "/caretaker")],
  userData: { role: "caretaker" },
});

const caretakerAnnouncementsRoute = wrap({
  component: CaretakerAnnouncements,
  conditions: [createRoleGuard("caretaker", "/caretaker/announcements")],
  userData: { role: "caretaker" },
});

const caretakerMaintenanceRoute = wrap({
  component: CaretakerMaintenanceReports,
  conditions: [createRoleGuard("caretaker", "/caretaker/maintenance")],
  userData: { role: "caretaker" },
});

const caretakerRoomsRoute = wrap({
  component: CaretakerRooms,
  conditions: [createRoleGuard("caretaker", "/caretaker/rooms")],
  userData: { role: "caretaker" },
});

const caretakerUsersRoute = wrap({
  component: CaretakerUsers,
  conditions: [createRoleGuard("caretaker", "/caretaker/users")],
  userData: { role: "caretaker" },
});

const caretakerContractsRoute = wrap({
  component: CaretakerContracts,
  conditions: [createRoleGuard("caretaker", "/caretaker/contracts")],
  userData: { role: "caretaker" },
});

// --- Guard Rute Penyewa ---
const tenantRoute = wrap({
  component: TenantHome,
  conditions: [createRoleGuard("tenant", "/tenant")],
  userData: { role: "tenant" },
});

const tenantAnnouncementsRoute = wrap({
  component: TenantAnnouncements,
  conditions: [createRoleGuard("tenant", "/tenant/announcements")],
  userData: { role: "tenant" },
});

const tenantDamageReportsRoute = wrap({
  component: TenantDamageReports,
  conditions: [createRoleGuard("tenant", "/tenant/damage-reports")],
  userData: { role: "tenant" },
});

const tenantBillsPaymentsRoute = wrap({
  component: TenantBillsPayments,
  conditions: [createRoleGuard("tenant", "/tenant/bills-payments")],
  userData: { role: "tenant" },
});

// --- Guard Rute Wali ---
const guardianRoute = wrap({
  component: GuardianHome,
  conditions: [createRoleGuard("guardian", "/guardian")],
  userData: { role: "guardian" },
});

const guardianAnnouncementsRoute = wrap({
  component: GuardianAnnouncements,
  conditions: [createRoleGuard("guardian", "/guardian/announcements")],
  userData: { role: "guardian" },
});

const guardianBillsPaymentsRoute = wrap({
  component: GuardianBillsPayments,
  conditions: [createRoleGuard("guardian", "/guardian/bills-payments")],
  userData: { role: "guardian" },
});

// --- Guard Rute Profil ---
const profileRoute = wrap({
  component: ProfilePage,
  conditions: [authGuard],
});

const routes = {
  // Login & Akses
  "/": Login,
  "/login": Login,
  "/access-denied": accessDeniedRoute,

  // Page Pemilik
  "/owner": ownerRoute,
  "/owner/announcements": ownerAnnouncementsRoute,
  "/owner/maintenance": ownerMaintenanceRoute,
  "/owner/rooms": ownerRoomsRoute,
  "/owner/users": ownerUsersRoute,
  "/owner/contracts": ownerContractsRoute,
  "/owner/finance": ownerFinanceRoute,

  // Page Pengelola
  "/caretaker": caretakerRoute,
  "/caretaker/announcements": caretakerAnnouncementsRoute,
  "/caretaker/maintenance": caretakerMaintenanceRoute,
  "/caretaker/rooms": caretakerRoomsRoute,
  "/caretaker/users": caretakerUsersRoute,
  "/caretaker/contracts": caretakerContractsRoute,

  // Page Penyewa
  "/tenant": tenantRoute,
  "/tenant/announcements": tenantAnnouncementsRoute,
  "/tenant/damage-reports": tenantDamageReportsRoute,
  "/tenant/bills-payments": tenantBillsPaymentsRoute,

  // Page Wali
  "/guardian": guardianRoute,
  "/guardian/announcements": guardianAnnouncementsRoute,
  "/guardian/bills-payments": guardianBillsPaymentsRoute,

  // Profil
  "/profile": profileRoute,

  // Fallback 404
  "*": notFoundRoute,
};

export default routes;
