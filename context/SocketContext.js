// context/SocketContext.js
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../utils/config';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const { user, isAuthenticated, isLoading } = useAuth();
    const [socket, setSocket] = useState(null);
    const socketRef = useRef(null);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        // Si ya hay un socket y está conectado y autenticado con el token correcto, no hacer nada.
        if (socketRef.current && socketRef.current.connected && socketRef.current.auth?.token === user?.token) {
            console.log('✅ Socket ya conectado y autenticado.');
            return;
        }

        // Si el usuario está autenticado y tiene un token, intenta conectar o reconectar el socket.
        if (isAuthenticated && user?.token) {
            console.log('Attempting to connect socket...');
            const newSocket = io(SOCKET_URL, {
                autoConnect: true,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                auth: {
                    token: user.token,
                },
            });

            newSocket.on('connect', () => {
                console.log('⚡ Socket conectado al servidor. ID:', newSocket.id);
                // --- ¡¡¡NUEVA LÍNEA CLAVE AQUÍ!!! ---
                // Emitir un evento para que el servidor una este socket a una sala con el ID del usuario
                if (user?.id) { // Asegúrate de que user.id esté disponible
                    newSocket.emit('join', user.id);
                    console.log(`Sending join_user_room event for userId: ${user.id}`);
                }
                // -------------------------------------
            });

            newSocket.on('disconnect', (reason) => {
                console.log('🔌 Socket desconectado:', reason);
            });

            newSocket.on('connect_error', (error) => {
                console.error('❌ Error de conexión del socket:', error.message);
                if (error.message === 'Authentication error') {
                    console.log('Token de socket inválido. Desconectando y sugiriendo re-login.');
                    newSocket.disconnect();
                }
            });

            setSocket(newSocket);
            socketRef.current = newSocket;

        } else if (!isAuthenticated && socketRef.current && socketRef.current.connected) {
            // Si el usuario no está autenticado y hay un socket conectado, desconéctalo
            console.log('Desconectando socket: Usuario no autenticado.');
            socketRef.current.disconnect();
            setSocket(null);
            socketRef.current = null;
        }

        return () => {
            if (socketRef.current) {
                console.log('Cerrando conexión de socket en limpieza de efecto...');
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
            }
        };
    }, [isAuthenticated, user?.token, user?.id, isLoading]); // Añadir user.id a las dependencias

    const socketContextValue = {
        socket,
    };

    return (
        <SocketContext.Provider value={socketContextValue}>
            {children}
        </SocketContext.Provider>
    );
};