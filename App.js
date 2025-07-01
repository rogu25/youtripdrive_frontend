import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, View } from "react-native";

// Screens
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import PassengerHomeScreen from "./screens/PassengerHomeScreen";
import DriverHomeScreen from "./screens/DriverHomeScreen";
import RideListScreen from "./screens/RideListScreen";
import RideInProgressScreen from "./screens/RideInProgressScreen";
import SplashScreenAnimated from "./screens/SplashScreenAnimated";
import AuthLoadingScreen from "./screens/AuthLoadingScreen";
import PassengerRideInProgress from "./screens/PassengerRideInProgress";
import WaitingForDriverScreen from "./screens/WaitingForDriverScreen";
import AvailableRidesScreen from "./screens/AvailableRidesScreen";
import DriverRideInProgress from "./screens/DriverRideInProgress";
import RideChat from "./components/RideChat";

const Stack = createNativeStackNavigator();

SplashScreen.preventAutoHideAsync(); // Evita que el splash desaparezca automáticamente

export default function App() {
  const [initialScreen, setInitialScreen] = useState(null);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const prepareApp = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");

        if (storedUser) {
          const userData = JSON.parse(storedUser);

          if (userData.role === "pasajero") {
            setInitialScreen("PassengerHome");
          } else if (userData.role === "conductor") {
            setInitialScreen("DriverHomeScreen");
          } else {
            setInitialScreen("Login");
          }
        } else {
          setInitialScreen("Login");
        }
      } catch (error) {
        console.error("Error cargando usuario:", error);
        setInitialScreen("Login");
      } finally {
        setAppReady(true);
        await SplashScreen.hideAsync();
      }
    };

    prepareApp();
  }, []);

  if (!appReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0a0f1c" }}>
        <ActivityIndicator size="large" color="#00f0ff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialScreen}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Splash" component={SplashScreenAnimated} />
        <Stack.Screen name="AuthLoading" component={AuthLoadingScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="PassengerHome" component={PassengerHomeScreen} />
        <Stack.Screen name="DriverHomeScreen" component={DriverHomeScreen} />
        <Stack.Screen name="Rides" component={RideListScreen} />
        <Stack.Screen name="RideInProgressScreen" component={RideInProgressScreen} />
        <Stack.Screen name="PassengerRideInProgress" component={PassengerRideInProgress} />
        <Stack.Screen name="WaitingForDriverScreen" component={WaitingForDriverScreen} />
        <Stack.Screen name="AvailableRidesScreen" component={AvailableRidesScreen} />
        <Stack.Screen name="DriverRideInProgress" component={DriverRideInProgress} />
        <Stack.Screen name="RideChat" component={RideChat} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
