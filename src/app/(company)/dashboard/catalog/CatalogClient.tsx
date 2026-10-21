'use client';

import { useEffect, useState } from 'react';

type Tab = 'glass' | 'profiles' | 'hardware' | 'processing' | 'templates';

const TAB_LABELS: Record<Tab, string> = {
  glass: 'Staklo',
  profiles: 'Profili',
  hardware: 'Oprema',
  processing: 'Obrada',
  templates: 'Šabloni',
};

interface Kind {
  value: string;
  label: string;
}

interface CatalogClientProps {
  kinds: Kind[];
}

export default function CatalogClient({ kinds }: CatalogClientProps) {
  const [tab, setTab] = useState<Tab>('glass');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/catalog?type=${tab}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [tab]);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tab, data: form }),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({});
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Neuspešno');
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    const res = await fetch('/api/catalog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tab, id: editing.id, data: editing }),
    });
    if (res.ok) {
      setEditing(null);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Neuspešno');
    }
  }

  /**
   * Deactivate a catalog item. A hard delete would break the foreign key from
   * any order that already references the item, so the server soft-deletes.
   */
  async function deactivate(id: string) {
    if (!confirm('Deaktivirati ovu stavku? Narudžbine koje je sadrže ostaju validne.')) return;
    setError(null);
    const res = await fetch(`/api/catalog?type=${tab}&id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Neuspešno');
    }
  }

  function renderForm() {
    if (tab === 'glass') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Naziv"
            className="input"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Kategorija (float/tempered/lowE/...)"
            className="input"
            value={form.category || ''}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            placeholder="Prodajna cena po m²"
            type="number"
            className="input"
            value={form.sellPricePerSqm || ''}
            onChange={(e) => setForm({ ...form, sellPricePerSqm: +e.target.value })}
          />
          <input
            placeholder="Nabavna cena po m²"
            type="number"
            className="input"
            value={form.costPricePerSqm || ''}
            onChange={(e) => setForm({ ...form, costPricePerSqm: +e.target.value })}
          />
          <input
            placeholder="Dostupne debljine (zarez: 4,5,6)"
            className="input"
            value={(form.availableThicknessMm || []).join(',')}
            onChange={(e) =>
              setForm({ ...form, availableThicknessMm: e.target.value.split(',').map(Number) })
            }
          />
        </div>
      );
    }
    if (tab === 'profiles') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Brend"
            className="input"
            value={form.brand || ''}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
          <input
            placeholder="Naziv sistema"
            className="input"
            value={form.systemName || ''}
            onChange={(e) => setForm({ ...form, systemName: e.target.value })}
          />
          <input
            placeholder="Broj komora"
            type="number"
            className="input"
            value={form.chamberCount || ''}
            onChange={(e) => setForm({ ...form, chamberCount: +e.target.value })}
          />
          <input
            placeholder="Dubina ugradnje mm"
            type="number"
            className="input"
            value={form.installDepthMm || ''}
            onChange={(e) => setForm({ ...form, installDepthMm: +e.target.value })}
          />
          <input
            placeholder="Prodajna cena po metru"
            type="number"
            className="input"
            value={form.sellPricePerMeter || ''}
            onChange={(e) => setForm({ ...form, sellPricePerMeter: +e.target.value })}
          />
          <input
            placeholder="Nabavna cena po metru"
            type="number"
            className="input"
            value={form.costPricePerMeter || ''}
            onChange={(e) => setForm({ ...form, costPricePerMeter: +e.target.value })}
          />
          <input
            placeholder="Boje (zarezom)"
            className="input"
            value={(form.colorOptions || []).join(',')}
            onChange={(e) => setForm({ ...form, colorOptions: e.target.value.split(',') })}
          />
        </div>
      );
    }
    if (tab === 'hardware') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Naziv"
            className="input"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Kategorija"
            className="input"
            value={form.category || ''}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            placeholder="Prodajna cena"
            type="number"
            className="input"
            value={form.sellPrice || ''}
            onChange={(e) => setForm({ ...form, sellPrice: +e.target.value })}
          />
          <input
            placeholder="Nabavna cena"
            type="number"
            className="input"
            value={form.costPrice || ''}
            onChange={(e) => setForm({ ...form, costPrice: +e.target.value })}
          />
          <input
            placeholder="Jedinica (komad/metar)"
            className="input"
            value={form.unit || 'komad'}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </div>
      );
    }
    if (tab === 'processing') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Naziv"
            className="input"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Prodajna cena"
            type="number"
            className="input"
            value={form.sellPrice || ''}
            onChange={(e) => setForm({ ...form, sellPrice: +e.target.value })}
          />
          <input
            placeholder="Nabavna cena"
            type="number"
            className="input"
            value={form.costPrice || ''}
            onChange={(e) => setForm({ ...form, costPrice: +e.target.value })}
          />
          <input
            placeholder="Jedinica"
            className="input"
            value={form.unit || 'per_item'}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </div>
      );
    }
    // templates
    return (
      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Naziv"
          className="input"
          value={form.name || ''}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          className="input"
          value={form.kind || ''}
          onChange={(e) => setForm({ ...form, kind: e.target.value })}
        >
          <option value="">Izaberite vrstu...</option>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Broj otvora"
          type="number"
          className="input"
          value={form.openingCount ?? ''}
          onChange={(e) => setForm({ ...form, openingCount: +e.target.value })}
        />
        <input
          placeholder="Kompleksitet (1.0 = standard)"
          type="number"
          step="0.05"
          className="input"
          value={form.complexityMultiplier ?? ''}
          onChange={(e) => setForm({ ...form, complexityMultiplier: +e.target.value })}
        />
        <input
          placeholder="Min širina mm"
          type="number"
          className="input"
          value={form.minWidthMm ?? ''}
          onChange={(e) => setForm({ ...form, minWidthMm: +e.target.value })}
        />
        <input
          placeholder="Max širina mm"
          type="number"
          className="input"
          value={form.maxWidthMm ?? ''}
          onChange={(e) => setForm({ ...form, maxWidthMm: +e.target.value })}
        />
        <input
          placeholder="Min visina mm"
          type="number"
          className="input"
          value={form.minHeightMm ?? ''}
          onChange={(e) => setForm({ ...form, minHeightMm: +e.target.value })}
        />
        <input
          placeholder="Max visina mm"
          type="number"
          className="input"
          value={form.maxHeightMm ?? ''}
          onChange={(e) => setForm({ ...form, maxHeightMm: +e.target.value })}
        />
      </div>
    );
  }

  function renderEditForm() {
    if (!editing) return null;
    const priceField =
      tab === 'glass'
        ? { key: 'sellPricePerSqm', label: 'Prodajna cena po m²' }
        : tab === 'profiles'
          ? { key: 'sellPricePerMeter', label: 'Prodajna cena po metru' }
          : { key: 'sellPrice', label: 'Prodajna cena' };
    return (
      <form onSubmit={saveEdit} className="rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h3 className="mb-4 font-semibold">Izmeni stavku</h3>
        <div className="grid grid-cols-2 gap-3">
          {tab === 'glass' && (
            <input
              placeholder="Naziv"
              className="input"
              value={editing.name || ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          )}
          {tab === 'profiles' && (
            <>
              <input
                placeholder="Brend"
                className="input"
                value={editing.brand || ''}
                onChange={(e) => setEditing({ ...editing, brand: e.target.value })}
              />
              <input
                placeholder="Naziv sistema"
                className="input"
                value={editing.systemName || ''}
                onChange={(e) => setEditing({ ...editing, systemName: e.target.value })}
              />
            </>
          )}
          {tab !== 'profiles' && tab !== 'glass' && (
            <input
              placeholder="Naziv"
              className="input"
              value={editing.name || ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          )}
          <input
            placeholder={priceField.label}
            type="number"
            className="input"
            value={editing[priceField.key] ?? ''}
            onChange={(e) => setEditing({ ...editing, [priceField.key]: +e.target.value })}
          />
          {tab === 'templates' && (
            <>
              <input
                placeholder="Kompleksitet"
                type="number"
                step="0.05"
                className="input"
                value={editing.complexityMultiplier ?? ''}
                onChange={(e) => setEditing({ ...editing, complexityMultiplier: +e.target.value })}
              />
              <input
                placeholder="Min širina mm"
                type="number"
                className="input"
                value={editing.minWidthMm ?? ''}
                onChange={(e) => setEditing({ ...editing, minWidthMm: +e.target.value })}
              />
              <input
                placeholder="Max širina mm"
                type="number"
                className="input"
                value={editing.maxWidthMm ?? ''}
                onChange={(e) => setEditing({ ...editing, maxWidthMm: +e.target.value })}
              />
              <input
                placeholder="Min visina mm"
                type="number"
                className="input"
                value={editing.minHeightMm ?? ''}
                onChange={(e) => setEditing({ ...editing, minHeightMm: +e.target.value })}
              />
              <input
                placeholder="Max visina mm"
                type="number"
                className="input"
                value={editing.maxHeightMm ?? ''}
                onChange={(e) => setEditing({ ...editing, maxHeightMm: +e.target.value })}
              />
            </>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn bg-blue-600 text-white">Sačuvaj izmene</button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="btn border border-slate-300 text-slate-700"
          >
            Odustani
          </button>
        </div>
      </form>
    );
  }

  function itemName(item: any) {
    return item.name || `${item.brand ?? ''} ${item.systemName ?? ''}`.trim();
  }

  function itemPrice(item: any) {
    return (
      item.sellPricePerSqm ?? item.sellPricePerMeter ?? item.sellPrice ?? item.complexityMultiplier
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Katalog i cene</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn bg-blue-600 text-white">
          {showForm ? 'Otkaži' : 'Dodaj stavku'}
        </button>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {showForm && (
        <form onSubmit={createItem} className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold">Kreiraj stavku ({TAB_LABELS[tab]})</h3>
          {renderForm()}
          <button className="btn mt-4 bg-blue-600 text-white">Sačuvaj</button>
        </form>
      )}
      {editing && renderEditForm()}
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4">Učitavanje...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="p-4">Naziv</th>
                <th className="p-4">Cena</th>
                <th className="p-4">Aktivno</th>
                <th className="p-4 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-4">{itemName(item)}</td>
                  <td className="p-4">{itemPrice(item)}</td>
                  <td className="p-4">{item.isActive ? 'Da' : 'Ne'}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditing(item)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Izmeni
                      </button>
                      {item.isActive && (
                        <button
                          onClick={() => deactivate(item.id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Deaktiviraj
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
