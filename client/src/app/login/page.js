'use client';
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export default function LoginPage() {
    const { login } = useAuth();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-200 mb-8 animate-bounce">
                <Zap size={32} color="white" />
            </div>

            <h1 className="text-4xl font-black text-slate-800 tracking-tight mb-3 italic">GoLink Auto</h1>
            <p className="text-slate-500 font-medium mb-10 max-w-sm">
                Secure Instagram automation with protected customer sessions, webhook verification, and threat-aware backend controls.
            </p>

            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full max-w-md">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600">
                    Instagram Login for Business
                </div>
                <button
                    onClick={login}
                    className="w-full bg-gradient-to-r from-[#fd5949] via-[#d6249f] to-[#285AEB] text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg"
                >
                    <Zap size={18} />
                    Connect Instagram
                    <ArrowRight size={16} />
                </button>

                <p className="mt-4 text-xs leading-5 text-slate-500">
                    Depending on your Meta app setup, the next screen may appear as Instagram Login or Meta account authorization. Both are normal for Instagram Business permissions.
                </p>

                <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-widest">
                    <ShieldCheck size={14} />
                    Secured by GoLink Shield
                </div>
            </div>

            <p className="mt-12 text-slate-400 text-[10px] font-bold uppercase tracking-tighter">
                GoLink Auto 2026 | Privacy Policy | Terms of Service
            </p>
        </div>
    );
}
