import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PassengerRideInProgress = ({ route }) => {
  const { rideId } = route.params;
  const [driverLocation, setDriverLocation] = useState(null);

  useEffect(() => {
    const fetchDriverLocation = async () => {
      try {
        const token = await AsyncStorage.getItem("token");

        const response = await axios.get(
          "http://192.168.0.254:4000/api/rides/active",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const location = response.data.driverLocation;
        if (location?.coordinates?.length === 2) {
          setDriverLocation({
            latitude: location.coordinates[1],
            longitude: location.coordinates[0],
          });
        }
      } catch (err) {
        console.error("Error obteniendo ubicación del conductor:", err.message);
      }
    };

    fetchDriverLocation(); // llamada inicial

    const interval = setInterval(fetchDriverLocation, 5000); // cada 5 segundos

    return () => clearInterval(interval);
  }, []);

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
            title="Tu conductor"
            pinColor="blue"
          />
        </MapView>
      ) : (
        <Text>Cargando ubicación del conductor...</Text>
      )}
    </View>
  );
};

export default PassengerRideInProgress;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
