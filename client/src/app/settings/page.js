'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Clock3, Fingerprint, Lock, RefreshCcw, ShieldCheck, UserRound } from 'lucide-react';
import { Sidebar, BottomNav } from '../../components/Navigation';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../lib/api';
import { csrfPost, getCsrfToken } from '../../lib/csrf';

function formatDate(value) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
}

export default function SettingsPage() {
  const { user, isAuthenticated, loading, login } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loadingState, setLoadingState] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');

  const loadSettingsData = async () => {
    setLoadingState(true);
    setError('');
    try {
      const sessionsRes = await axios.get(`${API_URL}/api/security/sessions`, { withCredentials: true });
      setSessions(sessionsRes.data.sessions || []);
    } catch (err) {
      console.error('Failed to load settings data', err);
      setError('Could not load settings right now.');
    } finally {
      setLoadingState(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    getCsrfToken().catch(() => {});
    loadSettingsData();
  }, [isAuthenticated]);

  const revokeOtherSessions = async () => {
    setRevoking(true);
    setError('');
    try {
      await csrfPost(`${API_URL}/api/security/sessions/revoke-others`);
      await loadSettingsData();
    } catch (err) {
      console.error('Failed to revoke sessions', err);
      setError('Could not revoke other sessions.');
    } finally {
      setRevoking(false);
    }
  };

  const tokenAge = useMemo(() => {
    if (!user?.tokenExpiresAt) return null;
    const expiresAt = new Date(user.tokenExpiresAt).getTime();
    const issuedAt = expiresAt - (60 * 24 * 60 * 60 * 1000);
    const ageDays = Math.max(0, Math.floor((Date.now() - issuedAt) / (24 * 60 * 60 * 1000)));
    const remainingDays = Math.max(0, Math.floor((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    return { ageDays, remainingDays };
  }, [user?.tokenExpiresAt]);

  if (!isAuthenticated && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bento-card max-w-lg">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Settings</h1>
          <p className="text-slate-500 mt-3">Sign in to view your connected account, session, and token safety details.</p>
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
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Account Settings</p>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight mt-2">Connected account and session health</h1>
              <p className="text-slate-500 mt-3 max-w-2xl">Review your connected Instagram identity, token freshness, and active device footprint.</p>
            </div>
            <button onClick={loadSettingsData} className="btn-indigo inline-flex items-center gap-2">
              <RefreshCcw size={16} className={loadingState ? 'animate-spin' : ''} />
              Refresh Settings
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-rose-600 font-medium">{error}</p> : null}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="bento-card">
            <div className="icon-box bg-indigo-50 text-primary mb-4"><UserRound size={20} /></div>
            <p className="text-slate-500 text-sm">Full Name</p>
            <h2 className="text-xl font-black text-slate-800 mt-1">{user?.fullName || 'Unknown'}</h2>
          </div>
          <div className="bento-card">
            <div className="icon-box bg-slate-100 text-slate-600 mb-4"><Fingerprint size={20} /></div>
            <p className="text-slate-500 text-sm">Platform User ID</p>
            <h2 className="text-sm font-black text-slate-800 mt-1 break-all">{user?.platformUserId || 'Unknown'}</h2>
          </div>
          <div className="bento-card">
            <div className="icon-box bg-amber-50 text-amber-600 mb-4"><Clock3 size={20} /></div>
            <p className="text-slate-500 text-sm">Last Login</p>
            <h2 className="text-base font-black text-slate-800 mt-1">{formatDate(user?.lastLoginAt)}</h2>
          </div>
          <div className="bento-card">
            <div className="icon-box bg-emerald-50 text-emerald-600 mb-4"><ShieldCheck size={20} /></div>
            <p className="text-slate-500 text-sm">Active Sessions</p>
            <h2 className="text-2xl font-black text-slate-800 mt-1">{sessions.length}</h2>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
          <div className="bento-card space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Token Health</h2>
              <p className="text-sm text-slate-500 mt-2">GoLink Auto refreshes long-lived tokens proactively, but this panel helps you spot aging credentials early.</p>
            </div>

            {tokenAge ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Token Age</p>
                  <p className="text-2xl font-black text-slate-800 mt-2">{tokenAge.ageDays} days</p>
                </div>
                <div className={`rounded-2xl border p-4 ${tokenAge.ageDays > 50 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                  {tokenAge.ageDays > 50
                    ? `Warning: this token is older than 50 days and should be watched closely. Approximately ${tokenAge.remainingDays} days remain before expiry.`
                    : `Token age looks healthy. Approximately ${tokenAge.remainingDays} days remain before expiry.`}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 p-4 text-slate-500 text-sm">Token expiry data is not available yet for this account.</div>
            )}
          </div>

          <div className="bento-card space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Session Safety</h2>
                <p className="text-sm text-slate-500 mt-2">Review active sessions and instantly revoke everything except the one you are using now.</p>
              </div>
              <button onClick={revokeOtherSessions} disabled={revoking} className="btn-indigo inline-flex items-center gap-2">
                <Lock size={16} />
                {revoking ? 'Revoking...' : 'Revoke Other Sessions'}
              </button>
            </div>

            <div className="space-y-3">
              {sessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="font-semibold text-slate-800">{session.isCurrent ? 'Current Session' : 'Active Session'}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${session.isCurrent ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>{session.isCurrent ? 'This device' : 'Trusted'}</span>
                  </div>
                  <p className="text-sm text-slate-600">IP: {session.ipAddress || 'Unknown'}</p>
                  <p className="text-sm text-slate-600 mt-1 truncate">Agent: {session.userAgent || 'Unknown user agent'}</p>
                  <p className="text-xs text-slate-400 mt-2">Last seen: {formatDate(session.lastSeenAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
