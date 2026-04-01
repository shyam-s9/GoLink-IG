'use client';
import React, { useState, useEffect } from 'react';
import { TrendingUp, ShieldAlert, Zap, ArrowUpRight, CheckCircle2 } from 'lucide-react';

export const StatCard = ({ title, value, icon: Icon, trend }) => (
    <div className="bento-card">
        <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-primary">
                <Icon size={20} />
            </div>
            {trend && (
                <div className="flex items-center gap-1 text-xs font-bold text-success bg-emerald-50 px-2 py-1 rounded-full">
                    <TrendingUp size={12} />
                    {trend}
                </div>
            )}
        </div>
        <h3 className="text-slate-500 text-sm font-medium">{title}</h3>
        <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
);

export const SentimentShield = ({ positive: initialPositive, negative: initialNegative, liveUpdate }) => {
    const [stats, setStats] = useState({ positive: initialPositive || 0, negative: initialNegative || 0 });
    const [pulse, setPulse] = useState(false);

    useEffect(() => {
        if (liveUpdate) {
            setStats(prev => ({
                positive: liveUpdate.sentimentLabel !== 'negative' ? prev.positive + 1 : prev.positive,
                negative: liveUpdate.sentimentLabel === 'negative' ? prev.negative + 1 : prev.negative
            }));
            setPulse(true);
            const timer = setTimeout(() => setPulse(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [liveUpdate]);

    const total = stats.positive + stats.negative;
    const positivePercentage = Math.round((stats.positive / total) * 100) || 0;
    const strokeDasharray = 2 * Math.PI * 34;
    const strokeDashoffset = strokeDasharray * (1 - positivePercentage / 100);

    return (
        <div className={`bento-card h-full flex flex-col items-center justify-center text-center transition-all ${pulse ? 'border-primary ring-2 ring-indigo-100' : ''}`}>
            <h3 className="text-slate-600 font-bold mb-6 flex items-center gap-2 self-start uppercase tracking-wider text-xs">
                <ShieldAlert size={16} className="text-indigo-500" />
                Sentiment Shield {pulse && <span className="text-primary animate-pulse text-[10px]">● LIVE</span>}
            </h3>
            
            <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                <svg className="w-full h-full -rotate-90">
                    <circle cx="80" cy="80" r="34" fill="transparent" stroke="#f1f5f9" strokeWidth="8" />
                    <circle 
                        cx="80" cy="80" r="34" fill="transparent" 
                        stroke="var(--primary)" strokeWidth="8" 
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute flex flex-col items-center">
                    <span className="text-3xl font-black text-slate-800">{positivePercentage}%</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Safe Leads</span>
                </div>
            </div>

            <div className="w-full space-y-3">
                <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        <span className="text-slate-600 font-medium tracking-tight">Safe Interactions</span>
                    </div>
                    <span className="font-bold text-slate-800">{stats.positive}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                        <span className="text-slate-600 font-medium tracking-tight">Blocked Trolls</span>
                    </div>
                    <span className="font-bold text-slate-800">{stats.negative}</span>
                </div>
            </div>
        </div>
    );
};

export const LinkTracker = ({ links: initialLinks, liveUpdate }) => {
    const [links, setLinks] = useState(initialLinks || []);

    useEffect(() => {
        if (liveUpdate && liveUpdate.sentimentLabel !== 'negative') {
             const newLink = { 
                handle: liveUpdate.followerIgId, 
                time: 'Just now', 
                keyword: 'Live',
                type: 'Success' 
             };
             setLinks(prev => [newLink, ...prev].slice(0, 5));
        }
    }, [liveUpdate]);

    return (
        <div className="bento-card h-full overflow-hidden flex flex-col">
            <h3 className="text-slate-600 font-bold mb-6 flex items-center gap-2 uppercase tracking-wider text-xs">
                <Zap size={16} className="text-indigo-500" />
                Recent GoLink Pulse
            </h3>
            
            <div className="space-y-4 flex-1 overflow-y-auto">
                {links.map((link, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-50 bg-slate-50/50 animate-in fade-in slide-in-from-top-2 duration-500">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-success">
                                <CheckCircle2 size={16} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-800 leading-tight">@{link.handle}</span>
                                <span className="text-[10px] font-medium text-slate-400">{link.time}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                            {link.keyword}
                            <ArrowUpRight size={12} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
