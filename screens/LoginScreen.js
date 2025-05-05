import React, { useState } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = async () => {
    try {
      const res = await axios.post("http://192.168.0.8:4000/api/auth/login", {
        email,
        password,
      });


      // Validamos la estructura
      if (!res.data || !res.data.user) {
        Alert.alert("Error", "Respuesta inválida del servidor");
        return;
      }

      // Guardamos el usuario y el token si está todo ok
      await AsyncStorage.setItem(
        "user",
        JSON.stringify({
          token: res.data.token,
          user: res.data.user,
        })
      );

      // Redirección basada en el rol
      if (res.data.user.role === "pasajero") {
        navigation.replace("PassengerHome"); // esta pantalla la tienes que registrar en tu navigator
      } else if (res.data.user.role === "conductor") {
        navigation.replace("DriverHome"); // (cuando esté lista)
      }

      // navigation.reset({ index: 0, routes: [{ name: "Rides" }] });

    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Credenciales inválidas o servidor no disponible");
    }
  };


  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.container}>
          <Image source={require("../assets/logo.jpg")} style={styles.logo} />

          <TextInput
            style={styles.input}
            placeholder="Correo electrónico"
            placeholderTextColor="#bbb"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity onPress={login}>
            <LinearGradient
              colors={["#00f0ff", "#0cf574"]}
              start={[0, 0]}
              end={[1, 1]}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Ingresar</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Register")}>
            <Text style={styles.link}>¿No tenés cuenta? Registrate</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
  container: {
    padding: 24,
    backgroundColor: "#0a0f1c",
  },
  logo: {
    width: 180,
    height: 180,
    borderRadius: 20,
    alignSelf: "center",
    marginBottom: 30,
    borderWidth: 2,
    borderColor: "#00f0ff",
  },
  input: {
    backgroundColor: "#1a1f2e",
    color: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderColor: "#00f0ff",
    borderWidth: 1,
    shadowColor: "#00f0ff",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  button: {
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#0cf574",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  buttonText: {
    color: "#0a0f1c",
    fontWeight: "bold",
    fontSize: 16,
  },
  link: {
    color: "#bbb",
    textAlign: "center",
    marginTop: 10,
  },
});

export default LoginScreen;
