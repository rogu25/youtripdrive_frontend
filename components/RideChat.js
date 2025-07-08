import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const API_URL = "http://192.168.0.254:4000";

const RideChat = () => {
  const route = useRoute();
  const { rideId, userId } = route.params;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const socketRef = useRef();
  const [typingUser, setTypingUser] = useState(null);
  const insets = useSafeAreaInsets(); // <-- para márgenes seguros

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
console.log("EL ID EN EL CHAT: ", rideId)
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        console.log("EL ID EN EL CHAT: ", token)
        const res = await axios.get(`${API_URL}/messages/${rideId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(res.data);
      } catch (err) {
        console.error("Error al obtener mensajes:", err.message);
      }
    };

    socketRef.current.on("user_typing", ({ senderId }) => {
      if (senderId !== userId) {
        setTypingUser("El otro usuario");
        setTimeout(() => setTypingUser(null), 2000);
      }
    });

    fetchMessages();
  }, [rideId]);

  const sendMessage = () => {
    if (!input.trim()) return;

    const msg = {
      rideId,
      senderId: userId,
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
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => (
              <View
                style={
                  item.sender._id === userId ? styles.myMsg : styles.otherMsg
                }
              >
                <Text style={styles.sender}>
                  {item.sender.name || "Anon"}:
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
                socketRef.current.emit("typing", {
                  rideId,
                  senderId: userId,
                });
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
