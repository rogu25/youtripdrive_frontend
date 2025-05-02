import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";

import LoginScreen from "./screens/LoginScreen";
import RideListScreen from "./screens/RideListScreen";
import SplashScreenAnimated from "./screens/SplashScreenAnimated"; // renombramos para evitar conflicto
import RegisterScreen from "./screens/RegisterScreen";
import PassengerHomeScreen from "./screens/PassengerHomeScreen";

const Stack = createNativeStackNavigator();

SplashScreen.preventAutoHideAsync(); // importante

export default function App() {
  const [user, setUser] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [initialScreen, setInitialScreen] = useState(null);

  useEffect(() => {
    const prepareApp = async () => {
      const stored = await AsyncStorage.getItem("user");

      if (stored) {
        const userData = JSON.parse(stored);
        if (userData.user.role === "pasajero") {
          setInitialScreen("PassengerHome");
        } else {
          setInitialScreen("Driver");
        }
      } else {
        setInitialScreen("Login");
      }

      setAppReady(true);
      await SplashScreen.hideAsync(); // 👈 Esconde el splash
    };

    prepareApp();
  }, []);


  if (!initialScreen) return null; // o algún splash mientras carga
  if (!appReady) return null; // espera a que cargue

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialScreen} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreenAnimated} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Rides" component={RideListScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="PassengerHome" component={PassengerHomeScreen} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}
