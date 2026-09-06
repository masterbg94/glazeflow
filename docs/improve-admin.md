# Admin Panel Improvement Plan

## Current State Analysis

**Route:** `/admin` (platform admin, SUPER_ADMIN only)

**Files:**

- `src/app/(platform)/admin/page.tsx` — main dashboard (Client Component)
- `src/app/(platform)/admin/companies/[id]/page.tsx` — company detail (Client Component)
- `src/app/api/companies/route.ts` — list/create companies
- `src/app/api/companies/[id]/route.ts` — company detail

**What exists:**

- Create company form
- Companies table: name, slug, user count, order count, status, manage link
- Company detail: info, users CRUD

**What's missing:**

- Platform-level aggregates (total companies, users, orders, revenue)
- Order status breakdown
- User role distribution
- Catalog overview per company
- Recent activity feed
- Date filters / time-range views
- Export capabilities

---

## Proposed Enhancements

### 1. New API Endpoint: `GET /api/admin/stats`

**Purpose:** Single endpoint for all platform-wide dashboard data.

**Response shape:**

```ts
interface AdminStats {
  totals: {
    companies: number;
    users: number; // staff only (excl. CUSTOMER)
    customerOrgs: number;
    orders: number;
    revenue: string; // Decimal → string sum of Order.total
  };
  ordersByStatus: Record<OrderStatus, number>;
  usersByPlatformRole: Record<PlatformRole, number>;
  companiesDetail: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    counts: {
      users: number;
      orders: number;
      customerOrgs: number;
      glassTypes: number;
      pvcProfiles: number;
      hardwareItems: number;
      productTemplates: number;
      processingOptions: number;
      priceLists: number;
    };
  }>;
  recentActivity: Array<{
    type: 'company_created' | 'order_created' | 'user_created' | 'order_status_changed';
    timestamp: string;
    companyName: string;
    companySlug: string;
    details: string; // e.g. "Order #ORD-001 created (RSD 150,000)"
  }>; // last 20 events
}
```

**Queries needed:**

```ts
// Totals
prisma.company.count();
prisma.user.count({ where: { platformRole: { not: 'CUSTOMER' } } });
prisma.customerOrg.count();
prisma.order.count();
prisma.order.aggregate({ _sum: { total: true } });

// Orders by status
prisma.order.groupBy({ by: ['status'], _count: true });

// Users by platformRole
prisma.user.groupBy({ by: ['platformRole'], _count: true });

// Companies with catalog counts
prisma.company.findMany({
  include: {
    _count: {
      select: {
        users: true,
        orders: true,
        customerOrgs: true,
        glassTypes: true,
        pvcProfiles: true,
        hardwareItems: true,
        productTemplates: true,
        processingOptions: true,
        priceLists: true,
      },
    },
  },
});

// Recent activity (union of recent companies, orders, users)
```

**Auth:** `requireRole(['SUPER_ADMIN'])`

---

### 2. Enhanced Admin Page UI (`src/app/(platform)/admin/page.tsx`)

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Platform Administrator                    [SignOut]          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│  │Companies│ │  Users  │ │ Orders  │ │Revenue  │  ← Stat cards
│  │   12    │ │   45    │ │  128    │ │RSD 2.4M │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
├─────────────────────────────────────────────────────────────┤
│  Order Status Breakdown              User Role Distribution  │
│  ████████████ NEW (12)             ● SUPER_ADMIN (1)        │
│  ████████ CONFIRMED (34)           ● COMPANY_ADMIN (4)      │
│  ███████████ IN_PRODUCTION (28)    ● COMPANY_STAFF (12)     │
│  ████ READY (15)                   ● CUSTOMER (28)          │
│  ██ DELIVERED (22)                                         │
│  ██████ CANCELLED (17)                                       │
├─────────────────────────────────────────────────────────────┤
│  Companies Table (enhanced)                                  │
│  [Name] [Slug] [Users] [Orders] [Catalog] [Status] [Actions] │
│  ACME    acme    5       45     📦 12/8/4/6/3/2  Active  →  │
│  └─ expand → glass:4 profile:2 hardware:3 template:6 proc:3 │
├─────────────────────────────────────────────────────────────┤
│  Recent Activity (last 20)                                   │
│  🏢 Company "NewCo" created                    2 min ago     │
│  📦 Order #ORD-001 created (RSD 150,000)       15 min ago    │
│  👤 User "john@acme.test" added to ACME        1 hour ago    │
└─────────────────────────────────────────────────────────────┘
```

**Components to add:**

- `StatCard` — label, value, optional trend
- `HorizontalBarChart` — pure CSS, no deps
- `RoleDistribution` — simple list with colored dots
- `ExpandableTableRow` — click to show catalog breakdown
- `ActivityFeed` — list with icons + timestamps
- Time-range selector (7d / 30d / 90d / all) — optional v2

---

### 3. Company Detail Page Enhancements

**Add to `src/app/(platform)/admin/companies/[id]/page.tsx`:**

- Order status breakdown for this company
- Revenue trend (last 6 months) — simple bar chart
- Top customers by order count
- Catalog completeness checklist (has glass? profiles? templates?)

---

### 4. Future Considerations (v2+)

- **Real-time updates:** SSE endpoint `/api/admin/stream` for live stats
- **Export:** CSV/PDF buttons on stats and companies table
- **Drill-down:** Click order status bar → filtered orders list
- **Alerts:** Companies with 0 orders in 30d, inactive users, low catalog
- **Multi-tenancy health:** Storage usage, API rate limits per company
- **Impersonation:** "Login as company admin" for support

---

## Implementation Order

| Phase | Task                                                                  | Files                            |
| ----- | --------------------------------------------------------------------- | -------------------------------- |
| 1     | Create `/api/admin/stats/route.ts`                                    | New file                         |
| 2     | Update `/api/companies/route.ts` to include catalog counts            | Edit existing                    |
| 3     | Build UI components (StatCard, BarChart, ActivityFeed, ExpandableRow) | New files in `components/admin/` |
| 4     | Refactor `admin/page.tsx` to use new API + components                 | Edit existing                    |
| 5     | Enhance company detail page                                           | Edit existing                    |
| 6     | Add loading/error/skeleton states                                     | Edit                             |
| 7     | Manual test with seeded data                                          | `npm run dev`                    |

---

## Technical Notes

- **Decimal serialization:** All monetary values → string in API (`total.toString()`)
- **No new dependencies:** Charts = CSS flex/grid bars; icons = inline SVG
- **Caching:** Consider `next/cache` `revalidate: 60` on stats endpoint
- **Permissions:** All endpoints guarded by `requireRole(['SUPER_ADMIN'])`

---

## Acceptance Criteria

- [ ] `/admin` loads without errors for SUPER_ADMIN
- [ ] Stat cards show correct totals matching DB
- [ ] Order status bars reflect actual order counts
- [ ] User role counts match seeded users
- [ ] Companies table shows catalog counts on expand
- [ ] Recent activity shows last 20 platform events
- [ ] No Decimal serialization errors in console
- [ ] Page responsive on mobile (stack cards, horizontal scroll table)

---

## References

- Schema: `prisma/schema.prisma` (Company, User, Order, catalog models)
- Seed: `prisma/seed.ts` (test data structure)
- Auth: `src/lib/rbac.ts` (`requireRole`)
- Current admin: `src/app/(platform)/admin/page.tsx`
