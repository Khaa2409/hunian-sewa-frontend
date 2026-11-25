// ==========================================
// 1. LOGIN & HALAMAN UMUM
// ==========================================
import Login from '../pages/auth/Login.svelte';
import ProfilePage from '../pages/public/ProfilePage.svelte';

// ==========================================
// 2. PAGE PEMILIK (OWNER)
// ==========================================
import OwnerHome from '../pages/owner/OwnerHome.svelte';
import OwnerAnnouncements from '../pages/owner/OwnerAnnouncements.svelte';
import OwnerMaintenanceReports from '../pages/owner/OwnerMaintenanceReports.svelte';
import OwnerRooms from '../pages/owner/OwnerRooms.svelte';
import OwnerUsers from '../pages/owner/OwnerUsers.svelte';
import OwnerContracts from '../pages/owner/OwnerContracts.svelte';
import OwnerFinanceReport from '../pages/owner/OwnerFinanceReport.svelte';

// ==========================================
// 3. PAGE PENGELOLA (CARETAKER)
// ==========================================
import CaretakerHome from '../pages/caretaker/CaretakerHome.svelte';

// ==========================================
// 4. PAGE PENYEWA (TENANT)
// ==========================================
import TenantHome from '../pages/tenant/TenantHome.svelte';

// ==========================================
// 5. PAGE WALI (GUARDIAN)
// ==========================================
import GuardianHome from '../pages/guardian/GuardianHome.svelte';

import { wrap } from 'svelte-spa-router/wrap';
import { get } from 'svelte/store';

import {
    isAuthenticated,
    hasRole
} from '../stores/auth.js';

// --- Guard Rute Pemilik ---
const ownerRoute = wrap({
    component: OwnerHome,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('owner');
        }
    ],
    userData: {
        role: 'owner'
    }
});

const ownerAnnouncementsRoute = wrap({
    component: OwnerAnnouncements,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('owner');
        }
    ],
    userData: {
        role: 'owner'
    }
});

const ownerMaintenanceRoute = wrap({
    component: OwnerMaintenanceReports,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('owner');
        }
    ],
    userData: {
        role: 'owner'
    }
});

const ownerRoomsRoute = wrap({
    component: OwnerRooms,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('owner');
        }
    ],
    userData: {
        role: 'owner'
    }
});

const ownerUsersRoute = wrap({
    component: OwnerUsers,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('owner');
        }
    ],
    userData: {
        role: 'owner'
    }
});

const ownerContractsRoute = wrap({
    component: OwnerContracts,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('owner');
        }
    ],
    userData: {
        role: 'owner'
    }
});

const ownerFinanceRoute = wrap({
    component: OwnerFinanceReport,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('owner');
        }
    ],
    userData: {
        role: 'owner'
    }
});

// --- Guard Rute Pengelola ---
const caretakerRoute = wrap({
    component: CaretakerHome,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('caretaker');
        }
    ],
    userData: {
        role: 'caretaker'
    }
});

// --- Guard Rute Penyewa ---
const tenantRoute = wrap({
    component: TenantHome,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('tenant');
        }
    ],
    userData: {
        role: 'tenant'
    }
});

// --- Guard Rute Wali ---
const guardianRoute = wrap({
    component: GuardianHome,
    conditions: [
        () => {
            return get(isAuthenticated) && hasRole('guardian');
        }
    ],
    userData: {
        role: 'guardian'
    }
});

// --- Guard Rute Profil ---
const profileRoute = wrap({
    component: ProfilePage,
    conditions: [
        () => {
            return get(isAuthenticated);
        }
    ]
});

const routes = {
    // Login
    '/': Login,
    '/login': Login,

    // Page Pemilik
    '/owner': ownerRoute,
    '/owner/announcements': ownerAnnouncementsRoute,
    '/owner/maintenance': ownerMaintenanceRoute,
    '/owner/rooms': ownerRoomsRoute,
    '/owner/users': ownerUsersRoute,
    '/owner/contracts': ownerContractsRoute,
    '/owner/finance': ownerFinanceRoute,

    // Page Pengelola
    '/caretaker': caretakerRoute,

    // Page Penyewa
    '/tenant': tenantRoute,

    // Page Wali
    '/guardian': guardianRoute,

    // Profil
    '/profile': profileRoute
};

export default routes;