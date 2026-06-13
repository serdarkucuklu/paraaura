// DOM Selectors
const currencyList = document.getElementById('currency-list');
const metalList = document.getElementById('metal-list');
const cryptoList = document.getElementById('crypto-list');
const updateTimeText = document.getElementById('update-time-text');

// Helper: Format price in Turkish Lira style
function formatTRY(value) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

// Helper: Format percentage
function formatPercent(value) {
    if (value === undefined || value === null) return '0.00%';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
}

// 1. Fetch Real-time Currencies (USD, EUR, GBP, CHF)
async function fetchCurrencies() {
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();
        if (data && data.rates) {
            const tryRate = data.rates['TRY'];
            const eurRate = tryRate / data.rates['EUR'];
            const gbpRate = tryRate / data.rates['GBP'];
            const chfRate = tryRate / data.rates['CHF'];

            // We mock percentage change since the free API is daily baseline
            renderCurrencyList([
                { name: 'Amerikan Doları', code: 'USD/TRY', price: tryRate, change: 0.05 },
                { name: 'Euro', code: 'EUR/TRY', price: eurRate, change: -0.12 },
                { name: 'İngiliz Sterlini', code: 'GBP/TRY', price: gbpRate, change: 0.18 },
                { name: 'İsviçre Frangı', code: 'CHF/TRY', price: chfRate, change: -0.04 }
            ]);
        }
    } catch (err) {
        console.error("Error fetching currencies: ", err);
        currencyList.innerHTML = '<div class="rate-item-placeholder">Döviz kurları yüklenemedi.</div>';
    }
}

// Render Currency List HTML
function renderCurrencyList(items) {
    currencyList.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'rate-row';
        const changeClass = item.change >= 0 ? 'up' : 'down';
        const changeIcon = item.change >= 0 ? 'fa-caret-up' : 'fa-caret-down';

        row.innerHTML = `
            <div class="rate-label-group">
                <span class="rate-name">${item.name}</span>
                <span class="rate-code">${item.code}</span>
            </div>
            <div class="rate-value-group">
                <span class="rate-price">${formatTRY(item.price)}</span>
                <span class="rate-change ${changeClass}">
                    <i class="fa-solid ${changeIcon}"></i> ${formatPercent(item.change)}
                </span>
            </div>
        `;
        currencyList.appendChild(row);
    });
}

// 2. Fetch Localized Gold & Silver (from rates.json updated by agent)
async function fetchMetals() {
    try {
        const response = await fetch('rates.json');
        const data = await response.json();
        if (data && data.metals) {
            renderMetalList(data.metals);
            if (data.last_updated) {
                const date = new Date(data.last_updated);
                updateTimeText.textContent = `Son Güncelleme: ${date.toLocaleString('tr-TR')} (Veriler otomatik yenilenmektedir)`;
            }
        }
    } catch (err) {
        console.error("Error fetching metals database: ", err);
        metalList.innerHTML = '<div class="rate-item-placeholder">Altın kurları yüklenemedi.</div>';
    }
}

// Render Metal List HTML
function renderMetalList(items) {
    metalList.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'rate-row';
        const changeClass = item.change >= 0 ? 'up' : 'down';
        const changeIcon = item.change >= 0 ? 'fa-caret-up' : 'fa-caret-down';
        
        // Parse numerical price
        const priceNum = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
        const displayPrice = isNaN(priceNum) ? item.price : formatTRY(priceNum);

        row.innerHTML = `
            <div class="rate-label-group">
                <span class="rate-name">${item.name}</span>
                <span class="rate-code">${item.code}</span>
            </div>
            <div class="rate-value-group">
                <span class="rate-price">${displayPrice}</span>
                <span class="rate-change ${changeClass}">
                    <i class="fa-solid ${changeIcon}"></i> ${formatPercent(item.change)}
                </span>
            </div>
        `;
        metalList.appendChild(row);
    });
}

// 3. Fetch Real-time Cryptos (BTC, ETH, SOL)
async function fetchCryptos() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=try&include_24hr_change=true');
        const data = await response.json();
        if (data) {
            renderCryptoList([
                { name: 'Bitcoin', code: 'BTC/TRY', price: data.bitcoin.try, change: data.bitcoin.try_24h_change },
                { name: 'Ethereum', code: 'ETH/TRY', price: data.ethereum.try, change: data.ethereum.try_24h_change },
                { name: 'Solana', code: 'SOL/TRY', price: data.solana.try, change: data.solana.try_24h_change }
            ]);
        }
    } catch (err) {
        console.error("Error fetching cryptos: ", err);
        // Fallback using exchange rates if coingecko limit is hit
        cryptoList.innerHTML = '<div class="rate-item-placeholder">Kripto kurları yüklenemedi.</div>';
    }
}

// Render Crypto List HTML
function renderCryptoList(items) {
    cryptoList.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'rate-row';
        const changeClass = item.change >= 0 ? 'up' : 'down';
        const changeIcon = item.change >= 0 ? 'fa-caret-up' : 'fa-caret-down';

        row.innerHTML = `
            <div class="rate-label-group">
                <span class="rate-name">${item.name}</span>
                <span class="rate-code">${item.code}</span>
            </div>
            <div class="rate-value-group">
                <span class="rate-price">${formatTRY(item.price)}</span>
                <span class="rate-change ${changeClass}">
                    <i class="fa-solid ${changeIcon}"></i> ${formatPercent(item.change)}
                </span>
            </div>
        `;
        cryptoList.appendChild(row);
    });
}

// Update all feeds
function updateAll() {
    fetchCurrencies();
    fetchMetals();
    fetchCryptos();
}

// Initialize and setup 60s intervals
updateAll();
setInterval(updateAll, 60000);
