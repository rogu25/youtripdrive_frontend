import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text, // Asegúrate de que Text esté importado
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from "react-native";
import io from "socket.io-client";
import axios from "axios";
import { useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://192.168.0.254:4000"; // Tu URL de API

const RideChat = () => {
  const route = useRoute();
  const { rideId, userId } = route.params; // userId también viene de route.params
  const { user, isAuthenticated, signOut } = useAuth(); // Ahora 'user' debería tener el token correcto

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const socketRef = useRef();
  const [typingUser, setTypingUser] = useState(null);
  const insets = useSafeAreaInsets();

  // Socket.IO useEffect (este está bien para el setup inicial)
  useEffect(() => {
    socketRef.current = io(API_URL);
    socketRef.current.emit("join_ride_chat", rideId);

    socketRef.current.on("receive_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [rideId]);

  // useEffect para cargar mensajes iniciales y manejar 'user_typing'
  useEffect(() => {
    const fetchMessages = async () => {
      // ✅ NUEVAS VALIDACIONES AQUÍ para evitar llamadas con datos incompletos
      if (!isAuthenticated || !user?.token || !rideId) {
        console.warn("RideChat: Faltan datos para cargar mensajes. user?.token:", user?.token ? 'presente' : 'ausente', "rideId:", rideId);
        return; // No intentes obtener mensajes si no tienes lo necesario
      }

      try {
        const url = `${API_URL}/api/messages/${rideId}`; // <-- Construye la URL
        console.log("RideChat: Intentando obtener mensajes de URL:", url); // <-- ¡DEBUG LOG CLAVE!
        console.log("RideChat: Usando token para la solicitud (primeros 20 chars):", user.token.substring(0, 20), "...");

        const res = await axios.get(url, { // <-- Usa la URL construida
          headers: { Authorization: `Bearer ${user.token}` }, // ✅ Asegúrate de usar user.token aquí
        });
        setMessages(res.data);
        console.log("RideChat: Mensajes obtenidos:", res.data.length, "mensajes.");
      } catch (err) {
        console.error("RideChat: Error al obtener mensajes:", err.response?.status, err.response?.data?.message || err.message);
        // Si el error es 404, indica que la URL no se encontró en el backend
        if (err.response?.status === 404) {
          console.error("RideChat: Posible URL de API incorrecta o rideId no encontrado en el backend.");
        }
      }
    };

    // Esto se ejecutará cada vez que rideId, user, o isAuthenticated cambien.
    // Asegúrate de que `fetchMessages` se llame solo cuando los datos estén listos.
    // La primera vez que el componente se monta, `user` podría ser `null` brevemente.
    if (isAuthenticated && user?.token && rideId) {
      fetchMessages();
    }

    socketRef.current.on("user_typing", ({ senderId }) => {
      if (senderId !== userId) { // ✅ Asegúrate que userId es el ID del usuario logueado, no solo el que se pasó por params
        setTypingUser("El otro usuario");
        setTimeout(() => setTypingUser(null), 2000);
      }
    });

    // Limpia el listener cuando el componente se desmonta o rideId cambia (si la sala es por rideId)
    return () => {
      if (socketRef.current) {
        socketRef.current.off("user_typing");
      }
    };
  }, [rideId, user, isAuthenticated]); // ✅ Dependencias actualizadas para useEffect

  const sendMessage = () => {
    if (!input.trim() || !user?.token || !user?.id) return; // Asegúrate de tener el ID del remitente

    const msg = {
      rideId,
      senderId: user.id, // ✅ Usar user._id del AuthContext
      content: input.trim(),
    };

    socketRef.current.emit("send_message", msg);
    setInput("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={[styles.inner, { paddingBottom: insets.bottom || 12 }]}>
          <FlatList
            data={messages}
            keyExtractor={(item, index) => item._id || index.toString()} // ✅ Mejor usar item._id si está disponible
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => (
              <View
                style={
                  item.sender._id === user?.id ? styles.myMsg : styles.otherMsg // ✅ Comparar con user?._id del AuthContext
                }
              >
                {/* ¡¡¡CORRECCIÓN AQUÍ: ELIMINADA LA 'z' SUELTA!!! */}
                <Text style={styles.sender}>
                  {item.sender?.name || "Anon"}: 
                </Text>
                <Text>{item.content}</Text>
              </View>
            )}
          />

          {typingUser && (
            <Text style={styles.typingText}> está escribiendo...</Text>
          )}

          <View style={styles.inputContainer}>
            <TextInput
              value={input}
              onChangeText={(text) => {
                setInput(text);
                if (socketRef.current && user?.id) { // ✅ Asegúrate que socket y user._id existen
                  socketRef.current.emit("typing", {
                    rideId,
                    senderId: user.id, // ✅ Usar user._id del AuthContext
                  });
                }
              }}
              placeholder="Escribe un mensaje..."
              style={styles.input}
            />
            <Button title="Enviar" onPress={sendMessage} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: 10,
    justifyContent: "space-between",
  },
  myMsg: {
    alignSelf: "flex-end",
    backgroundColor: "#DCF8C6",
    padding: 8,
    borderRadius: 5,
    marginBottom: 5,
    maxWidth: "75%",
  },
  otherMsg: {
    alignSelf: "flex-start",
    backgroundColor: "#EEE",
    padding: 8,
    borderRadius: 5,
    marginBottom: 5,
    maxWidth: "75%",
  },
  sender: {
    fontWeight: "bold",
    marginBottom: 2,
  },
  typingText: {
    fontStyle: "italic",
    color: "gray",
    marginBottom: 5,
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderTopColor: "#ccc",
    borderTopWidth: 1,
    paddingTop: 5,
  },
  input: {
    flex: 1,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 5,
    padding: 8,
    marginRight: 10,
  },
});

export default RideChat;