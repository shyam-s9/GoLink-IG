'use client';

import Link from 'next/link';
import { Sidebar, BottomNav } from '../../components/Navigation';

export default function SettingsPage() {
  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar />
      <BottomNav />
      <main className="flex-1 md:ml-64 p-6 md:p-10 pb-24 md:pb-10">
        <div className="bento-card">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Settings</h1>
          <p className="text-slate-500 mt-3">
            This area should hold account settings, token health, automation safe mode, and role-based access as we continue maturing the product.
          </p>
          <Link href="/security" className="btn-indigo inline-flex mt-6">Open Security Center</Link>
        </div>
      </main>
    </div>
  );
}
