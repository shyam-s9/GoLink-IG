'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Filter, Mail, RefreshCcw, UserRound } from 'lucide-react';
import { Sidebar, BottomNav } from '../../components/Navigation';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../lib/api';

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Converted', value: 'converted' },
];

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'converted') return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  if (normalized === 'contacted') return 'bg-indigo-50 text-indigo-700 border border-indigo-100';
  return 'bg-amber-50 text-amber-700 border border-amber-100';
}

export default function LeadsPage() {
  const { isAuthenticated, loading, login } = useAuth();
  const [status, setStatus] = useState('all');
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadLeads = async (selectedStatus, isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoadingLeads(true);

    try {
      const response = await axios.get(`${API_URL}/api/leads`, {
        withCredentials: true,
        params: selectedStatus && selectedStatus !== 'all' ? { status: selectedStatus } : {},
      });
      setLeads(response.data.leads || []);
      setError('');
    } catch (err) {
      console.error('Failed to load leads', err);
      setError('Could not load leads right now.');
    } finally {
      setLoadingLeads(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadLeads(status);
  }, [isAuthenticated, status]);

  const summary = useMemo(() => ({
    total: leads.length,
    withEmail: leads.filter((lead) => lead.email).length,
    avgScore: leads.length ? Math.round(leads.reduce((sum, lead) => sum + Number(lead.lead_score || 0), 0) / leads.length) : 0,
  }), [leads]);

  if (!isAuthenticated && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bento-card max-w-lg">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Lead Pipeline</h1>
          <p className="text-slate-500 mt-3">Connect your Instagram account to see captured leads and qualification signals.</p>
          <button onClick={login} className="btn-indigo mt-6">Connect Instagram</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar />
      <BottomNav />
      <main className="flex-1 md:ml-64 p-6 md:p-10 pb-24 md:pb-10 space-y-8">
        <section className="bento-card">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Lead Workspace</p>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight mt-2">Every interested commenter, in one pipeline</h1>
              <p className="text-slate-500 mt-3 max-w-2xl">Review captured leads, check qualification signals, and keep your outreach flow organized.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Filter size={16} className="text-slate-400" />
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none">
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <button onClick={() => loadLeads(status, true)} disabled={refreshing} className="btn-indigo inline-flex items-center gap-2">
                <RefreshCcw size={16} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Refreshing...' : 'Refresh Leads'}
              </button>
            </div>
          </div>
          {error ? <p className="mt-4 text-sm text-rose-600 font-medium">{error}</p> : null}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bento-card">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Total Leads</p>
            <p className="text-3xl font-black text-slate-800 mt-3">{summary.total}</p>
          </div>
          <div className="bento-card">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">With Email</p>
            <p className="text-3xl font-black text-slate-800 mt-3">{summary.withEmail}</p>
          </div>
          <div className="bento-card">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Average Score</p>
            <p className="text-3xl font-black text-slate-800 mt-3">{summary.avgScore}</p>
          </div>
        </section>

        <section className="bento-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <th className="px-4 py-4">Handle</th>
                  <th className="px-4 py-4">Email</th>
                  <th className="px-4 py-4">Lead Score</th>
                  <th className="px-4 py-4">Source</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {loadingLeads ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading leads...</td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">No leads found for this filter yet.</td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                            <UserRound size={16} />
                          </div>
                          <span className="font-semibold">{lead.platform_handle || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {lead.email ? (
                          <div className="inline-flex items-center gap-2 text-slate-700">
                            <Mail size={14} className="text-slate-400" />
                            {lead.email}
                          </div>
                        ) : (
                          <span className="text-slate-400">Not captured</span>
                        )}
                      </td>
                      <td className="px-4 py-4 font-semibold">{lead.lead_score ?? 0}</td>
                      <td className="px-4 py-4 uppercase text-xs font-bold tracking-[0.18em] text-slate-500">{lead.source || 'UNKNOWN'}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${statusClass(lead.status)}`}>
                          {lead.status || 'NEW'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-500">{lead.created_at ? new Date(lead.created_at).toLocaleString() : 'Unknown'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
