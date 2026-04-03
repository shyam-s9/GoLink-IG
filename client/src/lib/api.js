const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || browserOrigin || 'http://localhost:3001';
