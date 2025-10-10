import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getSessionId } from '../utils/sessionManager';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
    const sessionId = getSessionId();
    console.log('Attempting to connect to:', serverUrl);

    const newSocket = io(serverUrl, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: {
        sessionId
      }
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to server:', serverUrl);
      console.log('Socket ID:', newSocket.id);
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      setConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      console.error('Server URL:', serverUrl);
      setConnected(false);
    });

    newSocket.on('session_restored', (data) => {
      console.log('♻️ Session restored:', data);
    });

    newSocket.on('session_expired', () => {
      console.log('⏰ Session expired - creating new session');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
