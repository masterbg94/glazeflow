Based on my analysis, here are the **major weak points** and a structured improvement plan:

---

## 🔴 Critical Architecture Weak Points

| Area | Problem | Impact |
|------|---------|--------|
| **Real-time System** | Logic scattered across 5+ files (`lib/realtime.ts`, `lib/notifications.ts`, `NotificationProvider.tsx`, `RealtimeOrderRefresher.tsx`, `OrderKanban.tsx`) | Hard to debug, race conditions, inconsistent event handling |
| **Auth** | Middleware uses deprecated `getToken` + dual auth (middleware + RSC) | Race conditions, type-unsafe, Next.js 15 compat risk |
| **Type Safety** | `session.user as any` everywhere, no shared types | Runtime errors, no autocomplete, refactoring risk |
| **API Validation** | Zero input validation on any route | Security, data corruption, bad UX |
| **Error Handling** | Inconsistent patterns, no global error boundary | Silent failures, poor debugging |

---

## 📋 Structured Improvement Plan

### Phase 1: Foundation (Week 1-2) — **Do First**
```
1. Migrate auth from getToken → getSession in middleware (Next.js 15 compat)
2. Create shared types package: @glazeflow/types (session, events, api contracts)
3. Add Zod schemas for all API inputs + centralized validation middleware
4. Wrap order creation in DB transaction
5. Fix order number generation (use UUID or sequence instead of random)
```

### Phase 2: Real-time Consolidation (Week 2-3)
```
1. Single source of truth: lib/events.ts with typed event definitions
2. Move all publishToUsers calls from API routes → server actions / service layer
3. NotificationProvider: split into
   - NotificationContext (notifications only)
   - RealtimeContext (SSE connection + event distribution)
4. Replace router.refresh() with granular cache invalidation (React Query / SWR)
5. Add connection health monitoring + auto-reconnect with backoff
```

### Phase 3: API Layer Hardening (Week 3-4)
```
1. Create API route wrapper: withAuth, withRole, withCompanyScope
2. Standardize error responses: { error: string, code: string, status: number }
3. Add rate limiting (per-user + per-IP) on mutation endpoints
4. Extract order service: OrderService.create(), OrderService.updateStatus()
6. Add audit logging for status changes + messages
```

### Phase 4: Client Architecture (Week 4-5)
```
1. Split OrderWizard into: WizardSteps, PricingPanel, CartSidebar (each <200 lines)
2. Add React Hook Form + Zod for form validation
3. Replace manual state with TanStack Query for server state
4. Implement optimistic updates for status changes + messages
5. Add proper loading/error/empty states everywhere
```

### Phase 5: Quality & Observability (Week 5-6)
```
1. Configure Vitest + Playwright (unit + e2e)
2. Add OpenTelemetry tracing for API routes
3. Structured logging (pino) with correlation IDs
4. CI pipeline: lint → typecheck → test → build
5. Add health check endpoint for monitoring
```

---

## 🎯 Quick Wins (Can Do Immediately)

| Fix | Effort | Value |
|-----|--------|-------|
| Add `@ts-expect-error` comments where `as any` is unavoidable | 30 min | Type safety visibility |
| Create `serializeOrder()` + `serializeOrderItem()` utilities | 1 hr | Eliminate scattered `.toString()` |
| Fix glass pane price calc (line 142 in orders/route.ts) | 30 min | Correct pricing |
| Add unique constraint on `Order.orderNumber` | 15 min | Prevent duplicates |

---

## ⚠️ Tradeoff Questions

1. **Real-time granularity**: Keep `router.refresh()` (simple) vs React Query invalidation (granular, more code)?
2. **Auth migration**: Rewrite middleware now (breaks dev temporarily) vs add `getSession` in RSC and deprecate middleware auth?
3. **State management**: TanStack Query (recommended) vs keep manual fetch + useState?
4. **Testing**: Start with e2e (Playwright) for critical paths or unit tests for pricing engine?

---

**Want me to elaborate on any phase, or shall I start implementing Phase 1?**