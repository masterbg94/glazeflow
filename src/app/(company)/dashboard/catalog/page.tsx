'use client';

import { useEffect, useState } from 'react';

export default function CatalogPage() {
  const [tab, setTab] = useState<'glass' | 'profiles' | 'hardware'>('glass');
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
            placeholder="Name"
            className="input"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Category (float/tempered/lowE/...)"
            className="input"
            value={form.category || ''}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            placeholder="Sell price per m²"
            type="number"
            className="input"
            value={form.sellPricePerSqm || ''}
            onChange={(e) => setForm({ ...form, sellPricePerSqm: +e.target.value })}
          />
          <input
            placeholder="Cost price per m²"
            type="number"
            className="input"
            value={form.costPricePerSqm || ''}
            onChange={(e) => setForm({ ...form, costPricePerSqm: +e.target.value })}
          />
          <input
            placeholder="Available thickness (comma: 4,5,6)"
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
            placeholder="Brand"
            className="input"
            value={form.brand || ''}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
          <input
            placeholder="System name"
            className="input"
            value={form.systemName || ''}
            onChange={(e) => setForm({ ...form, systemName: e.target.value })}
          />
          <input
            placeholder="Chamber count"
            type="number"
            className="input"
            value={form.chamberCount || ''}
            onChange={(e) => setForm({ ...form, chamberCount: +e.target.value })}
          />
          <input
            placeholder="Install depth mm"
            type="number"
            className="input"
            value={form.installDepthMm || ''}
            onChange={(e) => setForm({ ...form, installDepthMm: +e.target.value })}
          />
          <input
            placeholder="Sell per meter"
            type="number"
            className="input"
            value={form.sellPricePerMeter || ''}
            onChange={(e) => setForm({ ...form, sellPricePerMeter: +e.target.value })}
          />
          <input
            placeholder="Cost per meter"
            type="number"
            className="input"
            value={form.costPricePerMeter || ''}
            onChange={(e) => setForm({ ...form, costPricePerMeter: +e.target.value })}
          />
          <input
            placeholder="Colors (comma)"
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
          placeholder="Name"
          className="input"
          value={form.name || ''}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Category"
          className="input"
          value={form.category || ''}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <input
          placeholder="Sell price"
          type="number"
          className="input"
          value={form.sellPrice || ''}
          onChange={(e) => setForm({ ...form, sellPrice: +e.target.value })}
        />
        <input
          placeholder="Cost price"
          type="number"
          className="input"
          value={form.costPrice || ''}
          onChange={(e) => setForm({ ...form, costPrice: +e.target.value })}
        />
        <input
          placeholder="Unit (piece/meter)"
          className="input"
          value={form.unit || 'piece'}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Catalog & Pricing</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn bg-blue-600 text-white">
          {showForm ? 'Cancel' : 'Add Item'}
        </button>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {(['glass', 'profiles', 'hardware'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {showForm && (
        <form onSubmit={createItem} className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold">Create {tab} item</h3>
          {renderForm()}
          <button className="btn mt-4 bg-blue-600 text-white">Save</button>
        </form>
      )}
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="p-4">Name</th>
                <th className="p-4">Price</th>
                <th className="p-4">Active</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-4">{item.name || `${item.brand} ${item.systemName}`}</td>
                  <td className="p-4">
                    {item.sellPricePerSqm || item.sellPricePerMeter || item.sellPrice}
                  </td>
                  <td className="p-4">{item.isActive ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
