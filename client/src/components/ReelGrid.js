'use client';
import React from 'react';
import ReelCard from './ReelCard';
import { LayoutGrid } from 'lucide-react';

const ReelGrid = ({ reels, onSave }) => {
  return (
    <div className="container" style={{ padding: '40px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <LayoutGrid size={24} color="var(--primary)" />
        <h3 style={{ fontSize: '24px', fontWeight: '700' }}>Your Recent Reels</h3>
      </div>
      
      <div className="reel-grid">
        {reels.map(reel => (
          <ReelCard key={reel.id} reel={reel} onSave={onSave} />
        ))}
      </div>

      <style jsx>{`
        .reel-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 32px;
        }
      `}</style>
    </div>
  );
};

export default ReelGrid;
