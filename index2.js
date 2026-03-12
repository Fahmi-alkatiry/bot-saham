process.env.TZ = "Asia/Jakarta";
require("dotenv").config();
const { RSI, SMA } = require("technicalindicators");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const axios = require("axios");
const cron = require("node-cron");

const SPREADSHEET_ID = "19rw4Z2H5iyiUoDvnfSXkyOBooxrmmvDtKJcPddBhISA";
const creds = require("./credentials.json");

// Konfigurasi WhatsApp
const WA_URL = process.env.WA_GATEWAY_URL;
const WA_DEVICE_ID = process.env.WA_DEVICE_ID;
const TARGET_PHONE = process.env.TARGET_PHONE;

const lastAlerts = {};
const ALERT_COOLDOWN = 12 * 60 * 60 * 1000;

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sendWAMessage = async (phone, message) => {
  try {
    await axios.post(
      `${WA_URL}/send/message`,
      { phone, message },
      {
        headers: { "X-Device-Id": WA_DEVICE_ID },
        auth: {
          username: process.env.WA_BASIC_USER,
          password: process.env.WA_BASIC_PASS,
        },
      },
    );
    console.log(`✅ [WA] Pesan terkirim ke ${phone}`);
  } catch (error) {
    console.error(`❌ [WA Error]:`, error.response?.data || error.message);
  }
};


async function checkHybridSystem() {
  try {
    console.log(`\n==================================================`);
    console.log(`🚀 SCAN ANALIS + CATATAN: ${new Date().toLocaleString('id-ID')}`);
    console.log(`==================================================`);

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Sheet1'] || doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    for (const row of rows) {
      const ticker = row.get('Ticker');
      const target = parseFloat(row.get('Target'));
      const catatan = row.get('Catatan') || "Tidak ada instruksi khusus"; // Ambil kolom Catatan

      if (!ticker || isNaN(target)) continue;

      try {
        const history = await yahooFinance.chart(ticker, { period1: '2025-03-01', interval: '1d' });
        const quotes = history.quotes.filter(q => q.close != null);
        if (quotes.length < 200) continue;

        const closePrices = quotes.map(q => q.close);
        const currentPrice = closePrices[closePrices.length - 1];
        
        // Indikator
        const rsiValues = RSI.calculate({ values: closePrices, period: 14 });
        const currentRSI = rsiValues[rsiValues.length - 1];
        const ma200Values = SMA.calculate({ period: 200, values: closePrices });
        const cMA200 = ma200Values[ma200Values.length - 1];

        // --- LOGIKA TRIGGER ---
        const isPriceHit = currentPrice <= target;
        const isRsiAlert = currentRSI <= 40;

        // --- SISTEM SKOR ---
        let skor = 0;
        let poinDetail = [];
        if (isPriceHit) { skor += 2; poinDetail.push("Target Harga Tercapai (+2)"); }
        if (currentRSI <= 30) { skor += 2; poinDetail.push("RSI Sangat Murah (+2)"); }
        else if (currentRSI <= 40) { skor += 1; poinDetail.push("RSI Mulai Murah (+1)"); }
        if (currentPrice > cMA200) { skor += 1; poinDetail.push("Tren Jangka Panjang Uptrend (+1)"); }
        
        console.log(`🔍 [${ticker}] Skor: ${skor}/5 | Harga: ${currentPrice} | Catatan: ${catatan}`);

        if (isPriceHit || isRsiAlert) {
          const now = Date.now();
          if (!lastAlerts[ticker] || (now - lastAlerts[ticker]) > ALERT_COOLDOWN) {
            
            let bintang = "⭐".repeat(skor) || "⚪";
            let statusSinyal = isRsiAlert && currentRSI <= 30 ? "🔥 SINYAL KUAT" : "⚠️ SINYAL PANTAUAN";
            if (isPriceHit && !isRsiAlert) statusSinyal = "🎯 TARGET TERCAPAI";

            let alertMsg = `${statusSinyal}: *${ticker}* \n`;
            alertMsg += `Rating: ${bintang} (${skor}/5)\n\n`;
            alertMsg += `💰 Harga: *${currentPrice}*\n🎯 Target: *${target}*\n📊 RSI: *${currentRSI.toFixed(2)}*\n📈 MA200: *${cMA200.toFixed(0)}*\n\n`;
            alertMsg += `📝 *Analisis:* \n- ${poinDetail.join('\n- ')}\n\n`;
            
            // TAMBAHKAN CATATAN DI SINI
            alertMsg += `📌 *INSTRUKSI:* \n_${catatan}_`;

            await sendWAMessage(TARGET_PHONE, alertMsg);
            lastAlerts[ticker] = now;
          }
        }
      } catch (e) {
        console.error(`❌ [Error ${ticker}]: ${e.message}`);
      }
    }
  } catch (error) {
    console.error("❌ System Error:", error.message);
  }
}

checkHybridSystem();
cron.schedule("* 9-15 * * 1-5", () => checkHybridSystem());

async function sendDailySummary() {
  try {
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle["Sheet1"] || doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    let summaryMsg = `📝 *LAPORAN PENUTUPAN BURSA*\n_${new Date().toLocaleDateString("id-ID")}_\n\n`;

    for (const row of rows) {
      const ticker = row.get("Ticker");
      if (!ticker) continue;

      const quote = await yahooFinance.quote(ticker);
      const price = quote.regularMarketPrice;
      const change = quote.regularMarketChangePercent;

      summaryMsg += `${change >= 0 ? "🟢" : "🔴"} *${ticker}*: ${price} (${change.toFixed(2)}%)\n`;
    }

    summaryMsg += `\n_Gunakan data ini untuk evaluasi strategi besok pagi._`;
    await sendWAMessage(TARGET_PHONE, summaryMsg);
    console.log("Laporan harian terkirim.");
  } catch (error) {
    console.error("Gagal mengirim laporan harian:", error.message);
  }
}

// Jadwal: Senin - Jumat jam 16:01 WIB
cron.schedule("1 16 * * 1-5", () => {
  sendDailySummary();
});
// sendDailySummary();
