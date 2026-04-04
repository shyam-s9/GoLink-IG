'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Bot, Gauge, Lock, RefreshCcw, Save, ShieldCheck, Users } from 'lucide-react';
import { Sidebar, BottomNav } from '../../components/Navigation';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../lib/api';
import { csrfPost, getCsrfToken } from '../../lib/csrf';

function badgeTone(risk) {
  const normalized = String(risk || '').toLowerCase();
  if (normalized === 'critical' || normalized === 'high') return 'bg-rose-50 text-rose-700 border border-rose-100';
  if (normalized === 'guarded' || normalized === 'medium') return 'bg-amber-50 text-amber-700 border border-amber-100';
  return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
}

export default function AdminPage() {
  const { user, isAuthenticated, loading, login } = useAuth();
  const [overview, setOverview] = useState({ stats: {}, incidents: [] });
  const [users, setUsers] = useState([]);
  const [config, setConfig] = useState({ ai_tone: 'casual, warm, human', ai_max_length: '300', ai_safety_mode: 'on' });
  const [queue, setQueue] = useState({ waiting: 0, active: 0, failed: 0, lastCompleted: null });
  const [error, setError] = useState('');
  const [loadingState, setLoadingState] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [lockingUserId, setLockingUserId] = useState('');

  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
  const canViewAdmin = ['ADMIN', 'ANALYST'].includes(String(user?.role || '').toUpperCase());

  const loadAdminData = async () => {
    setLoadingState(true);
    setError('');
    try {
      const requests = [
        axios.get(`${API_URL}/api/admin/security/overview`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/users`, { withCredentials: true }),
        axios.get(`${API_URL}/api/health/queue`, { withCredentials: true }),
      ];

      if (isAdmin) {
        requests.push(axios.get(`${API_URL}/api/admin/config`, { withCredentials: true }));
      }

      const responses = await Promise.all(requests);
      setOverview(responses[0].data);
      setUsers(responses[1].data.users || []);
      setQueue(responses[2].data.queue || {});
      if (isAdmin && responses[3]) {
        setConfig(responses[3].data.config || config);
      }
    } catch (err) {
      console.error('Failed to load admin data', err);
      setError('Could not load admin console right now.');
    } finally {
      setLoadingState(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canViewAdmin) return;
    getCsrfToken().catch(() => {});
    loadAdminData();
  }, [isAuthenticated, canViewAdmin, isAdmin]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setError('');
    try {
      const res = await csrfPost(`${API_URL}/api/admin/config`, { config });
      setConfig(res.data.config || config);
    } catch (err) {
      console.error('Failed to save config', err);
      setError(err.response?.data?.message || 'Could not save AI settings.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleLockToggle = async (record) => {
    setLockingUserId(record.id);
    setError('');
    try {
      await csrfPost(`${API_URL}/api/admin/users/${record.id}/security-lock`, { lock: record.is_active });
      setUsers((current) => current.map((item) => item.id === record.id ? { ...item, is_active: !record.is_active } : item));
    } catch (err) {
      console.error('Failed to update user lock', err);
      setError(err.response?.data?.message || 'Could not update user lock state.');
    } finally {
      setLockingUserId('');
    }
  };

  const summary = useMemo(() => ({
    activeUsers: overview.stats?.active_users || 0,
    openIncidents: overview.stats?.open_incidents || 0,
    blocked24h: overview.stats?.blocked_24h || 0,
    activeSessions: overview.stats?.active_sessions || 0,
  }), [overview]);

  if (!isAuthenticated && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bento-card max-w-lg">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Admin Console</h1>
          <p className="text-slate-500 mt-3">Sign in to access the GoLink Auto control room.</p>
          <button onClick={login} className="btn-indigo mt-6">Connect Instagram</button>
        </div>
      </div>
    );
  }

  if (isAuthenticated && !loading && !canViewAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bento-card max-w-lg">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Admin Access Required</h1>
          <p className="text-slate-500 mt-3">This space is reserved for GoLink Auto operators.</p>
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
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Operator Console</p>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight mt-2">Admin command center</h1>
              <p className="text-slate-500 mt-3 max-w-2xl">Monitor security posture, queue health, users, and AI behavior from one place.</p>
            </div>
            <button onClick={loadAdminData} className="btn-indigo inline-flex items-center gap-2">
              <RefreshCcw size={16} className={loadingState ? 'animate-spin' : ''} />
              Refresh Console
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-rose-600 font-medium">{error}</p> : null}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bento-card"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Active Users</p><p className="text-3xl font-black text-slate-800 mt-3">{summary.activeUsers}</p></div>
          <div className="bento-card"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Open Incidents</p><p className="text-3xl font-black text-slate-800 mt-3">{summary.openIncidents}</p></div>
          <div className="bento-card"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Blocked 24h</p><p className="text-3xl font-black text-slate-800 mt-3">{summary.blocked24h}</p></div>
          <div className="bento-card"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Active Sessions</p><p className="text-3xl font-black text-slate-800 mt-3">{summary.activeSessions}</p></div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="bento-card">
            <div className="flex items-center gap-3 mb-5">
              <Users size={18} className="text-primary" />
              <h2 className="text-xl font-bold text-slate-800">Customer Users</h2>
            </div>
            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {users.map((record) => (
                <div key={record.id} className="rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-slate-800">{record.full_name || 'Unnamed user'}</p>
                    <p className="text-sm text-slate-500 mt-1">{record.platform_user_id}</p>
                    <p className="text-xs text-slate-400 mt-2">Last login: {record.last_login_at ? new Date(record.last_login_at).toLocaleString() : 'Never'}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeTone(record.risk_level)}`}>{record.risk_level || 'normal'}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${record.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>{record.is_active ? 'Active' : 'Locked'}</span>
                    {isAdmin ? (
                      <button onClick={() => handleLockToggle(record)} disabled={lockingUserId === record.id} className="btn-ghost inline-flex items-center gap-2">
                        <Lock size={14} />
                        {lockingUserId === record.id ? 'Saving...' : record.is_active ? 'Lock' : 'Unlock'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bento-card">
              <div className="flex items-center gap-3 mb-5">
                <Gauge size={18} className="text-primary" />
                <h2 className="text-xl font-bold text-slate-800">Queue Metrics</h2>
              </div>
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex justify-between"><span>Waiting</span><strong>{queue.waiting || 0}</strong></div>
                <div className="flex justify-between"><span>Active</span><strong>{queue.active || 0}</strong></div>
                <div className="flex justify-between"><span>Failed</span><strong>{queue.failed || 0}</strong></div>
                <div className="flex justify-between gap-4"><span>Last Completed</span><strong className="text-right">{queue.lastCompleted ? new Date(queue.lastCompleted).toLocaleString() : 'Not yet'}</strong></div>
              </div>
            </div>

            <div className="bento-card">
              <div className="flex items-center gap-3 mb-5">
                <ShieldCheck size={18} className="text-primary" />
                <h2 className="text-xl font-bold text-slate-800">Security Overview</h2>
              </div>
              <div className="space-y-3">
                {(overview.incidents || []).slice(0, 5).map((incident) => (
                  <div key={incident.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800 capitalize">{String(incident.category || '').replace(/-/g, ' ')}</p>
                        <p className="text-sm text-slate-500 mt-1">{incident.summary || 'No summary provided.'}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeTone(incident.severity)}`}>{incident.severity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bento-card">
              <div className="flex items-center gap-3 mb-5">
                <Bot size={18} className="text-primary" />
                <h2 className="text-xl font-bold text-slate-800">AI Behavior Settings</h2>
              </div>
              {isAdmin ? (
                <div className="space-y-4">
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Tone</span>
                    <select className="input-premium" value={config.ai_tone || 'casual, warm, human'} onChange={(e) => setConfig((current) => ({ ...current, ai_tone: e.target.value }))}>
                      <option value="casual, warm, human">Casual Warm Human</option>
                      <option value="playful, energetic, conversational">Playful Energetic</option>
                      <option value="calm, premium, reassuring">Calm Premium</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Max Public Length</span>
                    <input type="range" min="120" max="300" step="10" value={Number(config.ai_max_length || 300)} onChange={(e) => setConfig((current) => ({ ...current, ai_max_length: e.target.value }))} />
                    <span className="text-sm text-slate-600">{config.ai_max_length || 300} characters</span>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Safety Mode</span>
                    <select className="input-premium" value={config.ai_safety_mode || 'on'} onChange={(e) => setConfig((current) => ({ ...current, ai_safety_mode: e.target.value }))}>
                      <option value="on">On</option>
                      <option value="off">Off</option>
                    </select>
                  </label>
                  <button onClick={handleSaveConfig} disabled={savingConfig} className="btn-indigo inline-flex items-center gap-2">
                    <Save size={16} />
                    {savingConfig ? 'Saving...' : 'Save AI Settings'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Analysts can view the admin console, but only admins can change AI behavior settings.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
