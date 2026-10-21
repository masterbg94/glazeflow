# GlazeFlow AI Instruction Dependency Graph

## Entry Points & Loading Order (Chronological)

```mermaid
flowchart TD
    %% Entry Points
    A[🟢 ENTRY: AGENTS.md] -->|mandatory, always 1st| B[🟢 .agents/instructions/app-instructions.md]
    C[CLAUDE.md] -.->|@AGENTS.md pointer| A
    
    %% Scoped Instructions (conditional)
    B --> D{Touching which dir?}
    D -->|src/app/**| E[src/app/instructions.md]
    D -->|src/lib/**| F[src/lib/instructions.md]
    D -->|prisma/**| G[prisma/instructions.md]
    D -->|docs/**| H[docs/instructions.md]
    
    %% Knowledge Base (on demand)
    B --> I{Task needs what?}
    I -->|roles/tenancy| KB1[knowledge-base/roles-and-tenancy.md]
    I -->|order lifecycle| KB2[knowledge-base/order-lifecycle.md]
    I -->|pricing| KB3[knowledge-base/pricing-rules.md]
    I -->|API map| KB4[knowledge-base/api-map.md]
    I -->|data model| KB5[knowledge-base/data-model.md]
    I -->|auth gaps| KB6[knowledge-base/auth-gaps.md]
    I -->|roles explanation| KB7[knowledge-base/roles-explanation.md]
    I -->|index/loading| KB0[knowledge-base/README.md]
    
    %% Docs (product intent/history, optional)
    B --> J{Need product context?}
    J -->|seed creds| DC1[docs/roles.md §6]
    J -->|postgres migration| DC2[docs/postgres-migration.md]
    J -->|business logic fix| DC3[docs/BUSINESS_LOGIC_FIX.md]
    J -->|product vision| DC4[docs/Business Logic.md]
    J -->|gap analysis| DC5[docs/business-logic-review.md]
    J -->|improvement plan| DC6[docs/improvements.md]
    J -->|how app works| DC7[docs/how-app-works-with-roles.md]
    J -->|loading order SR| DC8[docs/agents-when-load.md]
    J -->|file index| DC9[docs/files-here.md]
    J -->|ai structure| DC10[docs/ai-structure-plan.md]
    
    %% Skills (on demand by task description match)
    B --> K{Task matches skill?}
    K -->|tenant isolation/pricing| SK1[.agents/skills/glazeflow-tenant-guard]
    K -->|roles/permissions/status| SK2[.agents/skills/glazeflow-role-check]
    K -->|pricing engine/changes| SK3[.agents/skills/glazeflow-pricing-change]
    K -->|schema/seed changes| SK4[.agents/skills/glazeflow-schema-change]
    K -->|orders/notifications| SK5[.agents/skills/glazeflow-order-flow]
    K -->|onboarding/explanation| SK6[.agents/skills/glazeflow-onboard]
    
    %% Symlinks (no content duplication)
    SK1 -.->|symlink| SK1C[.claude/skills/glazeflow-tenant-guard]
    SK2 -.->|symlink| SK2C[.claude/skills/glazeflow-role-check]
    SK3 -.->|symlink| SK3C[.claude/skills/glazeflow-pricing-change]
    SK4 -.->|symlink| SK4C[.claude/skills/glazeflow-schema-change]
    SK5 -.->|symlink| SK5C[.claude/skills/glazeflow-order-flow]
    SK6 -.->|symlink| SK6C[.claude/skills/glazeflow-onboard]
    
    %% Caveman skills (communication style, loaded separately)
    K -->|caveman mode| CV[.agents/skills/caveman/*]
    
    %% Cross-references (duplications to fix)
    KB0 -.->|ref .claude/skills/| SK1C
    KB0 -.->|ref .claude/skills/| SK2C
    KB0 -.->|ref .claude/skills/| SK3C
    KB0 -.->|ref .claude/skills/| SK4C
    KB0 -.->|ref .claude/skills/| SK5C
    KB0 -.->|ref .claude/skills/| SK6C
    
    %% Docs internal refs
    DC8 -.->|duplicates loading order| A
    DC8 -.->|duplicates loading order| B
    DC8 -.->|duplicates loading order| KB0
    DC9 -.->|duplicates loading order| A
    DC9 -.->|duplicates loading order| B
    DC9 -.->|duplicates loading order| KB0
    DC10 -.->|duplicates KB content| KB1
    DC10 -.->|duplicates KB content| KB2
    DC10 -.->|duplicates KB content| KB3
    DC10 -.->|duplicates KB content| KB6
    DC10 -.->|duplicates KB content| KB4
    DC10 -.->|duplicates KB content| KB5
    
    %% Stale/Archive
    DC3 -.->|archive, stale data| DC4
    DC4 -.->|archive, stale data| DC3
    DC10 -.->|marked istorijski| DC10
    
    %% Root junk (not AI instructions)
    ROOT[🔴 Root junk: fix.md, fix.sh, fix-proxy.sh, fix-storefront.sh, dev.db, cookies.txt] -.->|ignored by AI| A
    
    style A fill:#e8f5e9,stroke:#2e7d32,stroke-width:3px
    style B fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    style E fill:#fff3e0,stroke:#ef6c00
    style F fill:#fff3e0,stroke:#ef6c00
    style G fill:#fff3e0,stroke:#ef6c00
    style H fill:#fff3e0,stroke:#ef6c00
    style KB0 fill:#e3f2fd,stroke:#1565c0
    style KB1 fill:#e3f2fd,stroke:#1565c0
    style KB2 fill:#e3f2fd,stroke:#1565c0
    style KB3 fill:#e3f2fd,stroke:#1565c0
    style KB4 fill:#e3f2fd,stroke:#1565c0
    style KB5 fill:#e3f2fd,stroke:#1565c0
    style KB6 fill:#e3f2fd,stroke:#1565c0
    style KB7 fill:#e3f2fd,stroke:#1565c0
    style SK1 fill:#fce4ec,stroke:#c2185b
    style SK2 fill:#fce4ec,stroke:#c2185b
    style SK3 fill:#fce4ec,stroke:#c2185b
    style SK4 fill:#fce4ec,stroke:#c2185b
    style SK5 fill:#fce4ec,stroke:#c2185b
    style SK6 fill:#fce4ec,stroke:#c2185b
    style DC3 fill:#f5f5f5,stroke:#9e9e9e,stroke-dasharray: 5 5
    style DC4 fill:#f5f5f5,stroke:#9e9e9e,stroke-dasharray: 5 5
    style DC10 fill:#f5f5f5,stroke:#9e9e9e,stroke-dasharray: 5 5
    style ROOT fill:#ffebee,stroke:#c62828,stroke-dasharray: 5 5
```

---

## Chronological Loading Explanation

### Phase 0: Pre-Load (Before Any Task)
| Step | File | Purpose |
|------|------|---------|
| 0 | `CLAUDE.md` | 1-line pointer: `@AGENTS.md` — Claude Code reads this first |
| 0 | `.mcp.json` | MCP servers config (Supabase, next-devtools) — not instructions |

### Phase 1: Mandatory Load (Every Task)
| Step | File | Lines | Why |
|------|------|-------|-----|
| 1 | `AGENTS.md` | 264 | Repo rules, commands, known issues (companyId null, Decimal, cross-origin, slow SSE), arch notes, auth patterns, Decimal rule, security gaps summary, env, DB, MCP |
| 2 | `.agents/instructions/app-instructions.md` | 113 | GlazeFlow mission, 3 invariants, 10 non-negotiable rules, verification, known risks, skill list |

### Phase 2: Scoped Instructions (Conditional — Only If Editing That Dir)
| Dir Touched | File | Lines | Content |
|-------------|------|-------|---------|
| `src/app/**` | `src/app/instructions.md` | 40 | Route map, server/client boundary, auth expectations, API conventions |
| `src/lib/**` | `src/lib/instructions.md` | 38 | Module responsibilities, pricing contract, auth/tenant safety, real-time safety |
| `prisma/**` | `prisma/instructions.md` | 31 | Data model, migration rules, seed credentials |
| `docs/**` | `docs/instructions.md` | 63 | KB index, product docs list, how to work in docs/, product flow |

> **Rule**: If change spans multiple dirs, load ALL matching scoped files. Scoped rules SUPPLEMENT root rules, never replace.

### Phase 3: Knowledge Base (On Demand — Load Only What Task Needs)
| Question | Read File | Lines |
|----------|-----------|-------|
| Roles, permissions, tenancy | `knowledge-base/roles-and-tenancy.md` | 160 |
| Order statuses, transitions, approval | `knowledge-base/order-lifecycle.md` | 187 |
| Pricing formulas, per-tenant prices | `knowledge-base/pricing-rules.md` | 174 |
| Every API route, auth, conventions | `knowledge-base/api-map.md` | 110 |
| Models, enums, invariants, migration | `knowledge-base/data-model.md` | 163 |
| Verified security holes (file:line) | `knowledge-base/auth-gaps.md` | 302 |
| Why 3 role dimensions | `knowledge-base/roles-explanation.md` | 111 |
| Index + loading order | `knowledge-base/README.md` | 54 |

> **Critical**: Do NOT preload all KB. Load index (README.md) first, then only the file matching the question.

### Phase 4: Product Docs (Optional — Intent/History Only)
| File | Purpose | Language | Load When |
|------|---------|----------|-----------|
| `docs/roles.md` | Complete role matrix, seed creds §6, gaps | Serbian | Seed creds, role lookup |
| `docs/postgres-migration.md` | SQLite→Postgres move details | English | DB provider/Decimal/deployment changes |
| `docs/BUSINESS_LOGIC_FIX.md` | One-main-company migration record | English | Schema/seed changes |
| `docs/Business Logic.md` | Original product vision (archive) | English | Historical context only |
| `docs/business-logic-review.md` | Current gap analysis + 8-phase fix plan | English | New feature planning |
| `docs/improvements.md` | Technical risks + 4-phase plan | English | Technical debt prioritization |
| `docs/how-app-works-with-roles.md` | End-to-end walkthrough | Serbian | Product understanding |
| `docs/agents-when-load.md` | Loading order (Serbian dup) | Serbian | Redundant — skip |
| `docs/files-here.md` | Repo file index | Serbian | Orientation only |
| `docs/ai-structure-plan.md` | Historical restructuring doc | English | Redundant — skip |

### Phase 5: Skills (Loaded by Agent Runtime on Task Description Match)
| Skill | Trigger (Task Description Contains) | File | Lines |
|-------|--------------------------------------|------|-------|
| `glazeflow-tenant-guard` | Catalog visibility, tenant pricing, order creation, cross-tenant access | `.agents/skills/glazeflow-tenant-guard/SKILL.md` | 145 |
| `glazeflow-role-check` | Roles, permissions, status transitions, admin surfaces | `.agents/skills/glazeflow-role-check/SKILL.md` | 166 |
| `glazeflow-pricing-change` | Prices, price lists, overrides, pricing engine | `.agents/skills/glazeflow-pricing-change/SKILL.md` | 136 |
| `glazeflow-schema-change` | `prisma/schema.prisma` or seed changes | `.agents/skills/glazeflow-schema-change/SKILL.md` | 166 |
| `glazeflow-order-flow` | Orders, statuses, notifications, real-time | `.agents/skills/glazeflow-order-flow/SKILL.md` | 209 |
| `glazeflow-onboard` | "How does this app work", "explain roles", "where is X" | `.agents/skills/glazeflow-onboard/SKILL.md` | 145 |

> Skills live in `.agents/skills/` (source). `.claude/skills/` are **symlinks** only.

---

## Dependency Edges (What Calls/References What)

### Hard Dependencies (Must Load Before)
```
AGENTS.md → app-instructions.md → scoped instructions.md → KB file → source code
```

### Soft References (Cross-Links)
| From | To | Type |
|------|-----|------|
| AGENTS.md | app-instructions.md | Mandatory sequence |
| AGENTS.md | KB files (by name) | Pointer |
| AGENTS.md | docs/roles.md §6 | Seed creds pointer |
| AGENTS.md | docs/postgres-migration.md | Migration pointer |
| AGENTS.md | docs/BUSINESS_LOGIC_FIX.md | Business model pointer |
| app-instructions.md | KB files | Pointer |
| app-instructions.md | docs/ | Pointer |
| KB README | KB files | Index |
| KB README | .claude/skills/ | **Stale** — should be `.agents/skills/` |
| docs/instructions.md | KB files | Index |
| docs/instructions.md | docs/ product docs | Index |
| Skills | KB files | Reference (not load order) |

### Known Duplication Edges (To Fix)
```
AGENTS.md:13-44  ───╮
app-instructions.md:26-47  ──╫──► Same loading order list (6 copies total)
KB/README.md:7-17         ──╫
docs/agents-when-load.md:1-41 ─╫
docs/ai-structure-plan.md:235-253 ─╯

auth-gaps.md:24-265 ──────────╮
business-logic-review.md:498-511 ──╫──► Same 10 security gaps (5 copies)
improvements.md:49-60 ──────────╫
AGENTS.md:147-159 ──────────────╫
roles.md:177-190 ───────────────╯
```

---

## Visual: File Size vs Importance

```mermaid
bar
    title AI Instruction Files: Lines of Content
    x-axis "File" 
    y-axis "Lines"
    "AGENTS.md" 264
    "app-instructions.md" 113
    "auth-gaps.md" 302
    "pricing-rules.md" 174
    "order-lifecycle.md" 187
    "roles-and-tenancy.md" 160
    "data-model.md" 163
    "api-map.md" 110
    "roles-explanation.md" 111
    "KB README.md" 54
    "src/app/instructions.md" 40
    "src/lib/instructions.md" 38
    "prisma/instructions.md" 31
    "docs/instructions.md" 63
    "glazeflow-tenant-guard" 145
    "glazeflow-role-check" 166
    "glazeflow-pricing-change" 136
    "glazeflow-schema-change" 166
    "glazeflow-order-flow" 209
    "glazeflow-onboard" 145
    "docs/business-logic-review.md" 1047
    "docs/Business Logic.md" 548
    "docs/BUSINESS_LOGIC_FIX.md" 240
    "docs/improvements.md" 137
    "docs/roles.md" 190
    "docs/how-app-works" 100
    "docs/agents-when-load" 107
    "docs/files-here.md" 92
    "docs/ai-structure-plan.md" 333
```

---

## Start Here Checklist (For New Task)

```
☐ 1. Read AGENTS.md (264 lines) — always
☐ 2. Read .agents/instructions/app-instructions.md (113 lines) — always
☐ 3. Identify which dirs you'll touch → read matching scoped instructions.md
☐ 4. Check knowledge-base/README.md → read ONLY the KB file matching your question
☐ 5. If task matches a skill description → load that skill
☐ 6. Read relevant source files (src/, prisma/)
☐ 7. Verify: npm run format:check && npm run build
```

---

## Files to Ignore / Remove

| File | Reason |
|------|--------|
| `fix.md` | 100% duplicate of `fix.sh` (694/694 lines) |
| `fix.sh` | One-shot scaffold, already applied |
| `fix-proxy.sh` | Creates `src/proxy.ts` (not used; middleware.ts works) |
| `fix-storefront.sh` | Creates dirs that exist |
| `dev.db` (root) | 0 bytes, wrong file — real is `prisma/dev.db` |
| `cookies.txt` | Empty curl cookie jar |
| `docs/agents-when-load.md` | Duplicate loading order (Serbian) |
| `docs/files-here.md` | Duplicate index (mixed EN/SR) |
| `docs/ai-structure-plan.md` | Historical, 45% KB dup, stale facts |
| `docs/Business Logic.md` | Archive — stale vision |
| `docs/BUSINESS_LOGIC_FIX.md` | Archive — stale migration record |

---

## Language Split Decision Needed

| Layer | Current | Recommended |
|-------|---------|-------------|
| AGENTS.md, app-instructions, scoped, KB | English ✓ | Keep English |
| Skills (6 glazeflow) | English ✓ | Keep English |
| `docs/instructions.md`, `improvements.md`, `postgres-migration.md`, `business-logic-review.md` | English ✓ | Keep English |
| `docs/roles.md`, `how-app-works-with-roles.md`, `agents-when-load.md`, `files-here.md` | Serbian | **Translate to EN** (or move to `docs/sr/`) |

> `docs/` declared as "SR" in `files-here.md:19` but 6/11 files are English. Pick one convention.