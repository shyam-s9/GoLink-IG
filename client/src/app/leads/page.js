'use client';

import Link from 'next/link';
import { Sidebar, BottomNav } from '../../components/Navigation';

export default function LeadsPage() {
  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar />
      <BottomNav />
      <main className="flex-1 md:ml-64 p-6 md:p-10 pb-24 md:pb-10">
        <div className="bento-card">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Lead Pipeline</h1>
          <p className="text-slate-500 mt-3">
            Lead views are the next natural step. The backend is already capturing lead and security activity, so this page can evolve into a scored, trust-aware pipeline.
          </p>
          <Link href="/" className="btn-indigo inline-flex mt-6">Back to Dashboard</Link>
        </div>
      </main>
    </div>
  );
}
