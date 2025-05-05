import React, { useEffect } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import * as Location from "expo-location";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DriverTrackingScreen = () => {
  useEffect(() => {
    const startTracking = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permisos denegados", "No se puede obtener la ubicación.");
        return;
      }

      const stored = await AsyncStorage.getItem("user");
      if (!stored) return;
      const data = JSON.parse(stored);

      const sendLocation = async () => {
        let location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;

        try {
          await axios.post(
            "http://192.168.0.8:4000/api/location/update",
            { latitude, longitude },
            {
              headers: {
                Authorization: `Bearer ${data.token}`
              }
            }
          );
          console.log("Ubicación enviada:", latitude, longitude);
        } catch (err) {
          console.error("Error al enviar ubicación:", err.message);
        }
      };

      // Enviar ubicación cada 10 segundos
      sendLocation(); // enviar inmediatamente
      const interval = setInterval(sendLocation, 10000);

      return () => clearInterval(interval); // limpiar si el componente se desmonta
    };

    startTracking();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>🚗 Compartiendo ubicación en tiempo real...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 18, fontWeight: "bold" }
});

export default DriverTrackingScreen;
