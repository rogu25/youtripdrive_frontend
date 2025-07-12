import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    try {
      setLoading(true);
      const storedUser = await AsyncStorage.getItem('user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
        console.log("Auth Status Checked: User found.", parsedUser.email);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        console.log("Auth Status Checked: No user found.");
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []); // Keep empty dependency array for useCallback

  // --- CHANGE IS HERE ---
  // This useEffect should only run once on component mount.
  // The 'checkAuthStatus' function itself is stable due to useCallback([]).
  // Therefore, including it in the dependency array can cause re-renders
  // if the states it updates cause the parent component to re-render,
  // leading to the useEffect re-executing.
  useEffect(() => {
    checkAuthStatus();
  }, []); // <--- CHANGE: Empty dependency array. This means it runs ONCE on mount.


  const login = async (userData) => {
    try {
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);
      console.log('User logged in:', userData.email, 'Role:', userData.role);
    } catch (error) {
      console.error('Error saving user to AsyncStorage:', error);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('user');
      setUser(null);
      setIsAuthenticated(false);
      console.log('User logged out.');
      // After logout, you might want to force a re-check of auth status
      // to ensure UI consistency, especially if the `App.js` relies on it.
      // Calling it here will trigger the states, but won't cause infinite loop.
      checkAuthStatus(); // <--- Call it here if you need to re-verify the state after logout
    } catch (error) {
      console.error('Error removing user from AsyncStorage:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout, loading, checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);