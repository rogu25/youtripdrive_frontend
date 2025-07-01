import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const WaitingForDriverScreen = ({ navigation, route }) => {
  const { ride } = route.params;
  const [status, setStatus] = useState(ride.status);

  useEffect(() => {
    const interval = setInterval(() => {
      checkRideStatus();
    }, 5000); // cada 5 segundos

    return () => clearInterval(interval);
  }, []);

  const checkRideStatus = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await axios.get(
        "http://192.168.0.254:4000/api/rides/active",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const updatedRide = res.data;
      
      setStatus(updatedRide.status);

      if (
        updatedRide.status?.trim() === "aceptado" ||
        updatedRide.status?.trim() === "en_curso"
      ) {
        navigation.replace("PassengerRideInProgress", { ride: updatedRide });
      }
    } catch (err) {
      console.error("Error al verificar estado del viaje:", err.message);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 20 }}>Buscando conductor...</Text>
    </View>
  );
};

export default WaitingForDriverScreen;
