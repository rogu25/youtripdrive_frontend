// socket.js
import { io } from "socket.io-client";
export const socket = io("http://192.168.0.254:4000"); // asegúrate que esta IP es accesible desde el dispositivo físico
