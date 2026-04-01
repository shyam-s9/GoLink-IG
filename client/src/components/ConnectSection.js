'use client';
import React from 'react';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { Instagram } from './Icons';
import { motion } from 'framer-motion';

const ConnectSection = ({ onConnect }) => {
  return (
    <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--primary)', letterSpacing: '1px', textTransform: 'uppercase' }}>
          Automate your reach
        </span>
        <h2 style={{ fontSize: '48px', fontWeight: '900', margin: '16px 0 24px' }}>
          Connect <span className="gradient-text">Instagram</span> to Start
        </h2>
        <p style={{ fontSize: '18px', color: '#94a3b8', maxWidth: '600px', margin: '0 auto 40px' }}>
          Link your professional account to automate DMs, boost engagement, and deliver affiliate links instantly to your commenters.
        </p>
        
        <button className="btn-primary" onClick={onConnect} style={{ fontSize: '18px', padding: '16px 40px', borderRadius: '14px' }}>
          Get Started Now
          <ArrowRight size={20} style={{ marginLeft: '12px' }} />
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '64px' }}>
          <div className="feature">
            <ShieldCheck size={24} color="var(--primary)" />
            <span>Secure OAuth</span>
          </div>
          <div className="feature">
            <Zap size={24} color="var(--accent)" />
            <span>Instant DM</span>
          </div>
          <div className="feature">
            <Instagram size={24} color="var(--secondary)" />
            <span>Multi-Tenant</span>
          </div>
        </div>
      </motion.div>
      
      <style jsx>{`
        .feature {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #94a3b8;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};

export default ConnectSection;
