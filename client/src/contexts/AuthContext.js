'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const router = useRouter();

    const fetchUser = async () => {
        try {
            // This endpoint would be implemented in the backend to return the decoded user
            const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/me`, { withCredentials: true });
            setUser(res.data.user);
            setIsAuthenticated(true);
        } catch (err) {
            setUser(null);
            setIsAuthenticated(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUser();
        // 15-minute refresh logic could be added here
    }, []);

    const login = async () => {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/url`);
        window.location.href = res.data.url;
    };

    const logout = () => {
        // Implementation for clearing cookies/session
        setIsAuthenticated(false);
        setUser(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, loading, isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
