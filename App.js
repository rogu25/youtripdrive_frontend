import React, { useEffect, useState, useCallback } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

// Importaciones de Contexto
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";

// Pantallas
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
import RideChatScreen from "./screens/RideChatScreen";

const Stack = createNativeStackNavigator();

SplashScreen.preventAutoHideAsync();

// Componente que decide la ruta inicial basada en el estado de autenticación y rol
const RootNavigator = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00f0ff" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        user?.role === "conductor" ? (
          <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
        ) : (
          <Stack.Screen name="PassengerHome" component={PassengerHomeScreen} />
        )
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          {/* Puedes añadir rutas como "olvidé contraseña" aquí si las tienes */}
        </>
      )}
      {/*
        Estas rutas están aquí para que el Stack.Navigator las conozca
        y se pueda navegar a ellas desde cualquier lugar dentro de este stack.
      */}
      <Stack.Screen
        name="PassengerHomeScreen"
        component={PassengerHomeScreen}
      />
      <Stack.Screen
        name="WaitingForDriverScreen"
        component={WaitingForDriverScreen}
      />
      <Stack.Screen
        name="PassengerRideInProgress"
        component={PassengerRideInProgress}
      />
      <Stack.Screen
        name="AvailableRidesScreen"
        component={AvailableRidesScreen}
      />
      <Stack.Screen
        name="RideInProgressDriverScreen"
        component={RideInProgressDriverScreen}
      />
      <Stack.Screen name="RideChat" component={RideChatScreen} />
      <Stack.Screen name="Rides" component={RideListScreen} />
    </Stack.Navigator>
  );
};

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  const prepareApp = useCallback(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (e) {
      console.warn(e);
    } finally {
      setAppIsReady(true);
    }
  }, []);

  useEffect(() => {
    prepareApp();
  }, [prepareApp]);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return (
      <View style={styles.container} onLayout={onLayoutRootView}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayoutRootView}>
      <AuthProvider>
        <SocketProvider>
          <NavigationContainer>
            {/* Asegúrate de que no haya ningún espacio en blanco o comentario no JSX aquí */}
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Splash" component={SplashScreenAnimated} />
              {/* La pantalla 'Root' usará el componente RootNavigator para manejar la navegación condicional */}
              <Stack.Screen name="Root" component={RootNavigator} />
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
