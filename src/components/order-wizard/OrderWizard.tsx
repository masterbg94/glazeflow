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
