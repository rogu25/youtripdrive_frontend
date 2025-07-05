// context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from '../utils/config.js'; // Importaremos esto en un paso posterior (config.js)
// Asegúrate de que tengas una configuración similar para tu backend base URL.

// Creamos el contexto de autenticación
const AuthContext = createContext();

// Hook personalizado para consumir el contexto de autenticación fácilmente
export const useAuth = () => {
  return useContext(AuthContext);
};

// Proveedor del contexto de autenticación
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Almacena { token, userId, role, name, email }
  const [isLoading, setIsLoading] = useState(true); // Para el estado de carga inicial

  // Efecto para cargar el usuario desde AsyncStorage al iniciar la app
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          setUser(userData);
        }
      } catch (error) {
        console.error("Error cargando usuario desde AsyncStorage:", error);
        // Podrías decidir limpiar AsyncStorage aquí si hay un error de parseo, por ejemplo
        await AsyncStorage.removeItem("user");
      } finally {
        setIsLoading(false); // La carga inicial ha terminado
      }
    };

    loadUser();
  }, []);

  // Función para iniciar sesión
  const signIn = async (token, userData) => {
    // userData debe contener al menos { userId, role, name, email }
    try {
      const fullUserData = { ...userData, token };
      await AsyncStorage.setItem("user", JSON.stringify(fullUserData));
      setUser(fullUserData);
      return true; // Éxito
    } catch (error) {
      console.error("Error al guardar usuario en AsyncStorage:", error);
      return false; // Fallo
    }
  };

  // Función para cerrar sesión
  const signOut = async () => {
    try {
      await AsyncStorage.removeItem("user");
      setUser(null); // Limpiar el estado del usuario
      // IMPORTANTE: Aquí también deberías desconectar el socket si está conectado
      // Esto lo haremos en SocketContext, pero es un punto a recordar.
      return true; // Éxito
    } catch (error) {
      console.error("Error al remover usuario de AsyncStorage:", error);
      return false; // Fallo
    }
  };

  // Puedes añadir una función para actualizar el token si expira
  // const refreshToken = async () => { ... }

  // Valor que será provisto a los componentes que consuman este contexto
  const authContextValue = {
    user, // El objeto user (contiene token, userId, role, name, etc.)
    isAuthenticated: !!user?.token, // true si hay un token y user no es null
    isLoading, // Estado de carga inicial
    signIn, // Función para iniciar sesión
    signOut, // Función para cerrar sesión
    // ... otras funciones como refreshToken
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};