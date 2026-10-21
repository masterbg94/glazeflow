ROLES

- SUPER_ADMIN — platformRole: SUPER_ADMIN, companyId: null. Puna dostupnost, sve kompanije. Seed: superadmin@glazeflow.app / Password123!
- COMPANY_ADMIN — platformRole: COMPANY_ADMIN, companyRole: COMPANY_ADMIN. Puna kompanija dostupnost, katalog, tenanti. Login: admin@acme.test / Password123!
- COMPANY_STAFF — platformRole: COMPANY_STAFF, companyRole: COMPANY_PRODUCTION / COMPANY_SALES. Porudžbina, status promeni samo. Katalog read-only (API 403 za POST).
- CUSTOMER (tenant user) — platformRole: CUSTOMER, customerOrgRole: TENANT_ADMIN / TENANT_MANAGER. Kreira porudžbine, vidi svoje. Uvek ima companyId → glavna kompanija.

COMPANY STRUCTURE

Jedna glavna Company (isMainCompany: true). Tenant organizacije su CustomerOrg rows sa slug (subdomain), linked via companyId. Nikada drugi Company row.

ORDER FLOW (one order, start→end)

1. Tenant user otvori storefront preko subdomena (npr. bob.localhost:3000 → rewrite na /bob/...)
2. User klikne Order Wizard → /api/orders POST → kreira Order sa companyId iz sessiona, customerOrgId iz tenant, items iz kataloga
3. Order kreirana → Prisma piše: companyId, customerOrgId, subtotal, taxAmount, discountAmount, total (svi Decimal → serialized kao .toString() server→client boundary)
4. Order pojavljuje se u /dashboard/orders (COMPANY_ADMIN/STAFF) i /my-orders (tenant user)
5. Status update — COMPANY_PRODUCTION przelazi item kroz production steps
6. Finance view (TENANT_ADMIN only) → /finance → shows unpaid orders u DELIVERED/CLOSED status

WHERE USERS LOG IN & WHAT THEY DO

| User           | Login URL                    | Role                      | Where They Go                                      |
| -------------- | ---------------------------- | ------------------------- | -------------------------------------------------- |
| SUPER_ADMIN    | /login → dashboard           | SUPER_ADMIN               | /admin (platform) — full stats                     |
| COMPANY_ADMIN  | /login → (company) dashboard | COMPANY_ADMIN             | (company)/dashboard — katalog, tenanti, porudžbine |
| COMPANY_STAFF  | /login → (company) dashboard | COMPANY_STAFF             | (company)/dashboard/orders — status forward only   |
| TENANT_ADMIN   | /login → storefront X.root   | CUSTOMER + TENANT_ADMIN   | storefront /finance, /my-orders                    |
| TENANT_MANAGER | /login → storefront X.root   | CUSTOMER + TENANT_MANAGER | storefront /my-orders, order wizard                |

Tenant subdomains block /dashboard and /admin — redirect na /login. MAIN company dashboard/admin samo na glavnom hostu, ne na X.root.

DECIMAL SERIALIZATION — Svaki Prisma Decimal field crossing server→client boundary koristi .toString() (npr. order.total.toString(), item.unitPrice.toString()) po src/app/(company)/dashboard/orders/[id]/page.tsx:105-106.
