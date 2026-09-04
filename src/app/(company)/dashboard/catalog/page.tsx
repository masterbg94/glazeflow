'use client';

import { useEffect, useState } from 'react';

const KINDS = [
  { value: 'GLASS_ONLY', label: 'Samostaklo' },
  { value: 'RAW_PROFILE', label: 'Si profil' },
  { value: 'FINISHED_WINDOW', label: 'Gotov prozor' },
  { value: 'FINISHED_DOOR', label: 'Gotova vrata' },
];

export default function CatalogPage() {
  const [tab, setTab] = useState<'glass' | 'profiles' | 'hardware' | 'processing'>('glass');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});

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
    const res = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tab, data: form }),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({});
      load();
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
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Primjenjivo za vrstu proizvoda (ostavi prazno = sve)
          </label>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <label key={k.value} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={
                    Array.isArray(form.applicableKinds) && form.applicableKinds.includes(k.value)
                  }
                  onChange={(e) => {
                    const cur = Array.isArray(form.applicableKinds) ? form.applicableKinds : [];
                    setForm({
                      ...form,
                      applicableKinds: e.target.checked
                        ? [...cur, k.value]
                        : cur.filter((x: string) => x !== k.value),
                    });
                  }}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                {k.label}
              </label>
            ))}
          </div>
        </div>
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
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Primjenjivo za vrstu proizvoda (ostavi prazno = sve)
          </label>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <label key={k.value} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={
                    Array.isArray(form.applicableKinds) && form.applicableKinds.includes(k.value)
                  }
                  onChange={(e) => {
                    const cur = Array.isArray(form.applicableKinds) ? form.applicableKinds : [];
                    setForm({
                      ...form,
                      applicableKinds: e.target.checked
                        ? [...cur, k.value]
                        : cur.filter((x: string) => x !== k.value),
                    });
                  }}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                {k.label}
              </label>
            ))}
          </div>
        </div>
      </div>
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
        {(['glass', 'profiles', 'hardware', 'processing'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
          >
            {t === 'glass'
              ? 'Staklo'
              : t === 'profiles'
                ? 'Profili'
                : t === 'hardware'
                  ? 'Oprema'
                  : 'Obrada'}
          </button>
        ))}
      </div>
      {showForm && (
        <form onSubmit={createItem} className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold">
            Kreiraj{' '}
            {tab === 'glass'
              ? 'staklo'
              : tab === 'profiles'
                ? 'profil'
                : tab === 'hardware'
                  ? 'opremu'
                  : 'opciju obrade'}{' '}
            stavku
          </h3>
          {renderForm()}
          <button className="btn mt-4 bg-blue-600 text-white">Sačuvaj</button>
        </form>
      )}
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
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-4">{item.name || `${item.brand} ${item.systemName}`}</td>
                  <td className="p-4">
                    {item.sellPricePerSqm || item.sellPricePerMeter || item.sellPrice}
                  </td>
                  <td className="p-4">{item.isActive ? 'Da' : 'Ne'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
