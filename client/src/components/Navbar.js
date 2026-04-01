'use client';
import React from 'react';
import { Zap } from 'lucide-react';
import { Instagram } from './Icons';

const Navbar = ({ onConnect, isConnected }) => {
  return (
    <nav className="glass sticky-top">
      <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="gradient-bg" style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={24} color="white" />
          </div>
          <h1 className="gradient-text" style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px' }}>GoLink IG</h1>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--card-border)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Connected</span>
            </div>
          ) : (
            <button className="btn-primary" onClick={onConnect} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Instagram size={18} />
              Connect Instagram
            </button>
          )}
        </div>
      </div>
      <style jsx>{`
        .sticky-top {
          position: sticky;
          top: 0;
          z-index: 100;
        }
      `}</style>
    </nav>
  );
};

export default Navbar;
