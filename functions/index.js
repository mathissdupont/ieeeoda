const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

function genKey(len = 6){
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // kafa karıştıran 0/O/1/l yok
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * Her 60 dakikada bir çalışır.
 * roomKeys/{room} altında:
 *  - currentKey: yeni anahtar
 *  - prevKey: önceki anahtar (kısa süre kabul edilecek)
 *  - rotatedAt: ms
 *  - rotateEveryMin: oda bazlı periyot (varsayılan 60)
 *  - overlapMin: eski anahtarın geçerli olacağı dakika (varsayılan 5)
 */
exports.rotateRoomKeys = functions.pubsub
  .schedule("every 60 minutes")
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    const db = admin.database();
    const snap = await db.ref("roomKeys").get();
    if (!snap.exists()) {
      console.log("roomKeys boş");
      return null;
    }

    const now = Date.now();
    const updates = {};

    Object.entries(snap.val()).forEach(([room, rec]) => {
      // geriye uyumluluk: rec string ise objeye çevir
      if (typeof rec === "string") rec = { currentKey: rec };

      const rotateEveryMin = Number(rec.rotateEveryMin || 60);
      const rotatedAt = Number(rec.rotatedAt || 0);

      // Gereksiz yazmayı önle: süresi dolmuşsa döndür
      const due = now - rotatedAt >= rotateEveryMin * 60 * 1000;
      if (!due) return;

      const next = genKey(6);

      updates[`roomKeys/${room}/prevKey`]        = rec.currentKey || null;
      updates[`roomKeys/${room}/currentKey`]     = next;
      updates[`roomKeys/${room}/rotatedAt`]      = now;
      updates[`roomKeys/${room}/rotateEveryMin`] = rotateEveryMin;
      updates[`roomKeys/${room}/overlapMin`]     = Number(rec.overlapMin || 5);
    });

    if (Object.keys(updates).length) {
      await db.ref().update(updates);
      console.log("Rotated rooms:", Object.keys(updates).length / 5);
    } else {
      console.log("Bu turda rotasyon yok");
    }
    return null;
  });
