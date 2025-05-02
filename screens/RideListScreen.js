import React, { useEffect, useState } from "react";
import { View, Text, Button, FlatList, StyleSheet } from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import RideChat from "../components/RideChat";
import { MaterialIcons } from "@expo/vector-icons";

const RideListScreen = ({ navigation }) => {
    const [rides, setRides] = useState([]);
    const [activeRide, setActiveRide] = useState(null);
    const [filter, setFilter] = useState("activo");
    const [userData, setUserData] = useState(null);

    const filteredRides = rides.filter((ride) => ride.status === filter);

    useEffect(() => {
        const fetchUserDataAndRides = async () => {
            try {
                const stored = await AsyncStorage.getItem("user");
                if (!stored) return;

                const data = JSON.parse(stored);

                
                setUserData(data); // para usarlo en otras partes si querés
                
                const res = await axios.get("http://192.168.0.4:4000/api/rides/my", {
                    headers: { Authorization: `Bearer ${data.token}` },
                  });
                  
                setRides(res.data);
            } catch (err) {
                console.error("Error al cargar viajes:", err);
            }
        };

        fetchUserDataAndRides();
    }, []);

    if (activeRide) {
        return (
            <View style={{ flex: 1 }}>
                <Button title="← Volver a la lista" onPress={() => setActiveRide(null)} />
                <RideChat rideId={activeRide._id} user={userData.user} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Tus viajes activos</Text>
            {["activo", "pendiente", "finalizado"].map((status) => (
                <Button
                    key={status}
                    title={status}
                    color={filter === status ? "blue" : "gray"}
                    onPress={() => setFilter(status)}
                />
            ))}
            <FlatList
                data={filteredRides}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                    <View style={styles.rideItem}>
                        <Text style={styles.status}>{item.status.toUpperCase()}</Text>
                        <View style={styles.row}>
                            <MaterialIcons name="location-on" size={20} color="red" />
                            <Text style={styles.infoText}>Origen: {item.origin}</Text>
                        </View>
                        <View style={styles.row}>
                            <MaterialIcons name="flag" size={20} color="green" />
                            <Text style={styles.infoText}>Destino: {item.destination}</Text>
                        </View>
                        <Button title="Abrir chat" onPress={() => setActiveRide(item)} />
                    </View>
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20, marginTop: 40 },
    title: { fontSize: 20, marginBottom: 10 },
    rideItem: {
        marginBottom: 15,
        padding: 15,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 10,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        marginVertical: 4,
    },
    infoText: {
        marginLeft: 5,
    },
    status: {
        fontWeight: "bold",
        marginBottom: 6,
        color: "#333",
    },
});

export default RideListScreen;
