import React, { useEffect, useState, useRef } from "react";
import { View, Text, TextInput, Button, ScrollView, StyleSheet } from "react-native";
import { io } from "socket.io-client";
import axios from "axios";

const socket = io("http://localhost:4000"); // Cambiar IP si estás en celular físico

const RideChat = ({ rideId, user }) => {
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const scrollRef = useRef();

  useEffect(() => {
    socket.emit("join", user._id);
    socket.emit("join_ride_chat", rideId);

    if (scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }

    axios
      .get(`http://localhost:4000/api/messages/${rideId}`, {
        headers: { Authorization: user.token },
      })
      .then((res) => setMessages(res.data))
      .catch((err) => console.error(err));

    socket.on("receive_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("user_typing", ({ senderId }) => {
      if (senderId !== user._id) {
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 2000); // se oculta tras 2s
      }
    });

    return () => {
      socket.off("receive_message");
    };
  }, [rideId, user, messages]);

  const sendMessage = () => {
    if (!content.trim()) return;

    socket.emit("send_message", {
      rideId,
      senderId: user._id,
      content,
    });
    setContent("");
  };

  const handleTyping = (text) => {
    setContent(text);
    socket.emit("typing", { rideId, senderId: user._id });
  };

  return (
    <View style={styles.container}>

      <Text style={styles.title}>Chat del viaje</Text>
      <ScrollView style={styles.chatBox} ref={scrollRef}>
        {messages.map((msg) => {
          const isMe = msg.sender === user._id || msg.sender._id === user._id;
          return (
            <View key={msg._id} style={[styles.messageBox, isMe ? styles.myMsg : styles.otherMsg]}>
              <Text style={{ fontWeight: "bold" }}>
                {isMe ? "Yo" : msg.sender.name || "Otro"}:
              </Text>
              <Text>{msg.content}</Text>
            </View>
          );
        })}

      </ScrollView>
      {isTyping && <Text style={{ fontStyle: "italic" }}>El otro usuario está escribiendo...</Text>}
      <TextInput
        style={styles.input}
        value={content}
        onChangeText={handleTyping}
        placeholder="Escribe un mensaje..."
      />
      {/* `<TextInput
        style={styles.input}
        value={content}
        onChangeText={setContent}
        placeholder="Escribe un mensaje..."
      />` */}
      <Button title="Enviar" onPress={sendMessage} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20, marginTop: 40 },
  title: { fontSize: 18, marginBottom: 10 },
  chatBox: { height: 300, marginBottom: 10 },
  message: { marginBottom: 5 },
  input: { borderWidth: 1, borderColor: "#ccc", marginBottom: 10, padding: 8 },
  messageBox: {
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    maxWidth: "80%",
  },
  myMsg: {
    alignSelf: "flex-end",
    backgroundColor: "#DCF8C6",
  },
  otherMsg: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F0F0",
  },
});


export default RideChat;
