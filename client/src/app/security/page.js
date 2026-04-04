'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, Clock3, Fingerprint, Lock, RefreshCcw, ShieldCheck, ShieldAlert, UserCheck } from 'lucide-react';
import { Sidebar, BottomNav } from '../../components/Navigation';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../lib/api';
import { csrfPost, getCsrfToken } from '../../lib/csrf';

function formatDate(value) {
  if (!value) return 'Not available';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function severityTone(severity) {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'critical' || normalized === 'high') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (normalized === 'medium' || normalized === 'guarded') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export default function SecurityPage() {
  const { isAuthenticated, loading, login } = useAuth();
  const [overview, setOverview] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState('');

  const loadSecurityData = async () => {
    setIsRefreshing(true);
    setError('');
    try {
      const [overviewRes, recommendationRes, sessionsRes, auditRes] = await Promise.all([
        axios.get(`${API_URL}/api/security/overview`, { withCredentials: true }),
        axios.get(`${API_URL}/api/security/recommendations`, { withCredentials: true }),
        axios.get(`${API_URL}/api/security/sessions`, { withCredentials: true }),
        axios.get(`${API_URL}/api/security/audit-trail`, { withCredentials: true })
      ]);

      setOverview(overviewRes.data);
      setRecommendations(recommendationRes.data.recommendations || []);
      setSessions(sessionsRes.data.sessions || []);
      setAuditLogs(auditRes.data.logs || []);
    } catch (err) {
      console.error('Failed to load security center:', err);
      setError('Security Center could not load right now. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      getCsrfToken().catch(() => {});
      loadSecurityData();
    }
  }, [isAuthenticated]);

  const posture = overview?.posture || {};
  const recentEvents = overview?.recentEvents || [];
  const incidents = overview?.incidents || [];

  const headline = useMemo(() => {
    const risk = String(posture.risk_level || 'normal');
    if (risk === 'critical' || risk === 'high') return 'Security attention recommended';
    if (risk === 'guarded') return 'Security posture is stable but watchful';
    return 'Account protection is operating normally';
  }, [posture.risk_level]);

  const revokeOtherSessions = async () => {
    setIsRevoking(true);
    setError('');
    try {
      await csrfPost(`${API_URL}/api/security/sessions/revoke-others`);
      await loadSecurityData();
    } catch (err) {
      console.error('Failed to revoke sessions:', err);
      setError('Could not revoke other sessions. Please try again.');
    } finally {
      setIsRevoking(false);
    }
  };

  const resolveIncident = async (incidentId) => {
    try {
      await csrfPost(`${API_URL}/api/security/incidents/${incidentId}/resolve`, { note: 'Reviewed in Security Center' });
      await loadSecurityData();
    } catch (err) {
      console.error('Failed to resolve incident:', err);
      setError('Could not resolve the incident right now.');
    }
  };

  if (!isAuthenticated && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <ShieldCheck size={48} className="text-primary mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Security Center Requires Login</h2>
        <p className="text-slate-500 mb-8">Sign in with Instagram to review sessions, incidents, and audit history.</p>
        <button onClick={login} className="btn-indigo">Continue with Instagram</button>
      </div>
    );
  }

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar />
      <BottomNav />

      <main className="flex-1 md:ml-64 p-6 md:p-10 pb-24 md:pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Security Center</p>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">GoLink Shield</h1>
            <p className="text-slate-500 mt-2">{headline}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadSecurityData} disabled={isRefreshing} className="btn-ghost flex items-center gap-2">
              <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button onClick={revokeOtherSessions} disabled={isRevoking} className="btn-indigo flex items-center gap-2">
              <Lock size={16} />
              {isRevoking ? 'Revoking...' : 'Revoke Other Sessions'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="bento-card border-rose-200 bg-rose-50 text-rose-700 mb-6">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bento-card">
            <div className="icon-box bg-indigo-50 text-primary mb-4"><ShieldCheck size={20} /></div>
            <p className="text-slate-500 text-sm">Risk Level</p>
            <h2 className="text-2xl font-black text-slate-800 mt-1 capitalize">{posture.risk_level || 'normal'}</h2>
          </div>
          <div className="bento-card">
            <div className="icon-box bg-amber-50 text-amber-600 mb-4"><ShieldAlert size={20} /></div>
            <p className="text-slate-500 text-sm">Suspicious Requests</p>
            <h2 className="text-2xl font-black text-slate-800 mt-1">{posture.suspicious_request_count || 0}</h2>
          </div>
          <div className="bento-card">
            <div className="icon-box bg-rose-50 text-rose-600 mb-4"><AlertTriangle size={20} /></div>
            <p className="text-slate-500 text-sm">Blocked Requests</p>
            <h2 className="text-2xl font-black text-slate-800 mt-1">{posture.blocked_request_count || 0}</h2>
          </div>
          <div className="bento-card">
            <div className="icon-box bg-emerald-50 text-emerald-600 mb-4"><UserCheck size={20} /></div>
            <p className="text-slate-500 text-sm">Compromise Signals</p>
            <h2 className="text-2xl font-black text-slate-800 mt-1">{posture.compromised_signals || 0}</h2>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6 mb-6">
          <div className="bento-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-slate-800 font-bold">Open Incidents</h3>
                <p className="text-sm text-slate-500">Review and resolve risky account activity.</p>
              </div>
            </div>

            <div className="space-y-4">
              {incidents.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm">
                  No open incidents right now. The undercover security agent has not raised any customer-facing alerts.
                </div>
              ) : incidents.map((incident) => (
                <div key={incident.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${severityTone(incident.severity)}`}>
                          {incident.severity}
                        </span>
                        <span className="text-xs text-slate-400">Risk {incident.risk_score}</span>
                      </div>
                      <h4 className="font-bold text-slate-800 capitalize">{String(incident.category || '').replace(/-/g, ' ')}</h4>
                      <p className="text-sm text-slate-500 mt-1">{incident.summary}</p>
                      <p className="text-xs text-slate-400 mt-2">{formatDate(incident.created_at)}</p>
                    </div>
                    <button onClick={() => resolveIncident(incident.id)} className="btn-ghost text-primary">
                      Mark Resolved
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bento-card">
            <h3 className="text-slate-800 font-bold mb-2">Recommended Actions</h3>
            <p className="text-sm text-slate-500 mb-5">Use these next steps to keep the account protected.</p>
            <div className="space-y-3">
              {recommendations.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-xl border border-slate-200 p-4 flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-emerald-500 mt-0.5" />
                  <p className="text-sm text-slate-600">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          <div className="bento-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-slate-800 font-bold">Active Sessions</h3>
                <p className="text-sm text-slate-500">Review where your account is currently signed in.</p>
              </div>
            </div>

            <div className="space-y-4">
              {sessions.map((session) => (
                <div key={session.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Fingerprint size={16} className="text-primary" />
                      <span className="font-semibold text-slate-800">{session.isCurrent ? 'Current session' : 'Active session'}</span>
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${session.revokedAt ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {session.revokedAt ? 'Revoked' : 'Live'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-800">IP:</span> {session.ipAddress || 'Unknown'}</p>
                    <p><span className="font-semibold text-slate-800">Last seen:</span> {formatDate(session.lastSeenAt)}</p>
                    <p><span className="font-semibold text-slate-800">Expires:</span> {formatDate(session.expiresAt)}</p>
                    <p className="truncate"><span className="font-semibold text-slate-800">Agent:</span> {session.userAgent || 'Unknown user agent'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bento-card">
            <h3 className="text-slate-800 font-bold mb-5">Recent Threat Events</h3>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {recentEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-800 capitalize">{String(event.event_type || '').replace(/[:_-]/g, ' ')}</p>
                      <p className="text-xs text-slate-400 mt-1">{formatDate(event.created_at)}</p>
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${severityTone(event.severity)}`}>
                      {event.severity}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-3">Risk score: {event.risk_score}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bento-card">
          <div className="flex items-center gap-2 mb-5">
            <Clock3 size={18} className="text-primary" />
            <h3 className="text-slate-800 font-bold">Audit Trail</h3>
          </div>
          <div className="space-y-3">
            {auditLogs.length === 0 ? (
              <p className="text-sm text-slate-500">No audit history has been recorded yet.</p>
            ) : auditLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{log.action}</p>
                  <p className="text-sm text-slate-500 mt-1">Actor: {log.actor_type}</p>
                </div>
                <p className="text-xs text-slate-400">{formatDate(log.created_at)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
