import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Button, Alert } from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DriverRideInProgress = ({ route, navigation }) => {
  const { ride } = route.params;
  const [driverLocation, setDriverLocation] = useState(null);

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;

      const location = await Location.getCurrentPositionAsync({});
      setDriverLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    };

    getLocation();
    const interval = setInterval(getLocation, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStartRide = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      await axios.put(
        `http://192.168.0.254:4000/api/rides/status/${ride._id}`,
        { status: "en_curso" },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      Alert.alert("Éxito", "Viaje iniciado correctamente");
    } catch (err) {
      console.error("Error al iniciar el viaje:", err);
      Alert.alert("Error", err.response?.data?.message || "No se pudo iniciar el viaje");
    }
  };

  return (
    <View style={styles.container}>
      {driverLocation ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker
            coordinate={driverLocation}
            title="Tú (conductor)"
            pinColor="blue"
          />
          {ride.origin && (
            <Marker
              coordinate={{
                latitude: ride.origin.lat,
                longitude: ride.origin.lng,
              }}
              title="Origen del pasajero"
              pinColor="green"
            />
          )}
        </MapView>
      ) : (
        <Text>Obteniendo tu ubicación...</Text>
      )}
      <View style={styles.buttonContainer}>
        <Button title="Iniciar viaje" onPress={handleStartRide} />
      </View>
    </View>
  );
};

export default DriverRideInProgress;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  buttonContainer: {
    padding: 15,
    backgroundColor: "#fff",
  },
});
