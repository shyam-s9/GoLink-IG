'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Clapperboard, Link2, MessageSquareText, RefreshCcw, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { Sidebar, BottomNav } from '../../components/Navigation';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../lib/api';
import { csrfPost, getCsrfToken } from '../../lib/csrf';

function createFormState(reel, automation = null) {
  return {
    reelId: automation?.reelId || reel?.id || '',
    triggerKeyword: automation?.triggerKeyword || '',
    publicReplyText: automation?.publicReplyText || '',
    affiliateLink: automation?.affiliateLink || '',
    isEnabled: automation?.isEnabled ?? true,
  };
}

export default function ReelsPage() {
  const { isAuthenticated, loading, login } = useAuth();
  const [automations, setAutomations] = useState([]);
  const [recentReels, setRecentReels] = useState([]);
  const [forms, setForms] = useState({});
  const [loadingState, setLoadingState] = useState(true);
  const [importing, setImporting] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const hydrateAutomationForms = (items) => {
    setForms((current) => {
      const next = { ...current };
      for (const item of items) {
        const key = `automation:${item.reelId}`;
        next[key] = next[key] || createFormState(null, item);
      }
      return next;
    });
  };

  const fetchAutomations = async () => {
    const response = await axios.get(`${API_URL}/api/reels/list`, { withCredentials: true });
    const items = response.data.automations || [];
    setAutomations(items);
    hydrateAutomationForms(items);
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    setLoadingState(true);
    getCsrfToken().catch(() => {});
    fetchAutomations()
      .catch((err) => {
        console.error('Failed to load automations', err);
        setError('Could not load your reel automations right now.');
      })
      .finally(() => setLoadingState(false));
  }, [isAuthenticated]);

  const handleImport = async () => {
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const response = await axios.get(`${API_URL}/api/reels/import`, { withCredentials: true });
      const reels = response.data.reels || [];
      setRecentReels(reels);
      setForms((current) => {
        const next = { ...current };
        for (const reel of reels) {
          const key = `recent:${reel.id}`;
          next[key] = next[key] || createFormState(reel, null);
        }
        return next;
      });
      setMessage(`${reels.length} recent reels imported.`);
      await fetchAutomations();
    } catch (err) {
      console.error('Import failed', err);
      setError('Import failed. Please verify Instagram access and try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleChange = (key, field, value) => {
    setForms((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        [field]: value,
      },
    }));
  };

  const handleSave = async (key) => {
    const payload = forms[key];
    if (!payload) return;

    setSavingKey(key);
    setError('');
    setMessage('');
    try {
      await csrfPost(`${API_URL}/api/reels/save`, payload);
      setMessage('Automation saved.');
      await fetchAutomations();
    } catch (err) {
      console.error('Save failed', err);
      setError(err.response?.data?.message || 'Could not save this automation.');
    } finally {
      setSavingKey('');
    }
  };

  const automationReelIds = useMemo(() => new Set(automations.map((item) => item.reelId)), [automations]);
  const newRecentReels = useMemo(
    () => recentReels.filter((reel) => !automationReelIds.has(String(reel.id))),
    [recentReels, automationReelIds]
  );

  if (!isAuthenticated && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bento-card max-w-lg">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Reels Automation</h1>
          <p className="text-slate-500 mt-3">Connect your Instagram account to import reels and configure automation rules.</p>
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Automation Studio</p>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight mt-2">Reels that actually convert</h1>
              <p className="text-slate-500 mt-3 max-w-2xl">Import your recent reels, tune trigger intent, and keep every automation editable from one place.</p>
            </div>
            <button onClick={handleImport} disabled={importing} className="btn-indigo inline-flex items-center gap-2">
              <RefreshCcw size={16} className={importing ? 'animate-spin' : ''} />
              {importing ? 'Importing...' : 'Import Recent Reels'}
            </button>
          </div>
          {message ? <p className="mt-4 text-sm text-emerald-600 font-medium">{message}</p> : null}
          {error ? <p className="mt-4 text-sm text-rose-600 font-medium">{error}</p> : null}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Clapperboard size={20} className="text-primary" />
            <h2 className="text-xl font-bold text-slate-800">Active Reel Automations</h2>
          </div>

          {loadingState ? (
            <div className="bento-card text-slate-500">Loading reel automations...</div>
          ) : automations.length === 0 ? (
            <div className="bento-card text-slate-500">No automations yet. Import recent reels to configure your first one.</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {automations.map((automation) => {
                const key = `automation:${automation.reelId}`;
                const form = forms[key] || createFormState(null, automation);
                return (
                  <article key={automation.id} className="bento-card space-y-5">
                    <div className="flex gap-4">
                      <div className="w-28 h-40 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                        {automation.thumbnailUrl ? (
                          <img src={automation.thumbnailUrl} alt={automation.caption || automation.reelId} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs px-4 text-center">Preview unavailable</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Reel ID</p>
                            <p className="text-sm font-semibold text-slate-700 break-all mt-1">{automation.reelId}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${form.isEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                            {form.isEnabled ? 'Enabled' : 'Paused'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-3 line-clamp-3">{automation.caption || 'No caption available for this reel yet.'}</p>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Delivered</p>
                            <p className="text-lg font-black text-slate-800 mt-1">{automation.totalDelivered}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleChange(key, 'isEnabled', !form.isEnabled)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-700"
                          >
                            Toggle status
                            {form.isEnabled ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} className="text-slate-400" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Trigger keyword</span>
                        <input className="input-premium" value={form.triggerKeyword} onChange={(e) => handleChange(key, 'triggerKeyword', e.target.value)} placeholder="send me the link" />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Public reply</span>
                        <textarea className="input-premium min-h-28" value={form.publicReplyText} onChange={(e) => handleChange(key, 'publicReplyText', e.target.value)} placeholder="Perfect - sending it to you now." />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Affiliate link</span>
                        <div className="relative">
                          <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input className="input-premium pl-11" value={form.affiliateLink} onChange={(e) => handleChange(key, 'affiliateLink', e.target.value)} placeholder="https://your-link.com" />
                        </div>
                      </label>
                    </div>

                    <button onClick={() => handleSave(key)} disabled={savingKey === key} className="btn-indigo inline-flex items-center gap-2">
                      <Save size={16} />
                      {savingKey === key ? 'Saving...' : 'Save Automation'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <MessageSquareText size={20} className="text-primary" />
            <h2 className="text-xl font-bold text-slate-800">Recently Imported Reels</h2>
          </div>

          {newRecentReels.length === 0 ? (
            <div className="bento-card text-slate-500">Imported reels will appear here after you sync from Instagram.</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {newRecentReels.map((reel) => {
                const key = `recent:${reel.id}`;
                const form = forms[key] || createFormState(reel, null);
                return (
                  <article key={reel.id} className="bento-card space-y-5">
                    <div className="flex gap-4">
                      <div className="w-28 h-40 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                        <img src={reel.thumbnail_url || reel.media_url} alt={reel.caption || reel.id} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">New Reel</p>
                        <p className="text-sm font-semibold text-slate-700 break-all mt-1">{reel.id}</p>
                        <p className="text-sm text-slate-500 mt-3 line-clamp-4">{reel.caption || 'No caption available for this reel.'}</p>
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Trigger keyword</span>
                        <input className="input-premium" value={form.triggerKeyword} onChange={(e) => handleChange(key, 'triggerKeyword', e.target.value)} placeholder="price / link / details" />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Public reply</span>
                        <textarea className="input-premium min-h-24" value={form.publicReplyText} onChange={(e) => handleChange(key, 'publicReplyText', e.target.value)} placeholder="Love it - I just sent the details over." />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Affiliate link</span>
                        <input className="input-premium" value={form.affiliateLink} onChange={(e) => handleChange(key, 'affiliateLink', e.target.value)} placeholder="https://your-link.com" />
                      </label>
                    </div>

                    <button onClick={() => handleSave(key)} disabled={savingKey === key} className="btn-indigo inline-flex items-center gap-2">
                      <Save size={16} />
                      {savingKey === key ? 'Saving...' : 'Create Automation'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
