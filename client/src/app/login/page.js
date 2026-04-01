'use client';
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Zap, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
    const { login } = useAuth();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-200 mb-8 animate-bounce">
                <Zap size={32} color="white" />
            </div>
            
            <h1 className="text-4xl font-black text-slate-800 tracking-tight mb-3 italic">Cloud Clarity</h1>
            <p className="text-slate-500 font-medium mb-10 max-w-sm">
                The ultimate EMW AI Agent for Instagram Automation. Secure 15-minute high-performance sessions.
            </p>

            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full max-w-md">
                <button 
                    onClick={login}
                    className="w-full bg-[#1877F2] hover:bg-[#166fe5] text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-100"
                >
                    <img src="https://www.facebook.com/images/fb_icon_325x325.png" alt="FB" className="w-6 h-6 rounded" />
                    Continue with Instagram
                </button>
                
                <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-widest">
                    <ShieldCheck size={14} />
                    Secured by EMW SHIELD
                </div>
            </div>

            <p className="mt-12 text-slate-400 text-[10px] font-bold uppercase tracking-tighter">
                Extreme Media World © 2026 • Privacy Policy • Terms of Service
            </p>
        </div>
    );
}
