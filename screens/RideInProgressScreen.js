// RideInProgressScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Button,
  Dimensions,
  Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const RideInProgressScreen = ({ route, navigation }) => {
  const { ride } = route.params;
  const [driverLocation, setDriverLocation] = useState(null);
  const [user, setUser] = useState(null);
  const origin = ride.origin;
  const destination = ride.destination;

  useEffect(() => {
    const fetchUser = async () => {
      const userData = await AsyncStorage.getItem("user");
      if (userData) setUser(JSON.parse(userData));
    };

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Permiso de ubicación denegado");
        return;
      }

      const token = await AsyncStorage.getItem("token");

      const intervalId = setInterval(async () => {
        const location = await Location.getCurrentPositionAsync({});
        setDriverLocation(location.coords);

        try {
          await axios.post(
            "http://192.168.0.254:4000/api/location/update",
            {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            },
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
        } catch (err) {
          console.error("Error actualizando ubicación:", err.message);
        }
      }, 5000);

      return () => clearInterval(intervalId);
    };

    fetchUser();
    const cleanup = startTracking();

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  const handleFinishRide = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      await axios.patch(
        `http://192.168.0.254:4000/api/rides/status/${ride._id}`,
        { status: "finalizado" },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      Alert.alert("Viaje finalizado");
      navigation.navigate("PassengerHome"); // o "DriverHome" según el rol
    } catch (err) {
      console.error("Error finalizando viaje:", err.message);
      Alert.alert("Error", "No se pudo finalizar el viaje");
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: origin.lat,
          longitude: origin.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Marker
          coordinate={{ latitude: origin.lat, longitude: origin.lng }}
          title="Origen"
        />
        {destination && (
          <Marker
            coordinate={{
              latitude: destination.lat,
              longitude: destination.lng,
            }}
            title="Destino"
          />
        )}
        {driverLocation && (
          <Marker
            coordinate={{
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
            }}
            title="Conductor"
            pinColor="blue"
          />
        )}
      </MapView>

      <View style={styles.bottomPanel}>
        <Text style={styles.infoText}>
          {user?.role === "conductor"
            ? "Pasajero: " + ride.passenger?.name
            : "Conductor: " + ride.driver?.name}
        </Text>
        <Text style={styles.infoText}>
          Estado: {ride.status?.toUpperCase()}
        </Text>
        {ride.destination && (
          <Text style={styles.infoText}>
            Destino: {ride.destination.address || "Ubicación establecida"}
          </Text>
        )}
        <Button title="Finalizar Viaje" onPress={handleFinishRide} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: {
    flex: 1,
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  bottomPanel: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  infoText: {
    fontSize: 14,
    marginBottom: 8,
  },
});

export default RideInProgressScreen;
