'use client';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

export const useSocket = () => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState(null);

    useEffect(() => {
        const socketInstance = io(SOCKET_URL, {
            transports: ['websocket'],
            reconnectionAttempts: 5,
        });

        socketInstance.on('connect', () => {
            setIsConnected(true);
            console.log('[SOCKET]: Connected to server');
        });

        socketInstance.on('sentiment-push', (data) => {
            console.log('[SOCKET]: Received sentiment update', data);
            setLastMessage(data);
        });

        socketInstance.on('disconnect', () => {
            setIsConnected(false);
            console.log('[SOCKET]: Disconnected');
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    return { socket, isConnected, lastMessage };
};
