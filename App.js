import React, { useEffect, useState, useCallback } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

// Importaciones de Contexto
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";

// Screens
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import PassengerHomeScreen from "./screens/PassengerHomeScreen";
import DriverHomeScreen from "./screens/DriverHomeScreen";
import RideListScreen from "./screens/RideListScreen";
import SplashScreenAnimated from "./screens/SplashScreenAnimated";
import PassengerRideInProgress from "./screens/PassengerRideInProgress";
import WaitingForDriverScreen from "./screens/WaitingForDriverScreen";
import AvailableRidesScreen from "./screens/AvailableRidesScreen";
import RideInProgressDriverScreen from "./screens/RideInProgressDriverScreen";
import RideChatScreen from "./screens/RideChatScreen"; // Asegúrate de que esta sea la pantalla de chat correcta


const Stack = createNativeStackNavigator();

SplashScreen.preventAutoHideAsync(); // Evita que el splash desaparezca automáticamente

export default function App() {
  const [initialRoute, setInitialRoute] = useState("Splash");
  const [appIsReady, setAppIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);

  // Función para preparar los assets y la lógica de inicio
  const prepare = useCallback(async () => {
    try {
      // Simula un retraso para ver el splash screen
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Lógica de carga del usuario y determinación de la ruta inicial
      const storedUser = await AsyncStorage.getItem("user");
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        setIsAuthenticated(true);
        setUserRole(userData.role);
        // Determina la ruta inicial basada en el rol si ya está autenticado
        if (userData.role === 'passenger') {
            setInitialRoute("PassengerHome");
        } else if (userData.role === 'driver') {
            setInitialRoute("DriverHome");
        } else {
            setInitialRoute("Login"); // Fallback si el rol no es reconocido
        }
      } else {
        setIsAuthenticated(false);
        setUserRole(null);
        setInitialRoute("Login"); // Si no hay usuario, ir a Login
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setAppIsReady(true);
    }
  }, []);

  useEffect(() => {
    prepare();
  }, [prepare]);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  // Si la aplicación aún no está lista, muestra un indicador de carga
  if (!appIsReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <StatusBar style="light" />
      </View>
    );
  }

  // Contenedor principal de la aplicación con la barra de estado configurada
  return (
    <View style={styles.container} onLayout={onLayoutRootView}>
      {/* AuthProvider y SocketProvider envolverán NavigationContainer para acceso global */}
      <AuthProvider
        isAuthenticated={isAuthenticated}
        userRole={userRole}
        setIsAuthenticated={setIsAuthenticated}
        setUserRole={setUserRole}
      >
        <SocketProvider>
          {/* ELIMINADO: El espacio en blanco que causaba el error */}
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName={initialRoute}
              screenOptions={{ headerShown: false }}
            >
              <Stack.Screen name="Splash" component={SplashScreenAnimated} />
              {/* Autenticación */}
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              {/* Home Screens */}
              <Stack.Screen name="PassengerHomeScreen" component={PassengerHomeScreen} />
              <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
              {/* Ride Screens */}
              <Stack.Screen name="Rides" component={RideListScreen} />
              <Stack.Screen name="PassengerRideInProgress" component={PassengerRideInProgress} />
              <Stack.Screen name="WaitingForDriverScreen" component={WaitingForDriverScreen} />
              <Stack.Screen name="AvailableRidesScreen" component={AvailableRidesScreen} />
              <Stack.Screen name="RideInProgressDriverScreen" component={RideInProgressDriverScreen} />
              <Stack.Screen name="RideChat" component={RideChatScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SocketProvider>
      </AuthProvider>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0f1c",
  },
  container: {
    flex: 1,
  },
});