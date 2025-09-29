const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors());
app.use(express.json());

// Aktif kullanıcıları takip et
const activeUsers = new Map();

// Supabase bağlantısını test et
async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from("users").select("count");
    if (error) {
      console.error("❌ Supabase bağlantı hatası:", error);
    } else {
      console.log("✅ Supabase bağlantısı başarılı");
    }
  } catch (err) {
    console.error("❌ Supabase test hatası:", err);
  }
}

testSupabaseConnection();

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  // Kullanıcı kayıt olduğunda
  socket.on("user_connected", async (userData) => {
    try {
      console.log("📝 Kullanıcı bağlanıyor:", userData);

      // userId kontrolü
      if (!userData.userId || !userData.name) {
        console.error("❌ userId veya name eksik:", userData);
        return;
      }

      activeUsers.set(socket.id, {
        ...userData,
        socketId: socket.id,
        lastSeen: new Date(),
      });

      // Supabase'e kullanıcı durumunu kaydet
      const { data, error } = await supabase.from("users").upsert(
        {
          id: userData.userId, // Artık TEXT olarak kabul edilecek
          name: userData.name,
          is_online: true,
          last_seen: new Date().toISOString(),
          socket_id: socket.id,
        },
        {
          onConflict: "id",
        }
      );

      if (error) {
        console.error("❌ Kullanıcı kaydı hatası:", error);
        console.error("❌ Gönderilen veri:", {
          id: userData.userId,
          name: userData.name,
        });
      } else {
        console.log("✅ Kullanıcı kaydedildi");
      }

      // Diğer kullanıcılara yeni kullanıcıyı bildir
      socket.broadcast.emit("user_joined", {
        userId: userData.userId,
        name: userData.name,
      });

      // Aktif kullanıcı listesini gönder
      const userList = Array.from(activeUsers.values());
      io.emit("active_users", userList);
    } catch (err) {
      console.error("❌ user_connected hatası:", err);
    }
  });

  // Konum güncellemesi
  socket.on("location_update", async (locationData) => {
    try {
      const user = activeUsers.get(socket.id);

      if (!user) {
        console.warn("⚠️ Kullanıcı bulunamadı:", socket.id);
        return;
      }

      if (!locationData.latitude || !locationData.longitude) {
        console.error("❌ Latitude veya longitude eksik:", locationData);
        return;
      }

      console.log("📍 Konum güncellemesi:", {
        userId: user.userId,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
      });

      // Kullanıcı bilgilerini güncelle
      user.latitude = locationData.latitude;
      user.longitude = locationData.longitude;
      user.lastSeen = new Date();
      activeUsers.set(socket.id, user);

      // Supabase'e konum kaydet
      const { data, error } = await supabase.from("user_locations").insert({
        user_id: user.userId,
        latitude: parseFloat(locationData.latitude),
        longitude: parseFloat(locationData.longitude),
        timestamp: new Date().toISOString(),
        accuracy: locationData.accuracy
          ? parseFloat(locationData.accuracy)
          : null,
      });

      if (error) {
        console.error("❌ Konum kaydetme hatası:", error);
        console.error("❌ Gönderilen veri:", {
          user_id: user.userId,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
        });
      } else {
        console.log("✅ Konum kaydedildi");
      }

      // Tüm kullanıcılara konum güncellemesini gönder
      io.emit("location_updated", {
        userId: user.userId,
        name: user.name,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("❌ location_update hatası:", err);
    }
  });

  // Kullanıcı ayrıldığında
  socket.on("disconnect", async () => {
    try {
      const user = activeUsers.get(socket.id);
      if (user) {
        // Supabase'de kullanıcıyı offline yap
        const { error } = await supabase
          .from("users")
          .update({
            is_online: false,
            last_seen: new Date().toISOString(),
          })
          .eq("id", user.userId);

        if (error) {
          console.error("❌ Kullanıcı offline yapma hatası:", error);
        } else {
          console.log("✅ Kullanıcı offline yapıldı:", user.name);
        }

        // Diğer kullanıcılara bildir
        socket.broadcast.emit("user_left", {
          userId: user.userId,
          name: user.name,
        });

        activeUsers.delete(socket.id);

        // Güncel aktif kullanıcı listesini gönder
        const userList = Array.from(activeUsers.values());
        io.emit("active_users", userList);
      }
      console.log("Kullanıcı ayrıldı:", socket.id);
    } catch (err) {
      console.error("❌ disconnect hatası:", err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Sunucu ${PORT} portunda çalışıyor`);
});
