/**
 * TKJ SMKN 2 Tembilahan — Cloud Function untuk Push Notification "skala real".
 *
 * Kenapa butuh ini: mengirim notifikasi lewat FCM ke banyak perangkat, TERMASUK saat
 * aplikasi/browser sedang tertutup, wajib memakai Firebase Admin SDK dengan kredensial
 * server (service account). Kredensial itu TIDAK BOLEH ditaruh di browser/admin.html,
 * jadi pengirimannya harus lewat server — di sinilah Cloud Function ini berperan.
 *
 * Alur:
 *  1. Admin menulis pesan baru ke Realtime Database di path pushQueue/{id}
 *     (dilakukan otomatis oleh admin.html saat menekan tombol "Kirim").
 *  2. Function ini otomatis terpicu (onValueCreated), membaca semua token di pushTokens/*,
 *     lalu mengirim via admin.messaging().sendEachForMulticast().
 *  3. Token yang sudah tidak valid (uninstall/expire) otomatis dibersihkan.
 *  4. Hasil pengiriman (jumlah sukses/gagal) ditulis balik ke pushQueue/{id}/result,
 *     supaya admin.html bisa menampilkannya secara realtime.
 *
 * CARA DEPLOY (sekali saja, butuh Node.js & akun Firebase Blaze/pay-as-you-go — gratis
 * kalau pemakaian rendah, dan Cloud Messaging sendiri gratis tanpa batas):
 *   1. npm install -g firebase-tools
 *   2. firebase login
 *   3. Di root project (sejajar folder functions ini): firebase init functions
 *      (pilih project wilka-5e33d, pilih JavaScript, jangan timpa file ini)
 *   4. Salin folder functions/ ini ke project firebase kamu (timpa index.js & package.json)
 *   5. cd functions && npm install
 *   6. firebase deploy --only functions
 *   7. Upgrade project ke paket Blaze di Firebase Console kalau diminta (wajib untuk
 *      Cloud Functions versi 2, tapi tetap ada kuota gratis bulanan yang besar)
 */
const {onValueCreated} = require('firebase-functions/v2/database');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({region: 'asia-southeast1', maxInstances: 5});

exports.sendBroadcastPush = onValueCreated(
  {ref: '/pushQueue/{pushId}', instance: 'wilka-5e33d-default-rtdb'},
  async (event) => {
    const pushId = event.params.pushId;
    const data = event.data.val() || {};
    const db = admin.database();

    const tokensSnap = await db.ref('pushTokens').once('value');
    const tokensObj = tokensSnap.val() || {};
    const entries = Object.entries(tokensObj); // [deviceId, {token, ua, t}]
    const tokens = entries.map(([, v]) => v && v.token).filter(Boolean);

    if (!tokens.length) {
      await db.ref(`pushQueue/${pushId}/result`).set({
        sent: 0, failed: 0, total: 0, at: Date.now(), note: 'Tidak ada perangkat terdaftar untuk notifikasi.'
      });
      return;
    }

    const message = {
      notification: {
        title: data.title || 'TKJ SMKN 2 Tembilahan',
        body: data.body || ''
      },
      data: {
        url: data.url || './'
      },
      tokens
    };

    const res = await admin.messaging().sendEachForMulticast(message);

    // Bersihkan token yang sudah tidak valid (uninstall / izin dicabut / kedaluwarsa)
    const invalidDeviceIds = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') {
          invalidDeviceIds.push(entries[i][0]);
        }
      }
    });
    await Promise.all(invalidDeviceIds.map(devId => db.ref(`pushTokens/${devId}`).remove().catch(() => {})));

    await db.ref(`pushQueue/${pushId}/result`).set({
      sent: res.successCount,
      failed: res.failureCount,
      total: tokens.length,
      cleaned: invalidDeviceIds.length,
      at: Date.now()
    });
  }
);
