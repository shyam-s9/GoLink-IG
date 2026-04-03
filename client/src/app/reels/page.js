'use client';

import Link from 'next/link';
import { Sidebar, BottomNav } from '../../components/Navigation';

export default function ReelsPage() {
  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar />
      <BottomNav />
      <main className="flex-1 md:ml-64 p-6 md:p-10 pb-24 md:pb-10">
        <div className="bento-card">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Reels Automation</h1>
          <p className="text-slate-500 mt-3">
            This section is ready for a fuller reel-management flow. For now, import reels and manage trigger automation from the main dashboard.
          </p>
          <Link href="/" className="btn-indigo inline-flex mt-6">Back to Dashboard</Link>
        </div>
      </main>
    </div>
  );
}
