import React, { useEffect, useState, useCallback } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, View, StyleSheet, Text } from "react-native"; // <-- Ensure Text is imported
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

const AppNavigator = () => {
  // Directly consume the state from AuthContext
  const { user, isAuthenticated, loading } = useAuth(); // Removed checkAuthStatus from destructuring as it's not needed here

  // --- REMOVE THIS ENTIRE useEffect BLOCK ---
  // useEffect(() => {
  //   if (!isAuthenticated && !user && !loading) {
  //     checkAuthStatus();
  //   }
  // }, [isAuthenticated, user, loading, checkAuthStatus]);
  // ------------------------------------------

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
          <React.Fragment>
            <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
            <Stack.Screen name="AvailableRidesScreen" component={AvailableRidesScreen} />
            <Stack.Screen name="RideInProgressDriverScreen" component={RideInProgressDriverScreen} />
            <Stack.Screen name="RideListScreen" component={RideListScreen} />
            <Stack.Screen name="RideChat" component={RideChatScreen} />
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Stack.Screen name="PassengerHome" component={PassengerHomeScreen} />
            <Stack.Screen name="WaitingForDriverScreen" component={WaitingForDriverScreen} />
            <Stack.Screen name="PassengerRideInProgress" component={PassengerRideInProgress} />
            <Stack.Screen name="RideChat" component={RideChatScreen} />
            <Stack.Screen name="Rides" component={RideListScreen} />
          </React.Fragment>
        )
      ) : (
        <React.Fragment>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </React.Fragment>
      )}
    </Stack.Navigator>
  );
};

export default function App() {
  const [initialLoadingComplete, setInitialLoadingComplete] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn(e);
      } finally {
        setInitialLoadingComplete(true);
        SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  if (!initialLoadingComplete) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <SplashScreenAnimated />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <AuthProvider>
        <SocketProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </SocketProvider>
      </AuthProvider>
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