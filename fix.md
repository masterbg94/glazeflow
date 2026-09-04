# 🔧 Fix Script — Kreiraj nedostajuće komponente

Sačuvaj ovo kao **`fix.sh`** u korenu projekta (pored `package.json`), pa pokreni:

```bash
bash fix.sh
```

Skript će kreirati **sve nedostajuće fajlove** koji su potrebni aplikaciji (NotificationProvider, NotificationBell, i sve ostale komponente koje se importuju). Nakon toga restartuj dev server:

```bash
npm run dev
```

---

## Ceo sadržaj `fix.sh`:

```bash
#!/usr/bin/env bash
set -e

echo "=== GlazeFlow Fix — Creating Missing Components ==="
mkdir -p src/components/notifications src/components/dashboard src/components/order-wizard

# ---------- NotificationProvider ----------
cat > src/components/notifications/NotificationProvider.tsx << 'EOF'
"use client";
import { createContext, useContext, useEffect, useState } from "react";

interface Notification { id: string; title: string; body: string; isRead: boolean; createdAt: string; }
const Ctx = createContext<{ notifications: Notification[]; unread: number }>({ notifications: [], unread: 0 });

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "connected") return;
        setNotifications((prev) => [data, ...prev]);
      } catch {}
    };
    return () => es.close();
  }, []);

  const unread = notifications.filter((n) => !n.isRead).length;
  return <Ctx.Provider value={{ notifications, unread }}>{children}</Ctx.Provider>;
}

export function useNotifications() { return useContext(Ctx); }
EOF
echo "✅ NotificationProvider.tsx created"

# ---------- NotificationBell ----------
cat > src/components/notifications/NotificationBell.tsx << 'EOF'
"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "./NotificationProvider";

export function NotificationBell() {
  const { notifications, unread } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 hover:bg-slate-100"
      >
        <Bell size={20} className="text-slate-700" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {notifications.length === 0 && (
            <p className="p-4 text-sm text-slate-400">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <div key={n.id} className="border-b border-slate-100 p-3 hover:bg-slate-50">
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-slate-500">{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
EOF
echo "✅ NotificationBell.tsx created"

# ---------- Sidebar ----------
cat > src/components/dashboard/Sidebar.tsx << 'EOF'
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Package, ClipboardList, LogOut } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/catalog", label: "Catalog & Pricing", icon: Package },
    { href: "/dashboard/orders", label: "Orders", icon: ClipboardList },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <span className="text-lg font-bold text-blue-600">GlazeFlow</span>
      </div>
      <nav className="space-y-1 p-4">
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <l.icon size={16} /> {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-4">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </aside>
  );
}
EOF
echo "✅ Sidebar.tsx created"

# ---------- StatCard ----------
cat > src/components/dashboard/StatCard.tsx << 'EOF'
export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
EOF
echo "✅ StatCard.tsx created"

# ---------- OrderKanban ----------
cat > src/components/dashboard/OrderKanban.tsx << 'EOF'
"use client";
import { useState } from "react";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  currency: string;
  customerOrg: { name: string };
  items: any[];
}

const COLUMNS = ["NEW", "QUOTE_AMENDMENT", "CONFIRMED", "IN_PRODUCTION", "READY", "DELIVERED", "CLOSED", "CANCELLED"];

export function OrderKanban({ orders }: { orders: Order[] }) {
  const [updating, setUpdating] = useState<string | null>(null);

  async function updateStatus(orderId: string, status: string) {
    setUpdating(orderId);
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) window.location.reload();
    setUpdating(null);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-4">
        {COLUMNS.map((col) => {
          const filtered = orders.filter((o) => o.status === col);
          return (
            <div key={col} className="w-72 rounded-xl bg-slate-100 p-3">
              <h3 className="mb-3 px-1 text-sm font-semibold text-slate-700">
                {col.replace(/_/g, " ")} ({filtered.length})
              </h3>
              <div className="space-y-3">
                {filtered.map((o) => (
                  <div key={o.id} className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="font-medium text-slate-900">{o.orderNumber}</p>
                    <p className="text-xs text-slate-500">{o.customerOrg.name}</p>
                    <p className="mt-1 text-sm font-semibold">{o.total} {o.currency}</p>
                    <select
                      className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      value={col}
                      onChange={(e) => updateStatus(o.id, e.target.value)}
                      disabled={updating === o.id}
                    >
                      {COLUMNS.map((c) => (
                        <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                    Empty
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
EOF
echo "✅ OrderKanban.tsx created"

# ---------- OrderMessages ----------
cat > src/components/dashboard/OrderMessages.tsx << 'EOF'
"use client";
import { useEffect, useState } from "react";

export function OrderMessages({ orderId }: { orderId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");

  async function load() {
    const res = await fetch(`/api/orders/${orderId}/messages`);
    const data = await res.json();
    setMessages(data.messages || []);
  }

  useEffect(() => {
    load();
  }, [orderId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await fetch(`/api/orders/${orderId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setText("");
    load();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 font-semibold">Messages</h2>
      <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">{m.author.name}</p>
            <p className="text-sm text-slate-800">{m.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input"
          placeholder="Write a message..."
        />
        <button className="btn bg-blue-600 text-white">Send</button>
      </form>
    </div>
  );
}
EOF
echo "✅ OrderMessages.tsx created"

# ---------- PriceSummary ----------
cat > src/components/order-wizard/PriceSummary.tsx << 'EOF'
"use client";
import { formatCurrency } from "@/lib/utils";

interface Props {
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  currency: string;
  areaSqm?: number;
  profileCost: number;
  glassCost: number;
  hardwareCost: number;
  processingCost: number;
}

export function PriceSummary(p: Props) {
  return (
    <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Live Price</h3>
      {p.areaSqm !== undefined && (
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <Row label="Glazing area" value={`${p.areaSqm.toFixed(2)} m²`} />
        </div>
      )}
      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <Row label="Profile cost" value={formatCurrency(p.profileCost, p.currency)} />
        <Row label="Glass cost" value={formatCurrency(p.glassCost, p.currency)} />
        <Row label="Hardware cost" value={formatCurrency(p.hardwareCost, p.currency)} />
        <Row label="Processing" value={formatCurrency(p.processingCost, p.currency)} />
      </div>
      <div className="my-4 border-t border-slate-200" />
      <Row label="Unit price" value={formatCurrency(p.unitPrice, p.currency)} bold />
      <Row label={`× ${p.quantity}`} value={formatCurrency(p.lineTotal, p.currency)} bold />
      <div className="mt-6 text-2xl font-bold text-blue-700">
        {formatCurrency(p.lineTotal, p.currency)}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Final total including discounts & tax is shown at checkout.
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-slate-900" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
EOF
echo "✅ PriceSummary.tsx created"

# ---------- OrderWizard ----------
cat > src/components/order-wizard/OrderWizard.tsx << 'EOF'
"use client";
import { useMemo, useState } from "react";
import { calcItemPricing } from "@/lib/pricing-engine";
import { PriceSummary } from "./PriceSummary";

type Kind = "GLASS_ONLY" | "RAW_PROFILE" | "FINISHED_WINDOW" | "FINISHED_DOOR" | "HARDWARE";

interface CatalogItem {
  id: string;
  name?: string;
  brand?: string;
  systemName?: string;
  chamberCount?: number;
  installDepthMm?: number;
  colorOptions?: any;
  sellPricePerSqm?: number;
  sellPricePerMeter?: number;
  sellPrice?: number;
  availableThicknessMm?: any;
  baseThicknessMm?: number;
  thicknessSurchargePercentPerMm?: number;
  [key: string]: any;
}

export function OrderWizard({
  companyId,
  currency,
  glassTypes,
  profiles,
  hardwareItems,
  templates,
  processingOptions,
}: {
  companyId: string;
  currency: string;
  glassTypes: CatalogItem[];
  profiles: CatalogItem[];
  hardwareItems: CatalogItem[];
  templates: CatalogItem[];
  processingOptions: CatalogItem[];
}) {
  const [kind, setKind] = useState<Kind>("FINISHED_WINDOW");
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(1200);
  const [lengthM, setLengthM] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [templateId, setTemplateId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [profileColor, setProfileColor] = useState("White");
  const [glassTypeId, setGlassTypeId] = useState("");
  const [layers, setLayers] = useState<"SINGLE" | "DOUBLE" | "TRIPLE">("DOUBLE");
  const [pane1, setPane1] = useState(4);
  const [pane2, setPane2] = useState(4);
  const [pane3, setPane3] = useState(4);
  const [hardwareSel, setHardwareSel] = useState<Record<string, number>>({});
  const [processingSel, setProcessingSel] = useState<string[]>([]);
  const [cart, setCart] = useState<any[]>([]);

  const selectedProfile = profiles.find((p) => p.id === profileId);
  const selectedGlass = glassTypes.find((g) => g.id === glassTypeId);
  const selectedTemplate = templates.find((t) => t.id === templateId);

  const pricing = useMemo(() => {
    const glassPanes = ["GLASS_ONLY", "FINISHED_WINDOW", "FINISHED_DOOR"].includes(kind)
      ? [
          {
            glassTypeId,
            sellPricePerSqm: Number(selectedGlass?.sellPricePerSqm ?? 0),
            baseThicknessMm: Number(selectedGlass?.baseThicknessMm ?? 4),
            thicknessMm: pane1,
            thicknessSurchargePercentPerMm: Number(selectedGlass?.thicknessSurchargePercentPerMm ?? 5),
          },
          ...(layers !== "SINGLE"
            ? [
                {
                  glassTypeId,
                  sellPricePerSqm: Number(selectedGlass?.sellPricePerSqm ?? 0),
                  baseThicknessMm: Number(selectedGlass?.baseThicknessMm ?? 4),
                  thicknessMm: pane2,
                  thicknessSurchargePercentPerMm: Number(selectedGlass?.thicknessSurchargePercentPerMm ?? 5),
                },
              ]
            : []),
          ...(layers === "TRIPLE"
            ? [
                {
                  glassTypeId,
                  sellPricePerSqm: Number(selectedGlass?.sellPricePerSqm ?? 0),
                  baseThicknessMm: Number(selectedGlass?.baseThicknessMm ?? 4),
                  thicknessMm: pane3,
                  thicknessSurchargePercentPerMm: Number(selectedGlass?.thicknessSurchargePercentPerMm ?? 5),
                },
              ]
            : []),
        ]
      : [];

    const hardware = Object.entries(hardwareSel)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => {
        const item = hardwareItems.find((h) => h.id === id);
        return { sellPrice: Number(item?.sellPrice ?? 0), quantity: q };
      });

    const processing = processingSel.map((pid) =>
      Number(processingOptions.find((o) => o.id === pid)?.sellPrice ?? 0)
    );

    return calcItemPricing({
      kind,
      widthMm: width,
      heightMm: height,
      lengthM,
      quantity,
      profileSellPricePerMeter:
        kind !== "GLASS_ONLY" && kind !== "HARDWARE" && selectedProfile
          ? Number(selectedProfile.sellPricePerMeter)
          : undefined,
      complexityMultiplier: selectedTemplate ? Number(selectedTemplate.complexityMultiplier) : 1,
      glassPanes,
      hardware,
      processing,
    });
  }, [
    kind,
    width,
    height,
    lengthM,
    quantity,
    selectedProfile,
    selectedGlass,
    selectedTemplate,
    layers,
    pane1,
    pane2,
    pane3,
    hardwareSel,
    processingSel,
    glassTypeId,
  ]);

  async function addToCart() {
    const doc = {
      kind,
      widthMm: ["GLASS_ONLY", "FINISHED_WINDOW", "FINISHED_DOOR"].includes(kind) ? width : null,
      heightMm: ["GLASS_ONLY", "FINISHED_WINDOW", "FINISHED_DOOR"].includes(kind) ? height : null,
      lengthM: kind === "RAW_PROFILE" ? lengthM : null,
      quantity,
      templateId: templateId || null,
      profileId: kind !== "GLASS_ONLY" && kind !== "HARDWARE" ? profileId : null,
      profileColor,
      glassTypeId: ["GLASS_ONLY", "FINISHED_WINDOW", "FINISHED_DOOR"].includes(kind)
        ? glassTypeId
        : null,
      layers,
      paneThicknesses: [pane1, pane2, pane3],
      hardwareSel,
      processingSel,
      pricing,
    };
    setCart((prev) => [...prev, doc]);
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Step 1: Product kind */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold">1. What do you need?</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["FINISHED_WINDOW", "FINISHED_DOOR", "GLASS_ONLY", "RAW_PROFILE"] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg border p-3 text-xs font-medium ${
                  kind === k ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"
                }`}
              >
                {k.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </section>

        {/* Step 2: Dimensions */}
        {["GLASS_ONLY", "FINISHED_WINDOW", "FINISHED_DOOR"].includes(kind) && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 font-semibold">2. Dimensions (mm)</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Width (mm)">
                <input type="number" value={width} onChange={(e) => setWidth(+e.target.value)} className="input" />
              </Field>
              <Field label="Height (mm)">
                <input type="number" value={height} onChange={(e) => setHeight(+e.target.value)} className="input" />
              </Field>
              <Field label="Quantity">
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(+e.target.value)} className="input" />
              </Field>
            </div>
          </section>
        )}

        {kind === "RAW_PROFILE" && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 font-semibold">2. Profile length (m)</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Length (m)">
                <input type="number" min={0.1} step={0.1} value={lengthM} onChange={(e) => setLengthM(+e.target.value)} className="input" />
              </Field>
              <Field label="Quantity">
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(+e.target.value)} className="input" />
              </Field>
            </div>
          </section>
        )}

        {/* Step 3: Template */}
        {["FINISHED_WINDOW", "FINISHED_DOOR"].includes(kind) && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 font-semibold">3. Product Template</h3>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input">
              <option value="">Select...</option>
              {templates.filter((t) => t.kind === kind).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </section>
        )}

        {/* Step 4: Profile */}
        {kind !== "GLASS_ONLY" && kind !== "HARDWARE" && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 font-semibold">4. PVC Profile</h3>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="input mb-3">
              <option value="">Select profile system...</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.systemName} — {p.chamberCount}ch {p.installDepthMm}mm
                </option>
              ))}
            </select>
            {selectedProfile && (
              <select value={profileColor} onChange={(e) => setProfileColor(e.target.value)} className="input">
                {((selectedProfile.colorOptions as any) || []).map((c: string) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </section>
        )}

        {/* Step 5: Glass */}
        {["GLASS_ONLY", "FINISHED_WINDOW", "FINISHED_DOOR"].includes(kind) && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 font-semibold">5. Glass</h3>
            <select value={glassTypeId} onChange={(e) => setGlassTypeId(e.target.value)} className="input mb-3">
              <option value="">Select glass type...</option>
              {glassTypes.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.category})</option>
              ))}
            </select>
            {selectedGlass && (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {(["SINGLE", "DOUBLE", "TRIPLE"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLayers(l)}
                      className={`rounded-lg border p-2 text-xs ${
                        layers === l ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {layers !== "SINGLE" && (
                    <Field label="Pane 1 (mm)">
                      <select value={pane1} onChange={(e) => setPane1(+e.target.value)} className="input">
                        {(selectedGlass.availableThicknessMm as any)?.map((t: number) => (
                          <option key={t} value={t}>{t}mm</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {layers === "DOUBLE" && (
                    <Field label="Pane 2 (mm)">
                      <select value={pane2} onChange={(e) => setPane2(+e.target.value)} className="input">
                        {(selectedGlass.availableThicknessMm as any)?.map((t: number) => (
                          <option key={t} value={t}>{t}mm</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {layers === "TRIPLE" && (
                    <>
                      <Field label="Pane 2 (mm)">
                        <select value={pane2} onChange={(e) => setPane2(+e.target.value)} className="input">
                          {(selectedGlass.availableThicknessMm as any)?.map((t: number) => (
                            <option key={t} value={t}>{t}mm</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Pane 3 (mm)">
                        <select value={pane3} onChange={(e) => setPane3(+e.target.value)} className="input">
                          {(selectedGlass.availableThicknessMm as any)?.map((t: number) => (
                            <option key={t} value={t}>{t}mm</option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* Step 6: Hardware */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold">6. Hardware / Accessories</h3>
          <div className="space-y-2">
            {hardwareItems.map((h) => (
              <label key={h.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <span>{h.name} ({h.sellPrice} / {h.unit})</span>
                <input
                  type="number"
                  min={0}
                  className="input w-20"
                  value={hardwareSel[h.id] || 0}
                  onChange={(e) => setHardwareSel({ ...hardwareSel, [h.id]: +e.target.value })}
                />
              </label>
            ))}
          </div>
        </section>

        {/* Step 7: Processing */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold">7. Processing Options</h3>
          <div className="space-y-2">
            {processingOptions.map((o) => (
              <label key={o.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={processingSel.includes(o.id)}
                  onChange={(e) =>
                    setProcessingSel(e.target.checked ? [...processingSel, o.id] : processingSel.filter((x) => x !== o.id))
                  }
                />
                <span>{o.name} (+{o.sellPrice})</span>
              </label>
            ))}
          </div>
        </section>

        <button onClick={addToCart} className="btn w-full bg-blue-600 text-white hover:opacity-90">
          Add to Order ({cart.length} items)
        </button>
      </div>

      <div>
        <PriceSummary
          unitPrice={pricing.unitPrice}
          lineTotal={pricing.lineTotal}
          quantity={quantity}
          currency={currency}
          areaSqm={pricing.areaSqm}
          profileCost={pricing.profileCost}
          glassCost={pricing.glassCost}
          hardwareCost={pricing.hardwareCost}
          processingCost={pricing.processingCost}
        />
        {cart.length > 0 && (
          <div className="mt-4 rounded-xl border border-blue-600 bg-blue-50/50 p-4">
            <h4 className="text-sm font-semibold">Order summary ({cart.length} lines)</h4>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              {cart.map((c, i) => (
                <div key={i} className="flex justify-between">
                  <span>{c.kind.replace(/_/g, " ")} × {c.quantity}</span>
                  <span>{c.pricing.lineTotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
EOF
echo "✅ OrderWizard.tsx created"

echo ""
echo "=== All missing components created! ==="
echo "Now restart your dev server:"
echo "  npm run dev"
```

---

## Kako koristiti

1. Sačuvaj gornji sadržaj u fajl `fix.sh` **u korenu projekta** (gde je `package.json`)
2. U terminalu pokreni:
   ```bash
   bash fix.sh
   ```
3. Zatim restartuj dev server:
   ```bash
   npm run dev
   ```

Ako se pojave **druge greške** (npr. neki drugi fajl takođe nedostaje), samo mi reci — proširiću skript.

**Napomena o upozorenju `middleware-to-proxy`:** to je samo warning u Next.js 16, ne utiče na rad aplikacije. Možeš ignorisati zasad.
