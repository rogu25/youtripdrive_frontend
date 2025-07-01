// AuthLoadingScreen.js
import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AuthLoadingScreen = ({ navigation }) => {
  useEffect(() => {
    const checkLogin = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const userStr = await AsyncStorage.getItem("user");

        if (token && userStr) {
          const user = JSON.parse(userStr);
          if (user.role === "pasajero") {
            navigation.replace("PassengerHome");
          } else if (user.role === "conductor") {
            navigation.replace("DriverHomeScreen");
          } else {
            navigation.replace("Login");
          }
        } else {
          navigation.replace("Login");
        }
      } catch (error) {
        console.error("Error al verificar sesión:", error);
        navigation.replace("Login");
      }
    };

    checkLogin();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#00f0ff" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0f1c",
  },
});

export default AuthLoadingScreen;
