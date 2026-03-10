require('dotenv').config();
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] }); 

const axios = require('axios');
const cron = require('node-cron');

const WA_URL = process.env.WA_GATEWAY_URL;
const waUser = process.env.WA_BASIC_USER || "user1";
const waPass = process.env.WA_BASIC_PASS || "pass1";
const WA_DEVICE_ID = process.env.WA_DEVICE_ID || "myperfume";
const TARGET_PHONE = process.env.TARGET_PHONE;

const watchList = [
  { symbol: 'BBCA.JK', targetPrice: 5500 },
  { symbol: 'BBRI.JK', targetPrice: 4500 },
  { symbol: 'ASII.JK', targetPrice: 4800 },
  { symbol: 'GOTO.JK', targetPrice: 50 },
  { symbol: 'NCKL.JK', targetPrice: 1200 },
  { symbol: 'ANTM.JK', targetPrice: 3400 },
  { symbol: 'IPCC.JK', targetPrice: 1000 },
  { symbol: 'BREN.JK', targetPrice: 6000 },
  { symbol: 'SMDR.JK', targetPrice: 300 },
  { symbol: 'MBMA.JK', targetPrice: 600 },
  { symbol: 'BUMI.JK', targetPrice: 190 },
  { symbol: 'ANJT.JK', targetPrice: 1500 },
  { symbol: 'TINS.JK', targetPrice: 3200 },
  { symbol: 'NICL.JK', targetPrice: 8200 },
  { symbol: 'INCO.JK', targetPrice: 5000 },

];

const lastAlerts = {};
const ALERT_COOLDOWN = 60 * 60 * 1000; 

const sendWAMessage = async (phone, message) => {
  try {
    const payload = { phone, message };
    await axios.post(`${WA_URL}/send/message`, payload, {
      headers: { "X-Device-Id": WA_DEVICE_ID },
      auth: { username: waUser, password: waPass },
    });
    console.log(`[WA] Terkirim: ${message.split('\n')[0]}`);
  } catch (error) {
    console.error(`[WA Error]:`, error.response?.data || error.message);
  }
};

/**
 * FUNGSI LAPORAN RANGKUMAN (Pagi)
 */
async function sendDailySummary() {
  let reportMsg = `📊 *LAPORAN HARGA PAGI*\n${new Date().toLocaleDateString('id-ID')}\n\n`;
  
  for (const item of watchList) {
    try {
      const quote = await yahooFinance.quote(item.symbol);
      const price = quote.regularMarketPrice;
      const status = price <= item.targetPrice ? '✅ DISKON' : '⏳ PANTAU';
      reportMsg += `🔹 *${item.symbol}*: ${price}\n   Status: ${status}\n`;
    } catch (e) {
      reportMsg += `🔹 *${item.symbol}*: Error data\n`;
    }
  }
  
  reportMsg += `\n_Bot tetap memantau real-time selama jam bursa._`;
  await sendWAMessage(TARGET_PHONE, reportMsg);
}

/**
 * FUNGSI PENGECEKAN REAL-TIME
 */
async function checkWatchlist() {
  console.log(`--- Memulai Pengecekan: ${new Date().toLocaleTimeString()} ---`);
  for (const item of watchList) {
    try {
      const quote = await yahooFinance.quote(item.symbol);
      const currentPrice = quote.regularMarketPrice;
      const now = Date.now();

      if (currentPrice <= item.targetPrice) {
        const lastSent = lastAlerts[item.symbol];
        if (!lastSent || (now - lastSent) > ALERT_COOLDOWN) {
          const alertMsg = `🚨 *DISKON SAHAM!* \n\nEmiten: *${item.symbol}*\nHarga: *${currentPrice}*\nTarget: ${item.targetPrice}`;
          await sendWAMessage(TARGET_PHONE, alertMsg);
          lastAlerts[item.symbol] = now; 
        }
      }
    } catch (error) { /* error log ignored for brevity */ }
  }
}

/**
 * CRON SCHEDULE: JAM BURSA (09:00 - 16:00)
 * Format: Menit Jam Hari_dalam_Bulan Bulan Hari_dalam_Minggu
 * '0-59 9-15 * * 1-5' artinya:
 * Setiap menit, dari jam 09:00 sampai jam 15:59, Senin sampai Jumat.
 */
cron.schedule('* 9-15 * * 1-5', () => {
  // Pengecekan real-time hanya di jam bursa
  checkWatchlist();
});

// 2. Cron: Setiap jam 09:00 pagi (Senin-Jumat) untuk rangkuman
cron.schedule('0 9 * * 1-5', () => {
  console.log("Mengirim laporan pagi...");
  sendDailySummary();
});
// 2. Cron: Setiap jam 09:00 pagi (Senin-Jumat) untuk rangkuman
cron.schedule('0 15 * * 1-5', () => {
  console.log("Mengirim laporan pagi...");
  sendDailySummary();
});

console.log(`Bot Multi-Stock & Laporan Pagi aktif.`);