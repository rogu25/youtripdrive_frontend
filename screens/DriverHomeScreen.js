import React, { useEffect, useState, useRef } from "react";
import { View, Text, FlatList, Button, StyleSheet, Alert } from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

export default function DriverHomeScreen({ navigation }) {
  const [rides, setRides] = useState([]);
  const locationSubscription = useRef(null);

  const fetchRides = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      console.log("MI TOKEN: ", token)
      const res = await axios.get(
        "http://192.168.0.254:4000/api/rides/available",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Filtramos los que tengan origin válido
      const validRides = res.data.filter(
        (ride) => ride.origin && ride.origin.lat && ride.origin.lng
      );

      setRides(validRides);
    } catch (err) {
      console.error("Error al obtener viajes frontend:", err.message);
    }
  };

  const acceptRide = async (rideId, dataRide) => {
    try {
      const token = await AsyncStorage.getItem("token");
      
      // 1. Aceptar el viaje
      await axios.put(
        `http://192.168.0.254:4000/api/rides/accept/${rideId}`,
        { price_accepted: 5000 },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log("mi token: ", token)
      // 2. Obtener el viaje actualizado desde el backend
      const updatedRes = await axios.get(
        `http://192.168.0.254:4000/api/rides/getRidesById/${rideId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("lo que contiene update: ", dataRide)

      const updatedRide = updatedRes.data;

      Alert.alert("Viaje aceptado", "Redirigiendo al mapa...");

      // 3. Navegar con el viaje actualizado
      navigation.navigate("RideInProgressScreen", { ride: updatedRide });
    } catch (err) {
      console.error("Error al aceptar viaje:", err.message);
      Alert.alert("Error", "No se pudo aceptar el viaje.");
    }
  };

  const handleLogoutDRIVERS = async () => {
    await AsyncStorage.removeItem("user");
    navigation.replace("Login");
  };

  const startLocationTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso denegado", "No podemos rastrear tu ubicación.");
      return;
    }

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000, // cada 5 segundos
        distanceInterval: 10, // o cada 10 metros
      },
      async (location) => {
        const { latitude, longitude } = location.coords;
        

        // Enviar al backend
        try {
          const token = await AsyncStorage.getItem("token");
          
          await axios.post(
            "http://192.168.0.254:4000/api/location/update",
            { lat: latitude, lng: longitude },
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
        } catch (err) {
          console.error("Error actualizando ubicación:", err.message);
        }
      }
    );
  };

  useEffect(() => {
    fetchRides();
    startLocationTracking();

    return () => {
      // Limpiar el seguimiento al desmontar la pantalla
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, []);

  const renderRide = ({ item }) => (
    <View style={styles.card}>
      <Text>
        Origen:{" "}
        {item.origin && item.origin.lat && item.origin.lng
          ? `lat: ${item.origin.lat}, lng: ${item.origin.lng}`
          : "Ubicación no disponible"}
      </Text>

      <Text>Destino: {item.destination || "No especificado"}</Text>
      <Text>Ofrecido: ${item.price_offered || "0"}</Text>
      <Button title="Aceptar" onPress={() => acceptRide(item._id, item)} />
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Solicitudes de viaje</Text>
      <FlatList
        data={rides}
        keyExtractor={(item) => item._id}
        renderItem={renderRide}
        ListEmptyComponent={<Text>No hay solicitudes por ahora.</Text>}
      />
      <Button title="Aceptar" onPress={() => fetchRides()} />
      <Button title="Cerrar sesión" onPress={handleLogoutDRIVERS} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, marginBottom: 10, fontWeight: "bold" },
  card: {
    padding: 15,
    marginVertical: 10,
    backgroundColor: "#eee",
    borderRadius: 8,
  },
});
