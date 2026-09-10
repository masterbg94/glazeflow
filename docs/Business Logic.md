# GlazeFlow V2 — Multi-Tenant B2B Glass & PVC Ordering Platform

## 0. Executive Summary

We are building a **B2B ordering bridge** between:

- **The Big Company (Supplier / Manufacturer)** — produces glass, PVC profiles, hardware, and/or finished windows/doors.
- **The Small Company (Customer / Fabricator / Installer)** — orders those products to create or install windows/doors for _their own_ clients.

The platform replaces phone calls, WhatsApp threads, and messy email quotes with:

1. A **supplier admin panel** where the big company sets all prices, catalogs, customer-specific discounts, branding, and order management.
2. A **customer ordering portal** where the small company configures products by dimensions, sees **live calculated prices**, orders **multiple line items** with **quantity multipliers**, and tracks status.
3. A **communication layer** inside every order — messages, attachments, quote changes, status updates — so nothing gets lost.

The solution is **multi-tenant SaaS**: you, the platform owner, onboard many large manufacturer companies. Each one gets its own branded storefront, its own catalog, its own prices, and its own customers.

---

## 1. Problem Statement (why this app exists)

### The Small Company problem

- They need to order glass and PVC profiles/window systems from a big supplier.
- They need to know the **price immediately** based on: dimensions, glass type/thickness, profile system, color, hardware, quantity.
- They often order **many different pieces** in one purchase order.
- They currently call/email and wait for quotes; this causes errors, delays, and price disputes.

### The Big Company problem

- They want to sell dynamically by dimension, glass type, and profile.
- They need to **separate their internal cost** from the **price they show customers**.
- They want different pricing for different small customer companies (B2B tiers).
- They need to manage orders through production and delivery, assign staff, and keep full audit history.

### What we eliminate

- Phone/email quote ping-pong.
- Wrong-dimension orders.
- Price misunderstandings after the fact.
- Lost order specs and drawings.

---

## 2. Core Business Model (explicit assumptions)

### Actors

| Role                                  | Who                                  | What they do                                                            |
| ------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| **Platform Super Admin**              | You / SaaS owner                     | Onboards big companies, manages billing/plans, sees cross-tenant health |
| **Supplier Admin**                    | Big company owner/admin              | Sets catalog, prices, branding, price lists, manages orders             |
| **Supplier Staff**                    | Big company sales/production workers | Process orders, assign tasks, update statuses, internal notes           |
| **Customer Org Owner**                | Small company owner/manager          | Creates orders, pays/negotiates, views all company orders               |
| **Customer Member (Buyer/Installer)** | Small company staff                  | Places orders, uploads drawings, communicates per order                 |

### Key rule: “Customer” is a **company**, not a person

A small company can have multiple users. All orders belong to the **Customer Organization**, so history is shared across their team.

### Two possible product modes (we support both)

1. **Finished Product Mode** — The small company orders a complete configured window/door unit.  
   Example: _“1 × Tilt-Turn window, 1200×1500 mm, REHAU Total70, double glazed 4/16/4, white, 2 handles.”_

2. **Raw Material Mode** — The small company orders raw materials they will fabricate themselves.  
   Example: _“10 m of REHAU Total70 profile, 4 panes of tempered 6 mm glass, each 800×1200 mm, 12 handles.”_

Our catalog and pricing engine will support both. A company can enable one or both modes.

---

## 3. Product & Pricing Model (the heart of the app)

### 3.1 Catalog entities the supplier manages

| Entity                            | Fields (examples)                                                   | Pricing unit           |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| **Glass Type**                    | Float, Tempered, Laminated, Low-E, Tinted, Frosted, Acoustic        | Per m²                 |
| **Glass Thickness**               | 4 / 5 / 6 / 8 / 10 / 12 mm                                          | Surcharge per extra mm |
| **PVC Profile System**            | REHAU Total70, VEKA Softline 70, KBE Engine 70                      | Per meter              |
| **Profile Brand / Chamber count** | 3 / 5 / 6 chambers, 58–90 mm depth                                  | affects price          |
| **Profile Color**                 | White, Anthracite Grey, Golden Oak, Black, custom                   | color surcharge        |
| **Hardware**                      | Handles, locks, hinges, trickle vents, sills                        | Per piece/meter        |
| **Processing Options**            | Edge polish, holes/notches, custom cut shapes, strengthening        | Per item/m²            |
| **Product Template**              | Fixed window, tilt-turn, sliding door, patio door, glass-only panel | complexity multiplier  |
| **Unit of Measure**               | mm (default) or inch                                                | —                      |

### 3.2 Pricing formulas

We need **server-side authoritative pricing** so customers can never manipulate totals.

#### Glass piece (glass-only item)

```
glassPrice = areaSqm × glassType.sellPricePerSqm × thicknessSurchargeMultiplier
```

Where:

```
areaSqm = (widthMm / 1000) × (heightMm / 1000)
thicknessSurchargeMultiplier = 1 + ((thicknessMm - baseThicknessMm) × surchargePercentPerMm / 100)
baseThicknessMm is company-configurable, default 4mm
```

Add processing options:

```
+ edgePolishPrice + holeCutPrice + notchPrice + customShapePrice
```

#### Raw PVC profile item

```
profilePrice = lengthMeters × profile.sellPricePerMeter × colorSurchargeFactor
```

#### Finished window/door unit

```
framePerimeterM = 2 × (widthMm + heightMm) / 1000

unitPrice =
  ( framePerimeterM × profile.sellPricePerMeter
    + Σ (each glass pane price)
    + Σ (hardware price × quantity)
    + Σ (accessories/processing prices)
  )
  × template.complexityMultiplier
  × openingCountFactor
```

Where `complexityMultiplier` accounts for more complex systems (e.g. tilt-turn vs fixed window) and `openingCountFactor` adds cost for multiple operable sashes.

#### Order totals

```
subtotal = Σ lineTotal
discountAmount = subtotal × customerPriceList.discountPercent / 100
taxAmount = (subtotal - discountAmount) × company.taxRatePercent / 100
total = subtotal - discountAmount + taxAmount
```

All decimals are rounded to 2 dp. Customer sees **unit price per line**, **line total**, and **grand total**.

### 3.3 Price lists & customer-specific pricing

The supplier can set:

- **Public sell prices** — visible to all customers (default).
- **Customer-specific price lists** — e.g. “Reseller Bronze −8%”, “Reseller Gold −15%”, “Enterprise custom prices”.
- **Per-customer overrides** — a specific small company gets different prices for specific products.
- **Internal cost prices** — only visible to supplier admins; never visible to customers.

### 3.4 Price snapshots (critical business rule)

When the customer submits an order:

- The server calculates prices from the **current catalog + customer price list**.
- It **snapshots** every unit price and line total into the order record.
- Later catalog/price changes do **not** change existing orders.
- If the supplier needs to change a price after submission, they must issue a **price amendment / re-quote** that the customer must accept.

---

## 4. Customer Ordering Flow (small company)

### Step 1 — Choose a supplier

If the small company is registered with multiple big suppliers (future), they see a list. For MVP: each big supplier has its own branded subdomain (`acme.glazeflow.app`); the customer is routed directly there.

### Step 2 — Create a draft order

The customer creates a draft order and can save it as a template for later reuse.

### Step 3 — Add line items

For each line item, choose:

- Product kind: `GLASS_ONLY`, `RAW_PROFILE`, `FINISHED_WINDOW`, `FINISHED_DOOR`, `HARDWARE/ACCESSORY`
- Product template (if finished): fixed window, tilt-turn, sliding, etc.
- **Dimensions**:
  - Glass/window/door: width × height (mm)
  - Raw profile: length (m)
- **Quantity multiplier** (integer; min 1)
- **Profile configuration** (for windows/doors): brand, system, chambers, color
- **Glass configuration**:
  - Layers: single / double / triple
  - Per pane: glass type + thickness
  - Air gap width + gas fill (air/argon/krypton)
- **Hardware & accessories**: handles, locks, vents, sills, with quantities
- **Processing options**: edge polish, holes, notches, custom shapes
- **Per-line note** + optional photo/drawing upload
- **Preferred delivery date**

### Step 4 — Live price calculation

Every change to dimensions/type/profile/hardware immediately updates:

- Area/perimeter
- Per-line price
- Order subtotal
- Discount + tax
- Grand total

### Step 5 — Review & submit

The customer reviews a full summary:

| Line | Product             | Dimensions | Qty | Unit Price   | Line Total  |
| ---- | ------------------- | ---------- | --- | ------------ | ----------- |
| 1    | Tilt-turn window    | 1200×1500  | 2   | $287.45      | $574.90     |
| 2    | Tempered glass pane | 800×1200   | 4   | $38.16       | $152.64     |
| 3    | Handle              | —          | 4   | $14.00       | $56.00      |
|      |                     |            |     | **Subtotal** | $783.54     |
|      |                     |            |     | **Discount** | −$62.68     |
|      |                     |            |     | **Tax**      | $57.67      |
|      |                     |            |     | **Total**    | **$778.53** |

After submission, the supplier is notified, and the order enters their pipeline.

---

## 5. Supplier Admin Panel (big company)

### 5.1 Dashboard

- Number of new orders
- Orders in production
- Revenue today/week/month
- Top products
- Average order value
- Pending price amendments

### 5.2 Catalog & Pricing Manager

- Manage Glass Types (add/edit/activate; base price per m², surcharge per mm)
- Manage PVC Profiles (brand, system, chamber count, depth, color, price per meter)
- Manage Hardware / Accessories
- Manage Product Templates (complexity multiplier, min/max dimensions)
- Manage Processing options (edge, holes, etc.)
- **Preview customer view** — see exactly what the customer sees after price changes

### 5.3 Price Lists & Customers

- Create price lists (Retail, Reseller Bronze, Reseller Gold, custom)
- Assign price lists to customer organizations
- Set per-customer special prices
- See each customer's order history

### 5.4 Order Management

- Order list with filters: status, customer, staff, date
- **Order detail view** containing:
  - All line items with full specs
  - Price breakdown per line and total
  - Customer notes
  - Drawings/photos
  - Customer messages
  - Internal notes (visible only to supplier)
  - Status history timeline
- Actions:
  - Request information
  - Quote amendment (change price → customer must accept)
  - Confirm order
  - Assign production staff
  - Start production
  - Mark ready
  - Mark delivered
  - Close / cancel
- Per-item statuses (accept/reject individual lines)

### 5.5 Staff & Roles

- `COMPANY_ADMIN`: full control
- `COMPANY_SALES`: orders, customers, quotes
- `COMPANY_PRODUCTION`: sees production-related fields, updates production status, internal notes only

### 5.6 Branding

- Logo, primary/secondary/accent colors, tagline, contact info, footer
- These appear instantly on the customer-facing storefront
- Each big company is fully white-labeled

---

## 6. Communication Layer (the “bridge”)

### 6.1 Order thread / messages

Each order has a **chat thread** where:

- Customer and supplier can both post messages.
- System events are posted automatically:
  - Order created
  - Price amendment proposed
  - Price amendment accepted/rejected
  - Order confirmed
  - Production started
  - Ready for delivery
  - Delivered
  - Cancelled
- Attachments (blueprints, photos, purchase orders) can be added to orders and line items.

### 6.2 Notifications

| Event                    | Who is notified      | Channel        |
| ------------------------ | -------------------- | -------------- |
| New order placed         | Supplier admin/sales | In-app + email |
| Order confirmed          | Customer             | In-app + email |
| Price amendment proposed | Customer             | In-app + email |
| Price amendment accepted | Supplier             | In-app + email |
| Production started       | Customer             | In-app + email |
| Ready for delivery       | Customer             | In-app + email |
| Delivered                | Customer             | In-app + email |
| New message              | Both parties         | In-app + email |
| Staff assigned           | Assigned staff       | In-app + email |

- **Supplier-level notification rules**: which event emails which role/team.
- **Customer-level preferences**: email vs in-app, immediate vs daily digest.
- **In-app realtime**: Server-Sent Events (SSE) gives instant unread badge and toast.

---

## 7. Technical Architecture

### 7.1 Stack (free to start, scalable later)

| Layer              | Technology                                        |
| ------------------ | ------------------------------------------------- |
| Frontend + Backend | Next.js 14/15 (App Router, TypeScript)            |
| Database           | PostgreSQL (Neon or Supabase free tier)           |
| ORM                | Prisma                                            |
| Auth               | NextAuth (credentials + email magic-link later)   |
| Styling            | Tailwind CSS                                      |
| Email              | Resend (free tier)                                |
| Realtime           | Server-Sent Events (built-in)                     |
| File uploads       | Vercel Blob (free tier) / local `/uploads` in dev |
| Hosting            | Vercel (free tier)                                |
| Mobile             | PWA now; wrap later with Capacitor/TWA            |

### 7.2 Multi-tenancy model

- **Shared database, shared schema** — all tenant data in the same tables.
- Every tenant-scoped table carries `companyId` (the big supplier).
- Every order/customer record also carries `customerOrgId`.
- **Defense in depth**:
  1. Every Prisma query in the repository layer filters by `companyId` / `customerOrgId`.
  2. PostgreSQL Row-Level Security policies enforce tenant isolation at the database level.
- **Branding** implemented via CSS variables (`--brand-primary`, etc.) injected from the tenant record.

### 7.3 API design

- REST API via Next.js Route Handlers for catalog, orders, pricing, notifications.
- Server Actions for form submissions where appropriate.
- Client-side live pricing uses a **pure TypeScript pricing engine** shared between client and server (server re-calculates authoritatively).

### 7.4 Sample endpoint contract

```
POST /api/orders
{
  companyId,
  items: [
    {
      productKind: "FINISHED_WINDOW",
      templateId: "tilt-turn",
      widthMm: 1200,
      heightMm: 1500,
      quantity: 2,
      profileId: "rehau-total70",
      profileColor: "White",
      glazingLayers: "DOUBLE",
      glassPanes: [
        { glassTypeId: "float", thicknessMm: 4 },
        { glassTypeId: "tempered", thicknessMm: 4 }
      ],
      hardware: [
        { hardwareId: "handle", quantity: 2 },
        { hardwareId: "lock", quantity: 1 }
      ]
    }
  ],
  shippingAddress: "...",
  customerNotes: "Please deliver before March 20"
}
```

Response: returns the created order **with server-calculated totals**.

---

## 8. Refined Data Model (conceptual)

| Table                                                                                      | Purpose                                                                          |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `Company`                                                                                  | Big supplier tenant; branding, settings, tax, currency                           |
| `User`                                                                                     | Login account                                                                    |
| `CustomerOrg`                                                                              | The small company; belongs to a `Company`; assigned price list                   |
| `CustomerOrgMember`                                                                        | Users belonging to a `CustomerOrg`                                               |
| `GlassType` / `PvcProfileSystem` / `HardwareItem` / `ProductTemplate` / `ProcessingOption` | Supplier catalog                                                                 |
| `PriceList`                                                                                | B2B discount tiers                                                               |
| `CustomerPriceOverride`                                                                    | Special per-customer prices                                                      |
| `Order`                                                                                    | Header; bill-to/ship-to; totals; snapshot fields; status; customer org           |
| `OrderItem`                                                                                | One configured product piece; all specs; unit price; line total; per-line status |
| `OrderItemGlassPane`                                                                       | Glass pane details per finished window/glass item                                |
| `OrderItemHardware`                                                                        | Hardware/accessory line                                                          |
| `OrderStatusHistory`                                                                       | Audit trail                                                                      |
| `OrderMessage` / `OrderAttachment`                                                         | Communication thread + files                                                     |
| `Notification` / `NotificationPreference` / `NotificationRule`                             | Notification system                                                              |
| `SavedConfiguration`                                                                       | Customer's reusable templates                                                    |

---

## 9. Edge Cases, Pitfalls & Resolutions

| Risk / Problem                                            | Solution                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Price changes between customer's quote and submission** | Server-side authoritative recalculation at submission; snapshot prices into order                |
| **Customer sees stale price**                             | Client recalculates on every change; server rejects mismatched totals (or recalculates silently) |
| **Dimensions out of manufacturer's production limits**    | Product template min/max validation; show warning and block invalid input                        |
| **Multi-user customer confusion**                         | All orders under `CustomerOrg`; shared history; optional per-user notes                          |
| **Partial acceptance/rejection of order lines**           | Per-item status tracks `PENDING / ACCEPTED / REJECTED`; order summary updates                    |
| **Price amendment after order placed**                    | Quote amendment mechanism; order stays in `QUOTE_AMENDMENT` until customer accepts/rejects       |
| **Tenant data leak**                                      | `companyId` filter in every query + Postgres RLS                                                 |
| **Decimal floating point errors**                         | Use `Decimal` in DB; round to 2 dp at known boundaries                                           |
| **Notification spam**                                     | Per-event/user preferences; daily digest option                                                  |
| **File upload abuse**                                     | MIME validation, size limits, rate limiting, store in blob storage                               |
| **Customer refuses to accept quoted price**               | Order moves to `REJECTED` or `NEEDS_INFO`; supplier can adjust and re-send                       |
| **Customer orders raw profile but needs cut lengths**     | Support continuous length + specific cut-list mode in line item                                  |
| **Multiple branches/locations for customer**              | Optional `CustomerOrg` has multiple shipping addresses; per-order address                        |
| **Legacy phone/email habits**                             | Notifications include clickable links to the order thread; no attachments via email              |

---

## 10. Implementation Roadmap (phased)

### Phase 0 — Foundation

- Next.js app with TypeScript + Tailwind
- PostgreSQL + Prisma schema
- NextAuth (login/register, roles)
- Multi-tenant subdomain/route resolution
- Basic seed data

### Phase 1 — Supplier Catalog & Pricing Admin

- CRUD for glass types, profiles, hardware, templates
- Price lists + customer orgs + customer price overrides
- Pricing engine library (pure functions)
- Internal cost vs sell price UI

### Phase 2 — Customer Ordering Wizard

- Product kind selection
- Configurator form (dimensions, profile, glass, hardware, accessories)
- Live price summary component
- Draft order + multiple line items + quantity multiplier
- Server-side authoritative order creation
- Order details page for customer

### Phase 3 — Supplier Order Management

- Order list with filters
- Order detail with full specs and pricing breakdown
- Status pipeline + per-item statuses
- Staff assignment
- Internal notes
- Quote amendment flow

### Phase 4 — Communication & Notifications

- Order message thread
- Attachments/drawings upload
- SSE realtime notifications
- Email notifications with Resend
- Notification preferences/rules administration

### Phase 5 — Customer Portal & Branding

- My orders + status timeline + reorder
- Saved configurations
- Supplier branding (logo/colors/footer) applied dynamically
- Platform super-admin onboarding of new suppliers

### Phase 6 — PWA & Mobile-Ready

- PWA manifest + service worker
- Install on home screen
- Later wrap with Capacitor/TWA for Android/iOS app store builds
- Offline draft support (optional)

---

## 11. What changes from the previous deliverable

The previous codebase already had:

- Multi-tenant schema with `companyId`
- Pricing engine
- Order wizard
- Notification system
- Middleware for subdomains

Now we refine/extend it to:

1. Add **CustomerOrg** so the “small customer” is a company with multiple users.
2. Support **raw material ordering** (profile per meter, glass per pane) in addition to finished products.
3. Add **per-item statuses** and **partial acceptance**.
4. Add **quote amendment / price negotiation flow**.
5. Add **order message thread + attachments**.
6. Add **customer-specific price lists and overrides**.
7. Add **processing options** (edges, holes, custom cuts).
8. Add **per-item order snapshots** so price changes never corrupt history.

---

## 12. Readiness Assessment

After this analysis:

- ✅ All business roles are defined.
- ✅ All product types and pricing formulas are defined.
- ✅ The ordering flow is fully specified.
- ✅ The supplier workflow is fully specified.
- ✅ The communication/notification needs are covered.
- ✅ Edge cases and risks have resolved solutions.
- ✅ The technical architecture and data model are finalized.
- ✅ We have a clear phased implementation plan.

> **Conclusion: We are ready to start coding.**

On your next message, say **“start coding Phase 0”** and I will provide the complete, runnable project files (schema, config, auth, middleware, seed, and all core pages/components) inside a single downloadable artifact document.
