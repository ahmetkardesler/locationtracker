// test-client.js
const io = require("socket.io-client");

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("✅ Bağlandı!");

  // Kullanıcı kaydı
  socket.emit("user_connected", {
    userId: "test_user_123",
    name: "Test Kullanıcı",
  });

  // 2 saniye bekle
  setTimeout(() => {
    console.log("📍 Konum gönderiliyor...");
    socket.emit("location_update", {
      latitude: 41.0082,
      longitude: 28.9784,
      accuracy: 10,
    });
  }, 2000);
});

socket.on("location_updated", (data) => {
  console.log("📍 Konum güncellendi:", data);
});

socket.on("disconnect", () => {
  console.log("❌ Bağlantı kesildi");
});
