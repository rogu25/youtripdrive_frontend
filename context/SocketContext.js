// context/SocketContext.js
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../utils/config'; // Importa la URL de tu backend Socket.IO desde config.js
import { useAuth } from './AuthContext'; // Importa el hook de autenticación

// Crea el contexto para el socket
const SocketContext = createContext();

// Hook personalizado para consumir el contexto del socket fácilmente
export const useSocket = () => {
  return useContext(SocketContext);
};

// Proveedor del contexto del socket
export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth(); // Obtén el estado del usuario del AuthContext
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null); // Usamos useRef para mantener la instancia del socket a través de renders

  useEffect(() => {
    // Si la autenticación aún está cargando, no intentes conectar el socket.
    if (isLoading) {
      return;
    }

    // Si el usuario está autenticado y no hay un socket conectado, o si la autenticación cambió
    // y el socket actual no es el correcto para el estado de autenticación.
    if (isAuthenticated && user?.token) {
      // Si ya hay un socket y está conectado y autenticado, no hacer nada.
      // Esta verificación evita reconexiones innecesarias.
      if (socketRef.current && socketRef.current.connected && socketRef.current.auth?.token === user.token) {
        console.log('✅ Socket ya conectado y autenticado.');
        return;
      }

      console.log('Attempting to connect socket...');
      // Conecta el socket, enviando el token JWT en las opciones de autenticación
      const newSocket = io(SOCKET_URL, {
        autoConnect: true, // Conectar automáticamente al crear la instancia
        reconnection: true, // Habilitar reconexión automática
        reconnectionAttempts: 5, // Intentar reconectar 5 veces
        reconnectionDelay: 1000, // Retraso de 1 segundo entre intentos de reconexión
        reconnectionDelayMax: 5000, // Retraso máximo de 5 segundos
        timeout: 20000, // Tiempo de espera antes de considerar que la conexión falló
        auth: {
          token: user.token, // Envía el token JWT para autenticación del socket
        },
      });

      newSocket.on('connect', () => {
        console.log('⚡ Socket conectado al servidor. ID:', newSocket.id);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('🔌 Socket desconectado:', reason);
        // Puedes añadir lógica para reconexión o notificaciones al usuario
      });

      newSocket.on('connect_error', (error) => {
        console.error('❌ Error de conexión del socket:', error.message);
        if (error.message === 'Authentication error') {
          // Si hay un error de autenticación (ej. token inválido/expirado)
          console.log('Token de socket inválido. Desconectando y sugiriendo re-login.');
          newSocket.disconnect(); // Desconecta el socket actual
          // Aquí podrías desencadenar un signOut si el token es definitivamente inválido.
          // signOut(); // Asumiendo que signOut viene del AuthContext y está disponible.
        }
      });

      // Almacena la instancia del socket
      setSocket(newSocket);
      socketRef.current = newSocket; // También actualiza la referencia

    } else if (!isAuthenticated && socketRef.current && socketRef.current.connected) {
      // Si el usuario no está autenticado y hay un socket conectado, desconéctalo
      console.log('Desconectando socket: Usuario no autenticado.');
      socketRef.current.disconnect();
      setSocket(null);
      socketRef.current = null;
    }

    // Función de limpieza para desconectar el socket al desmontar el componente o al cambiar el estado de autenticación
    return () => {
      if (socketRef.current) {
        console.log('Cerrando conexión de socket en limpieza de efecto...');
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null); // Limpiar el estado
      }
    };
  }, [isAuthenticated, user?.token, isLoading]); // Dependencias: reaccionar a cambios en autenticación o token

  // El valor que será provisto a los componentes que consuman este contexto
  const socketContextValue = {
    socket, // La instancia del socket
  };

  return (
    <SocketContext.Provider value={socketContextValue}>
      {children}
    </SocketContext.Provider>
  );
};