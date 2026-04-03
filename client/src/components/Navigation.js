'use client';
import React from 'react';
import { Home, Clapperboard, BarChart3, Settings, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: Home, path: '/' },
  { label: 'Reels', icon: Clapperboard, path: '/reels' },
  { label: 'Leads', icon: BarChart3, path: '/leads' },
  { label: 'Security', icon: ShieldCheck, path: '/security' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export const Sidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 bg-white border-r border-slate-200 px-4 py-8 z-50">
      <div className="flex items-center gap-3 px-4 mb-10">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
          <Zap size={24} color="white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-800">GoLink Auto</h1>
      </div>

      <nav className="flex-1 space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;
          return (
            <Link 
              key={item.path} 
              href={item.path} 
              className={`nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="pt-6 border-t border-slate-100">
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Security Shield</p>
          <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse transition-all"></div>
            System Active
          </div>
        </div>
      </div>
    </aside>
  );
};

export const BottomNav = () => {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.slice(0, 4).map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.path;
        return (
          <Link 
            key={item.path} 
            href={item.path} 
            className={`bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={24} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
