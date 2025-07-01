import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Button, ActivityIndicator } from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AvailableRidesScreen = ({ navigation }) => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRides = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await axios.get("http://192.168.0.254:4000/api/rides/available", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setRides(res.data);
    } catch (err) {
      console.error("Error al cargar viajes disponibles:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRide = async (rideId) => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await axios.post(
        `http://192.168.0.254:4000/api/rides/accept/${rideId}`,
        { price_accepted: 10 }, // Por ahora fijo
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("Viaje aceptado:", res.data);

      // Redirigir a pantalla de viaje en curso
      navigation.replace("DriverRideInProgress", { ride: res.data.ride });
    } catch (err) {
      console.error("Error al aceptar viaje:", err.message);
    }
  };

  useEffect(() => {
    fetchRides();
  }, []);

  if (loading) return <ActivityIndicator size="large" color="#0000ff" />;

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, marginBottom: 10 }}>Viajes disponibles:</Text>
      <FlatList
        data={rides}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 15, borderBottomWidth: 1, paddingBottom: 10 }}>
            <Text>Pasajero: {item.passenger}</Text>
            <Text>Origen: lat {item.origin.lat}, lng {item.origin.lng}</Text>
            <Button title="Aceptar viaje" onPress={() => handleAcceptRide(item._id)} />
          </View>
        )}
        ListEmptyComponent={<Text>No hay viajes disponibles.</Text>}
      />
    </View>
  );
};

export default AvailableRidesScreen;
