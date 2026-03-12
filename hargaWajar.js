const YahooFinance = require('yahoo-finance2').default; // Perhatikan huruf besar 'Y'
const { google } = require('googleapis');
const path = require('path');

// Inisialisasi Yahoo Finance v3
const yahooFinance = new YahooFinance();

// Konfigurasi Google Sheets
const KEYFILEPATH = path.join(__dirname, 'bot-saham-489819-dea42c47eb59.json');
const SPREADSHEET_ID = "19rw4Z2H5iyiUoDvnfSXkyOBooxrmmvDtKJcPddBhISA";
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Logika Penentuan Harga Wajar Dinamis
 * - Perbankan (BBCA, BBRI): PBV Standar (4.5x - 2.5x)
 * - Umum: P/E Ratio Standar (15x)
 */
function hitungNilaiIntrinsik(data, ticker) {
    const eps = data.forwardEps || data.trailingEps;
    const bvps = data.bookValue;

    if (ticker.includes('BBCA')) return Math.round(bvps * 4.5);
    if (ticker.includes('BBRI')) return Math.round(bvps * 2.8);
    if (ticker.includes('BREN')) {
        // Untuk saham hyper-growth seperti BREN, kita gunakan 
        // harga pasar saat ini dengan diskon teknikal sebagai target beli
        // karena fundamental P/E tidak bisa mengejar harga pasar.
        return Math.round(data.regularMarketPrice * 0.85); // Target beli 15% di bawah harga pasar
    }
    if (eps && eps > 0) {
        return Math.round(eps * 15); // Target P/E wajar 15x
    }

    // Fallback jika EPS negatif atau nol (biasanya untuk saham turn-around/growth)
    return Math.round(data.regularMarketPrice * 0.9); 
}

async function startAutomation() {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEYFILEPATH,
        scopes: SCOPES,
    });
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        console.log("1. Membaca daftar emiten dari Kolom A...");
        const getRows = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Sheet1!A2:A20",
        });

        const tickers = getRows.data.values;
        if (!tickers) return console.log("Kolom A kosong.");

        console.log(`2. Memproses ${tickers.length} emiten secara otomatis...`);

        const results = [];
        for (const row of tickers) {
            const ticker = row[0];
            if (!ticker) {
                results.push([""]);
                continue;
            }

            try {
                // Sintaks v3: yahooFinance.quoteSummary(ticker, { modules: [...] })
                const quote = await yahooFinance.quoteSummary(ticker, {
                    modules: ['defaultKeyStatistics', 'price']
                });

                const fundamental = {
                    forwardEps: quote.defaultKeyStatistics.forwardEps,
                    trailingEps: quote.defaultKeyStatistics.trailingEps,
                    bookValue: quote.defaultKeyStatistics.bookValue,
                    regularMarketPrice: quote.price.regularMarketPrice
                };

                const hargaWajar = hitungNilaiIntrinsik(fundamental, ticker);
                console.log(` ✅ ${ticker} -> Harga Wajar: Rp${hargaWajar}`);
                results.push([hargaWajar]);

            } catch (e) {
                console.error(` ❌ Gagal memproses ${ticker}: ${e.message}`);
                results.push(["Error Data"]);
            }
        }

        console.log("3. Memperbarui Kolom B di Spreadsheet...");
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Sheet1!B2:B${1 + results.length}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: results },
        });

        console.log("✅ SELESAI! Data harga wajar telah sinkron.");

    } catch (err) {
        console.error("Ralat Sistem Utama:", err.message);
    }
}

startAutomation();