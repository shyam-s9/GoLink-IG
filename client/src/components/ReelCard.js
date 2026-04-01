'use client';
import React, { useState } from 'react';
import { Play, Link as LinkIcon, Hash, Save, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';

const ReelCard = ({ reel, onSave }) => {
  const [keyword, setKeyword] = useState(reel.trigger_keyword || '');
  const [link, setLink] = useState(reel.affiliate_link || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(reel.id, { keyword, link });
    setIsSaving(false);
  };

  return (
    <motion.div 
      className="card"
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px', aspectRatio: '9/16' }}>
        <img 
          src={reel.thumbnail} 
          alt="Reel Thumbnail" 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
          <Play size={10} style={{ marginRight: '4px' }} />
          Reel
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="icon-badge">
            <Hash size={16} />
          </div>
          <input 
            placeholder="Trigger Keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="icon-badge">
            <LinkIcon size={16} />
          </div>
          <input 
            placeholder="Affiliate Link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '14px' }}>
            <MessageSquare size={14} />
            <span>{reel.total_delivered || 0} Sent</span>
          </div>
          
          <button 
            className="btn-primary" 
            onClick={handleSave} 
            disabled={isSaving}
            style={{ padding: '8px 16px', fontSize: '14px' }}
          >
            {isSaving ? '...' : <Save size={18} />}
          </button>
        </div>
      </div>

      <style jsx>{`
        .icon-badge {
          background: rgba(255,255,255,0.05);
          padding: 10px;
          border-radius: 8px;
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </motion.div>
  );
};

export default ReelCard;
