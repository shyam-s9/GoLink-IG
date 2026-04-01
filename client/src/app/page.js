'use client';
import React, { useState, useEffect } from 'react';
import { Sidebar, BottomNav } from '../components/Navigation';
import { StatCard, SentimentShield, LinkTracker } from '../components/DashboardComponents';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../contexts/AuthContext';
import { Zap, MessageSquare, Users, ShieldCheck, Instagram, PlusCircle, RefreshCcw } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://localhost:3001';

export default function Dashboard() {
  const { lastMessage, isConnected } = useSocket();
  const { isAuthenticated, loading, login } = useAuth();
  const [smartDelay, setSmartDelay] = useState(true);
  const [importedReels, setImportedReels] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  // Manual Reel Import Logic
  const handleImportReels = async () => {
    setIsImporting(true);
    try {
      const res = await axios.get(`${API_URL}/api/reels/import`, { withCredentials: true });
      setImportedReels(res.data.reels);
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isAuthenticated && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <Zap size={48} className="text-primary mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Cloud Clarity Session Required</h2>
        <p className="text-slate-500 mb-8">Please login with Instagram to manage your automations.</p>
        <button onClick={login} className="btn-indigo">Continue with Instagram</button>
      </div>
    );
  }

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar />
      <BottomNav />
      
      <main className="flex-1 md:ml-64 p-6 md:p-10 pb-24 md:pb-10 transition-all">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Cloud Clarity</h2>
            <div className="flex items-center gap-2 mt-1">
                <p className="text-slate-500 font-medium uppercase text-xs tracking-widest">SaaS Dashboard</p>
                {isConnected ? 
                    <span className="text-[10px] bg-emerald-50 text-success font-bold px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-tighter">● Session Live (15m)</span> :
                    <span className="text-[10px] bg-slate-100 text-slate-400 font-bold px-2 py-0.5 rounded-full border border-slate-200">Reconnecting...</span>
                }
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 px-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Smart Delay</span>
              <button 
                onClick={() => setSmartDelay(!smartDelay)}
                className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 ${smartDelay ? 'bg-primary' : 'bg-slate-200'}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${smartDelay ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </button>
            </div>
            <div className="w-px h-6 bg-slate-100"></div>
            <button 
                onClick={handleImportReels}
                disabled={isImporting}
                className="btn-indigo flex items-center gap-2"
            >
              <RefreshCcw size={16} className={isImporting ? 'animate-spin' : ''} />
              {isImporting ? 'Syncing...' : 'Import Cache'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard title="Total GoLinks Sent" value="1,284" icon={Zap} trend="+12.5%" />
          <StatCard title="Active Automations" value={importedReels.length || '18'} icon={Instagram} trend="+3" />
          <StatCard title="Qualified Leads" value="842" icon={Users} trend="84%" />
          <StatCard title="Response Rate" value="92%" icon={MessageSquare} trend="+5.2%" />

          <div className="md:col-span-1 min-h-[400px]">
            <SentimentShield positive={2450} negative={120} liveUpdate={lastMessage} />
          </div>
          
          <div className="md:col-span-3 min-h-[400px]">
             <LinkTracker links={[]} liveUpdate={lastMessage} />
          </div>

          {/* Manual Control: Imported Reels Cache */}
          {importedReels.length > 0 && (
            <div className="md:col-span-4 bento-card">
               <h3 className="text-slate-600 font-bold mb-6 flex items-center gap-2 uppercase tracking-wider text-xs">
                <PlusCircle size={16} className="text-indigo-500" />
                Select Reels for Automation
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {importedReels.map((reel) => (
                   <div key={reel.id} className="relative group cursor-pointer border border-slate-100 rounded-lg overflow-hidden hover:border-primary transition-all">
                      <img src={reel.thumbnail_url || reel.media_url} alt="reel" className="w-full aspect-[9/16] object-cover group-hover:opacity-80 transition-opacity" />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                         <span className="text-[10px] text-white font-bold block truncate">{reel.caption || 'No caption'}</span>
                      </div>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-lg"><PlusCircle size={20} /></button>
                      </div>
                   </div>
                ))}
              </div>
            </div>
          )}

          <div className="md:col-span-4 bento-card flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 text-primary rounded-xl flex items-center justify-center">
                <ShieldCheck size={28} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800">EMW Internal Protection</h4>
                <p className="text-sm text-slate-500">Real-time monitoring active. Authenticated session active for 15 minutes.</p>
              </div>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button className="btn-ghost flex-1 md:flex-none">Manage Sessions</button>
              <button className="btn-indigo flex-1 md:flex-none">Export Stats</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
