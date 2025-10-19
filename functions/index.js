const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { DateTime } = require('luxon');
admin.initializeApp();

const db = admin.database();

// === helpers
function toYMD(ts) {
  return DateTime.fromMillis(ts).setZone('UTC').toFormat('yyyy-LL-dd');
}
function parseRange(s) {
  // "08:00-22:00" => [480, 1320] (dakika)
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  const a = (+m[1]) * 60 + (+m[2]);
  const b = (+m[3]) * 60 + (+m[4]);
  return [a, b];
}
function inWorkHours(workHours = [], startAt, endAt, tz = 'Europe/Istanbul') {
  // basit kural: rezervasyonun başlangıç VE bitiş dakikaları, aynı günün izinli aralığında olsun
  const start = DateTime.fromMillis(startAt).setZone(tz);
  const end = DateTime.fromMillis(endAt).setZone(tz);
  if (start.hasSame(end, 'day') === false) return false; // tek gün kuralı
  const mins = (dt) => dt.hour * 60 + dt.minute;
  const sMin = mins(start), eMin = mins(end);
  return workHours.some((w) => {
    const r = parseRange(w);
    return r && sMin >= r[0] && eMin <= r[1];
  });
}
async function hasOverlap(room, startAt, endAt) {
  // startAt civarını çek; çakışma: !(end<=start || start>=end)
  const q = await db.ref(`roomReservations/${room}`)
    .orderByChild('startAt')
    .startAt(startAt - 6 * 3600 * 1000) // 6 saat tampon
    .endAt(endAt + 6 * 3600 * 1000)
    .get();
  const list = Object.values(q.val() || {});
  return list.some(r =>
    (r.status || 'pending') !== 'declined' &&
    !( (r.endAt || 0) <= startAt || (r.startAt || 0) >= endAt )
  );
}
function slotKeyFromRange(startAt, endAt) {
  return `${startAt}-${endAt}`;
}

// === OTO-ONAY MOTORU
exports.autoApproveReservation = functions.database
  .ref('/roomReservations/{room}/{id}')
  .onCreate(async (snap, ctx) => {
    const rec = snap.val() || {};
    const { room, id } = ctx.params;

    // Meta oku
    const metaSnap = await db.ref(`roomMeta/${room}`).get();
    const meta = metaSnap.val() || {};
    const maxLenMin = Number(meta.maxLenMin || 180);
    const workHours = Array.isArray(meta.workHours) ? meta.workHours : [];
    const blackout = Array.isArray(meta.blackout) ? meta.blackout : [];

    let status = 'pending';
    let decisionNote = '';

    // Blackout?
    const day = toYMD(rec.startAt || 0);
    if (blackout.includes(day)) {
      status = 'declined';
      decisionNote = 'blackout';
    }

    // Süre kontrolü
    if (status !== 'declined') {
      const lenMin = Math.ceil(((rec.endAt || 0) - (rec.startAt || 0)) / 60000);
      if (!(lenMin > 0 && lenMin <= maxLenMin)) {
        status = 'declined';
        decisionNote = 'length';
      }
    }

    // Çalışma saati
    if (status !== 'declined') {
      const ok = inWorkHours(workHours, rec.startAt, rec.endAt, 'Europe/Istanbul');
      if (!ok) {
        status = 'pending';
        decisionNote = 'out_of_hours';
      }
    }

    // Çakışma
    if (status !== 'declined') {
      const clash = await hasOverlap(room, rec.startAt, rec.endAt);
      if (clash) {
        status = 'pending';             // istersen direkt 'declined' yapabilirsin
        decisionNote = 'overlap';
      }
    }

    // yaz
    await snap.ref.update({ status, decisionNote });

    // slot kilidini  temizle (güvenli taraf: varsa)
    const slotKey = slotKeyFromRange(rec.startAt, rec.endAt);
    await db.ref(`roomReservationsLock/${room}/${slotKey}`).remove();

    return null;
  });

// === KİLİT SÜPÜRÜCÜ (zombie kilit cleanup) – opsiyonel, saatlik cron
exports.cleanupOldLocks = functions.pubsub.schedule('every 60 minutes').onRun(async () => {
  const roomsSnap = await db.ref('roomReservationsLock').get();
  const rooms = roomsSnap.val() || {};
  const now = Date.now();
  const batch = [];
  Object.entries(rooms).forEach(([room, locks]) => {
    Object.keys(locks || {}).forEach(k => {
      // slotKey "start-end"; start 3 saatten eskiyse süpür
      const parts = (k || '').split('-');
      const start = Number(parts[0] || 0);
      if (start && (now - start) > 3 * 3600 * 1000) {
        batch.push(db.ref(`roomReservationsLock/${room}/${k}`).remove());
      }
    });
  });
  await Promise.all(batch);
  return null;
});
