import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import axios from "axios";

const RideInProgressScreen = ({ route }) => {
  const { ride } = route.params;
  const [driverLocation, setDriverLocation] = useState(null);

  const origin = ride.origin;
  const destination = ride.destination;
  const driverId = ride._id; // depende de cómo lo tengas

  const fetchDriverLocation = async () => {
    try {
      const res = await axios.get(
        `http://192.168.0.254:4000/api/location/${driverId}`
      );
      setDriverLocation(res.data.coords);
    } catch (err) {
      console.error("Error al obtener ubicación del conductor:", err.message);
    }
  };

  // Polling para obtener la ubicación del conductor cada 5 segundos
  useEffect(() => {
    let intervalId;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Permiso de ubicación denegado");
        return;
      }

      const token = await AsyncStorage.getItem("token");

      intervalId = setInterval(async () => {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation(location.coords);

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
      }, 10000); // cada 10 segundos
    };

    startTracking();

    return () => clearInterval(intervalId); // limpiar cuando se desmonte
  }, []);

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});

export default RideInProgressScreen;
