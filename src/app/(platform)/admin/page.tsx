import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AdminPage() {
  const session = await getSession();
  if ((session?.user as any)?.platformRole !== "SUPER_ADMIN") redirect("/login");

  const companies = await prisma.company.findMany({ include: { _count: { select: { users: true, orders: true } } } });

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold">Platform Admin</h1>
      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr><th className="p-4">Company</th><th className="p-4">Slug</th><th className="p-4">Users</th><th className="p-4">Orders</th><th className="p-4">Status</th></tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="p-4 font-medium">{c.name}</td>
                <td className="p-4">{c.slug}</td>
                <td className="p-4">{c._count.users}</td>
                <td className="p-4">{c._count.orders}</td>
                <td className="p-4">{c.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
