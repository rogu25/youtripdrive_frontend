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
  ActivityIndicator,
} from "react-native";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../utils/config";

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Por favor, ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: email.toLowerCase().trim(),
        password,
      });

      if (!res.data || !res.data.token || !res.data.user) {
        Alert.alert(
          "Error",
          "Respuesta de autenticación inválida del servidor. Faltan datos esenciales."
        );
        return;
      }

      // Combina el token y los datos del usuario en un solo objeto para el contexto
      const userDataToSave = {
        ...res.data.user, // Desestructura los datos del usuario (_id, name, email, role, etc.)
        token: res.data.token, // Añade el token al mismo objeto
      };
      console.log("userDataToSave: ", userDataToSave);

      // Llama a la función login del contexto.
      // Esto actualizará el estado de autenticación y el RootNavigator en App.js
      // se encargará automáticamente de la navegación basada en el rol.
      await login(userDataToSave);

      // --- IMPORTANTE: Las siguientes líneas de navegación son redundantes si tu RootNavigator
      // --- maneja la navegación basada en el estado de autenticación y el rol.
      // --- Se recomienda NO usarlas aquí para evitar parpadeos o navegación duplicada.
      /*
      if (res.data.user.role === "pasajero") {
        navigation.replace("PassengerHomeScreen");
      } else if (res.data.user.role === "conductor") {
        navigation.replace("DriverHome");
      }
      // O si quieres forzar un reseteo y re-evaluación del RootNavigator:
      // navigation.replace("Root"); 
      */

    } catch (err) {
      console.error("Error de login:", err.response?.data || err.message);
      let errorMessage =
        "Ocurrió un error inesperado. Intenta de nuevo más tarde.";
      if (err.response) {
        if (err.response.status === 400 || err.response.status === 401) {
          errorMessage =
            "Credenciales inválidas. Verifica tu correo y contraseña.";
        } else if (err.response.status === 500) {
          errorMessage =
            "Error del servidor. Por favor, intenta de nuevo más tarde.";
        } else {
          errorMessage = err.response.data?.message || errorMessage;
        }
      } else if (err.request) {
        errorMessage =
          "No se pudo conectar con el servidor. Verifica tu conexión a internet o intenta más tarde.";
      }

      Alert.alert("Error de Login", errorMessage);
    } finally {
      setLoading(false);
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
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />

          <TouchableOpacity onPress={handleLogin} disabled={loading}>
            <LinearGradient
              colors={["#00f0ff", "#0cf574"]}
              start={[0, 0]}
              end={[1, 1]}
              style={styles.button}
            >
              {loading ? (
                <ActivityIndicator color="#0a0f1c" />
              ) : (
                <Text style={styles.buttonText}>Ingresar</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("Register")}
            disabled={loading}
          >
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
    flex: 1,
    justifyContent: "center",
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