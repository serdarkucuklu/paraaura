// DOM Selectors
const currencyList = document.getElementById('currency-list');
const metalList = document.getElementById('metal-list');
const bankList = document.getElementById('bank-list');
const cryptoList = document.getElementById('crypto-list');
const updateTimeText = document.getElementById('update-time-text');
const chartTitleText = document.getElementById('chart-title');
const searchInput = document.getElementById('search-input');
const leftTickerContainer = document.getElementById('header-left-ticker');
const rightTickerContainer = document.getElementById('header-right-ticker');

// In-memory state tracking
const prevRates = {};
const latestPrices = {
    "Gram Altın": 2860.20,
    "Çeyrek Altın": 4680.00,
    "USD": 32.50,
    "EUR": 34.80,
    "Gümüş": 32.10,
    "BTC": 2100000.00,
    "ETH": 115000.00
};
const latestChanges = {};
let activeAsset = 'Gram Altın';
let activeAssetPrice = 2860.20;
let activeTimeframe = '1g'; // '5dk', '1s', '1g', '1h', '1a', '10y'
let trendChartInstance = null;

// Real-time tick data cache for '5D' timeframe (accrues ticks since page load)
const tickDataCache = {};

// ─── Real history (history.json) + retention state ──────────────────────────
let historyData = null;                 // { points:[{ts, metals:{code:price}, banks_avg}], capped_days }
const metalNameToCode = {};             // 'Gram Altın' -> 'Gram' (filled in renderMetalList)
let watchlist = [];
try { watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]') || []; } catch (e) { watchlist = []; }
const round2 = n => Math.round(n * 100) / 100;

// Helper: Format price in Turkish Lira style
function formatTRY(value) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

// Helper: Format percentage
function formatPercent(value) {
    if (value === undefined || value === null) return '0.00%';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
}

// Helper: Check and apply flash animation if price changes
function applyFlash(elementId, newPrice, currentElement) {
    if (!currentElement) return;
    const oldPrice = prevRates[elementId];
    if (oldPrice !== undefined && oldPrice !== newPrice) {
        const flashClass = newPrice > oldPrice ? 'flash-up' : 'flash-down';
        currentElement.classList.add(flashClass);
        setTimeout(() => {
            currentElement.classList.remove(flashClass);
        }, 1200);
    }
    prevRates[elementId] = newPrice;
}

// Helper: Generate trend points based on timeframe
// Seeded pseudo-random number generator for stable historical charts
function seededRandom(seedString) {
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
        hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
    }
    return function() {
        const x = Math.sin(hash++) * 10000;
        return x - Math.floor(x);
    };
}

// Helper: Generate trend points based on timeframe
function generateTimeframeData(basePrice, timeframe) {
    const labels = [];
    const points = [];
    const now = new Date();
    
    // We want a seeded generator so historical data is stable and doesn't morph on every 10s tick.
    const rng = seededRandom(activeAsset + '_' + timeframe);
    
    if (timeframe === '5dk') {
        if (!tickDataCache[activeAsset]) {
            tickDataCache[activeAsset] = [];
            let val = basePrice * 0.998;
            const initialRng = seededRandom(activeAsset + '_5dk_init');
            for (let i = 19; i >= 0; i--) {
                val = val * (1 + (initialRng() - 0.5) * 0.0008);
                const tickTime = new Date(now.getTime() - i * 10000);
                tickDataCache[activeAsset].push({
                    time: tickTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    price: parseFloat(val.toFixed(2))
                });
            }
            tickDataCache[activeAsset][tickDataCache[activeAsset].length - 1].price = basePrice;
        }
        
        const cache = tickDataCache[activeAsset];
        return {
            labels: cache.map(item => item.time),
            points: cache.map(item => item.price)
        };
    }
    
    let count = 30; // default for Günlük
    let timeUnit = 'day';
    
    if (timeframe === '1s') { // Saatlik
        count = 24;
        timeUnit = 'hour';
    } else if (timeframe === '1g') { // Günlük
        count = 30;
        timeUnit = 'day';
    } else if (timeframe === '1h') { // Haftalık
        count = 12;
        timeUnit = 'week';
    } else if (timeframe === '1a') { // Aylık
        count = 12;
        timeUnit = 'month';
    } else if (timeframe === '10y') { // 10 Yıllık
        count = 10;
        timeUnit = 'year';
    }
    
    for (let i = count - 1; i >= 0; i--) {
        const date = new Date(now);
        if (timeUnit === 'hour') {
            date.setHours(now.getHours() - i);
            labels.push(date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
        } else if (timeUnit === 'day') {
            date.setDate(now.getDate() - i);
            labels.push(date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
        } else if (timeUnit === 'week') {
            date.setDate(now.getDate() - i * 7);
            labels.push(date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' Hft');
        } else if (timeUnit === 'month') {
            date.setMonth(now.getMonth() - i);
            labels.push(date.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }));
        } else if (timeUnit === 'year') {
            date.setFullYear(now.getFullYear() - i);
            labels.push(date.getFullYear().toString());
        }
    }
    
    // Generate stable random walk using the seeded RNG
    let current = basePrice * (1 - (count * 0.003));
    for (let i = 0; i < count; i++) {
        const pct = (i / (count - 1));
        const target = basePrice;
        const drift = (target - current) * (pct * 0.5);
        const maxDev = timeframe === '10y' ? 0.35 : (timeframe === '1a' ? 0.15 : (timeframe === '1h' ? 0.08 : 0.03));
        const rand = (rng() - 0.5) * (basePrice * maxDev / count);
        current = current + drift + rand;
        points.push(parseFloat(current.toFixed(2)));
    }
    points[points.length - 1] = basePrice; // force last point to current value
    return { labels, points };
}

// Custom Chart.js Plugin for vertical crosshair line
const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart) => {
        if (chart.tooltip?._active?.length) {
            const activePoint = chart.tooltip._active[0];
            const ctx = chart.ctx;
            const x = activePoint.element.x;
            const topY = chart.scales.y.top;
            const bottomY = chart.scales.y.bottom;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(212, 181, 114, 0.25)'; // gold line
            ctx.setLineDash([4, 4]); // dashed line
            ctx.stroke();
            ctx.restore();
        }
    }
};

// Update Chart.js Instance
function updateChart(assetName, price) {
    activeAsset = assetName;
    activeAssetPrice = price;
    chartTitleText.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${assetName}`;

    // Prefer REAL accumulated history for metals (Saatlik/Günlük); otherwise estimated trend.
    const realSeries = metalNameToCode[assetName] ? getRealMetalSeries(activeTimeframe) : null;
    const { labels, points } = realSeries || generateTimeframeData(price, activeTimeframe);
    setChartSourceBadge(!!realSeries);
    const ctx = document.getElementById('trend-chart').getContext('2d');
    
    if (trendChartInstance) {
        trendChartInstance.data.labels = labels;
        trendChartInstance.data.datasets[0].data = points;
        trendChartInstance.data.datasets[0].label = `${assetName} (TRY)`;
        // Update gradient background dynamically on chart update
        const chartArea = trendChartInstance.chartArea;
        if (chartArea) {
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(212, 181, 114, 0.22)');
            gradient.addColorStop(1, 'rgba(212, 181, 114, 0.00)');
            trendChartInstance.data.datasets[0].backgroundColor = gradient;
        }
        trendChartInstance.update('none'); // silent update
    } else {
        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${assetName} (TRY)`,
                    data: points,
                    borderColor: '#d4b572',
                    borderWidth: 2,
                    backgroundColor: function(context) {
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        if (!chartArea) return 'rgba(212, 181, 114, 0.05)';
                        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, 'rgba(212, 181, 114, 0.22)');
                        gradient.addColorStop(1, 'rgba(212, 181, 114, 0.00)');
                        return gradient;
                    },
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#d4b572',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 0, // clean look, show only on hover
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#d4b572',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        padding: 12,
                        backgroundColor: '#1c1d21',
                        titleFont: { family: 'Inter', size: 11, weight: 'bold' },
                        bodyFont: { family: 'Inter', size: 12 },
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Fiyat: ${formatTRY(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9aa0ab', font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 0 }
                    },
                    y: {
                        grid: { color: 'rgba(212,181,114,0.12)' },
                        ticks: { color: '#9aa0ab', font: { family: 'JetBrains Mono', size: 9 } }
                    }
                }
            },
            plugins: [verticalLinePlugin]
        });
    }
}

// 1. Fetch Real-time Currencies (Expanded list: USD, EUR, GBP, CHF, JPY, CAD, AUD, SAR, AED)
async function fetchCurrencies() {
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();
        if (data && data.rates) {
            const tryRate = data.rates['TRY'];
            
            const items = [
                { name: 'Amerikan Doları', code: 'USD/TRY', price: tryRate, change: 0.05 },
                { name: 'Euro', code: 'EUR/TRY', price: tryRate / data.rates['EUR'], change: -0.04 },
                { name: 'İngiliz Sterlini', code: 'GBP/TRY', price: tryRate / data.rates['GBP'], change: 0.11 },
                { name: 'İsviçre Frangı', code: 'CHF/TRY', price: tryRate / data.rates['CHF'], change: -0.01 },
                { name: 'Japon Yeni (100)', code: 'JPY/TRY', price: (tryRate / data.rates['JPY']) * 100, change: -0.08 },
                { name: 'Kanada Doları', code: 'CAD/TRY', price: tryRate / data.rates['CAD'], change: 0.02 },
                { name: 'Avustralya Doları', code: 'AUD/TRY', price: tryRate / data.rates['AUD'], change: 0.04 },
                { name: 'Suudi Arabistan Riyali', code: 'SAR/TRY', price: tryRate / data.rates['SAR'], change: 0.01 },
                { name: 'BAE Dirhemi', code: 'AED/TRY', price: tryRate / data.rates['AED'], change: 0.01 }
            ];
            
            renderCurrencyList(items);
        }
    } catch (err) {
        console.error("Error fetching currencies: ", err);
        if (!currencyList.querySelector('.rate-row')) {
            currencyList.innerHTML = '<div class="rate-item-placeholder">Döviz kurları yüklenemedi.</div>';
        }
    }
}

function renderCurrencyList(items) {
    currencyList.innerHTML = '';
    items.forEach(item => {
        if (item.code === 'USD/TRY') {
            latestPrices['USD'] = item.price;
            latestChanges['USD'] = item.change;
        } else if (item.code === 'EUR/TRY') {
            latestPrices['EUR'] = item.price;
            latestChanges['EUR'] = item.change;
        }
        
        const row = document.createElement('div');
        const isActive = activeAsset === item.name;
        row.className = `rate-row${isActive ? ' active' : ''}`;
        row.dataset.search = `${item.name} ${item.code}`.toLowerCase();
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
        
        row.addEventListener('click', () => {
            document.querySelectorAll('.rate-row, .bank-row').forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            updateChart(item.name, item.price);
            document.getElementById('trend-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        addWatchStar(row, item.name);
        currencyList.appendChild(row);
        applyFlash(`curr_${item.code}`, item.price, row);
        if (isActive) {
            activeAssetPrice = item.price;
        }
    });
    applySearchFilter();
}

// 2. Fetch Metals & Bank Spreads from rates.json
async function fetchMetalsAndBanks() {
    try {
        const response = await fetch('rates.json');
        const data = await response.json();
        
        if (data) {
            if (data.metals) {
                renderMetalList(data.metals);
            }
            if (data.banks) {
                renderBankList(data.banks);
            } else {
                // If bank rates are missing in rates.json, auto-generate them dynamically based on physical Gram Gold
                const physicalGold = data.metals ? parseFloat(data.metals.find(m => m.code === 'Fiziki').price) : 2900;
                generateFallbackBanks(physicalGold);
            }
            if (data.last_updated) {
                const date = new Date(data.last_updated);
                const rel = window.NobleVision ? NobleVision.relativeTime(date) : date.toLocaleString('tr-TR');
                updateTimeText.textContent = `Son Güncelleme: ${rel} · Veriler anlık taranmaktadır`;
                updateTimeText.title = date.toLocaleString('tr-TR');
            }
            renderAnalysis(data.analysis); // "Günün Yorumu" card
        }
    } catch (err) {
        console.error("Error fetching metals/banks database: ", err);
        if (!metalList.querySelector('.rate-row')) {
            metalList.innerHTML = '<div class="rate-item-placeholder">Metal fiyatları yüklenemedi.</div>';
        }
        if (!bankList.querySelector('.bank-row')) {
            bankList.innerHTML = '<div class="rate-item-placeholder">Banka kurları yüklenemedi.</div>';
        }
    }
}

function renderMetalList(items) {
    metalList.innerHTML = '';
    items.forEach(item => {
        metalNameToCode[item.name] = item.code; // enables real-history charts + buy signal
        const priceNum = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
        if (!isNaN(priceNum)) {
            latestPrices[item.name] = priceNum;
            latestChanges[item.name] = item.change;
        }

        const row = document.createElement('div');
        const isActive = activeAsset === item.name;
        row.className = `rate-row${isActive ? ' active' : ''}`;
        row.dataset.search = `${item.name} ${item.code}`.toLowerCase();
        const changeClass = item.change >= 0 ? 'up' : 'down';
        const changeIcon = item.change >= 0 ? 'fa-caret-up' : 'fa-caret-down';
        const displayPrice = isNaN(priceNum) ? item.price : formatTRY(priceNum);

        // Buy-signal: current price within 2% of the real 30-day low.
        let signalHtml = '';
        const lo30 = metalLow(item.code, 30);
        if (lo30 && !isNaN(priceNum) && priceNum <= lo30 * 1.02) {
            signalHtml = `<span class="buy-signal" title="Son 30 günün en düşük seviyelerine yakın">🟢 30 günün dibinde</span>`;
        }

        row.innerHTML = `
            <div class="rate-label-group">
                <span class="rate-name">${item.name}</span>
                <span class="rate-code">${item.code}</span>
                ${signalHtml}
            </div>
            <div class="rate-value-group">
                <span class="rate-price">${displayPrice}</span>
                <span class="rate-change ${changeClass}">
                    <i class="fa-solid ${changeIcon}"></i> ${formatPercent(item.change)}
                </span>
            </div>
        `;
        addWatchStar(row, item.name);

        row.addEventListener('click', () => {
            document.querySelectorAll('.rate-row, .bank-row').forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            updateChart(item.name, isNaN(priceNum) ? 1000 : priceNum);
            document.getElementById('trend-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        metalList.appendChild(row);
        applyFlash(`metal_${item.code}`, isNaN(priceNum) ? 0 : priceNum, row);
        if (isActive) {
            activeAssetPrice = isNaN(priceNum) ? 1000 : priceNum;
        }
    });
    applySearchFilter();
}

function renderBankList(items) {
    bankList.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        const isActive = activeAsset === `${item.name} Altın`;
        row.className = `bank-row${isActive ? ' active' : ''}`;
        
        const buyNum = parseFloat(item.buy.toString().replace(/[^0-9.-]+/g, ""));
        const sellNum = parseFloat(item.sell.toString().replace(/[^0-9.-]+/g, ""));
        const spread = (!isNaN(buyNum) && !isNaN(sellNum)) ? (sellNum - buyNum) : null;

        // Show the stored daily change % (was collected but never displayed).
        let changeBadge = '';
        if (item.change !== undefined && item.change !== null && item.change !== '') {
            const ch = parseFloat(item.change);
            if (!isNaN(ch)) {
                const cls = ch >= 0 ? 'up' : 'down';
                const ic = ch >= 0 ? 'fa-caret-up' : 'fa-caret-down';
                changeBadge = `<span class="rate-change ${cls} bank-change"><i class="fa-solid ${ic}"></i> ${formatPercent(ch)}</span>`;
            }
        }
        const spreadText = spread !== null ? `Makas: ${formatTRY(spread)}` : 'Gram Altın Makas';

        row.innerHTML = `
            <div class="rate-label-group">
                <span class="rate-name">${item.name}</span>
                <span class="rate-code">${spreadText}</span>
                ${changeBadge}
            </div>
            <span class="bank-price-buy">${formatTRY(buyNum)}</span>
            <span class="bank-price-sell">${formatTRY(sellNum)}</span>
        `;

        row.addEventListener('click', () => {
            document.querySelectorAll('.rate-row, .bank-row').forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            updateChart(`${item.name} Altın`, sellNum);
            document.getElementById('trend-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        bankList.appendChild(row);
        applyFlash(`bank_${item.name}`, sellNum, row);
        if (isActive) {
            activeAssetPrice = sellNum;
        }
    });
}

// Generate extensive bank rates based on Gram Gold price (e.g. Makas/Spreads)
function generateFallbackBanks(gramGoldPrice) {
    const bankNames = [
        { name: 'Garanti BBVA', spread: 0.045 },
        { name: 'Akbank', spread: 0.042 },
        { name: 'Yapı Kredi', spread: 0.048 },
        { name: 'Ziraat Bankası', spread: 0.038 },
        { name: 'Vakıfbank', spread: 0.039 },
        { name: 'Halkbank', spread: 0.040 },
        { name: 'İş Bankası', spread: 0.041 },
        { name: 'QNB Finansbank', spread: 0.046 },
        { name: 'Kuveyt Türk', spread: 0.028 } // tight gold spread
    ];
    
    const banks = bankNames.map(b => {
        const buy = gramGoldPrice * (1 - (b.spread / 2));
        const sell = gramGoldPrice * (1 + (b.spread / 2));
        return { name: b.name, buy: buy.toFixed(2), sell: sell.toFixed(2) };
    });
    
    renderBankList(banks);
}

// 3. Fetch Real-time Cryptos (BTC, ETH, SOL)
async function fetchCryptos() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=try&include_24hr_change=true');
        const data = await response.json();
        if (data) {
            const items = [
                { name: 'Bitcoin', code: 'BTC/TRY', price: data.bitcoin.try, change: data.bitcoin.try_24h_change },
                { name: 'Ethereum', code: 'ETH/TRY', price: data.ethereum.try, change: data.ethereum.try_24h_change },
                { name: 'Solana', code: 'SOL/TRY', price: data.solana.try, change: data.solana.try_24h_change }
            ];
            renderCryptoList(items);
        }
    } catch (err) {
        console.error("Error fetching cryptos: ", err);
        if (!cryptoList.querySelector('.rate-row')) {
            cryptoList.innerHTML = '<div class="rate-item-placeholder">Kripto kurları yüklenemedi.</div>';
        }
    }
}

function renderCryptoList(items) {
    cryptoList.innerHTML = '';
    items.forEach(item => {
        if (item.name === 'Bitcoin') {
            latestPrices['BTC'] = item.price;
            latestChanges['BTC'] = item.change;
        } else if (item.name === 'Ethereum') {
            latestPrices['ETH'] = item.price;
            latestChanges['ETH'] = item.change;
        }
        
        const row = document.createElement('div');
        const isActive = activeAsset === item.name;
        row.className = `rate-row${isActive ? ' active' : ''}`;
        row.dataset.search = `${item.name} ${item.code}`.toLowerCase();
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

        row.addEventListener('click', () => {
            document.querySelectorAll('.rate-row, .bank-row').forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            updateChart(item.name, item.price);
            document.getElementById('trend-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        addWatchStar(row, item.name);
        cryptoList.appendChild(row);
        applyFlash(`crypto_${item.code}`, item.price, row);
        if (isActive) {
            activeAssetPrice = item.price;
        }
    });
    applySearchFilter();
}

// Apply real-time search filtration on all lists
function applySearchFilter() {
    const val = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('.rate-row').forEach(row => {
        if (!val) {
            row.style.display = 'flex';
        } else {
            const searchData = row.dataset.search || '';
            if (searchData.includes(val)) {
                row.style.display = 'flex';
            } else {
                row.style.display = 'none';
            }
        }
    });
}

// 10s silent update loop
async function updateFeeds() {
    await Promise.all([
        fetchCurrencies(),
        fetchMetalsAndBanks(),
        fetchCryptos()
    ]);
    
    // Append real-time tick if 5dk timeframe is selected
    if (activeTimeframe === '5dk') {
        if (!tickDataCache[activeAsset]) {
            // will be initialized in generateTimeframeData
        } else {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            tickDataCache[activeAsset].push({
                time: timeStr,
                price: activeAssetPrice
            });
            if (tickDataCache[activeAsset].length > 30) {
                tickDataCache[activeAsset].shift(); // keep last 30 ticks
            }
        }
    }
    
    updateChart(activeAsset, activeAssetPrice);
    renderPortfolio();
    renderWatchlist();
    checkAlarms();
    updateHeaderTickers();
    updateDynamicTitle();

    // Make freshly-rendered rows keyboard-focusable (re-applied after each re-render).
    document.querySelectorAll('.rate-row, .bank-row').forEach(r => {
        if (!r.hasAttribute('tabindex')) { r.tabIndex = 0; r.setAttribute('role', 'button'); }
    });
}

// Dynamic browser title tag updater for real-time SEO CTR
function updateDynamicTitle() {
    const gramGoldPrice = latestPrices['Gram Altın'];
    const usdPrice = latestPrices['USD'];
    if (gramGoldPrice && usdPrice) {
        document.title = `Gram Altın: ${formatTRY(gramGoldPrice)} | Dolar: ${formatTRY(usdPrice)} | ParaAura`;
    }
}

// Select asset by name across all lists and scroll to chart
window.selectAssetByName = function(name) {
    const rows = Array.from(document.querySelectorAll('.rate-row, .bank-row'));
    const targetRow = rows.find(row => {
        const nameEl = row.querySelector('.rate-name');
        return nameEl && nameEl.textContent.trim().toLowerCase() === name.toLowerCase();
    });
    if (targetRow) {
        targetRow.click();
    } else {
        // Fallback directly
        const price = latestPrices[name];
        if (price !== undefined) {
            document.querySelectorAll('.rate-row, .bank-row').forEach(r => r.classList.remove('active'));
            updateChart(name, price);
            document.getElementById('trend-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
};

// Update left and right header tickers dynamically
function updateHeaderTickers() {
    if (!leftTickerContainer || !rightTickerContainer) return;
    
    const leftAssets = [
        { label: 'ONS', name: 'Ons Altın', key: 'Ons Altın', format: val => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val) },
        { label: 'USD', name: 'Amerikan Doları', key: 'USD', format: val => formatTRY(val) },
        { label: 'EUR', name: 'Euro', key: 'EUR', format: val => formatTRY(val) }
    ];
    
    const rightAssets = [
        { label: 'GRAM', name: 'Gram Altın', key: 'Gram Altın', format: val => formatTRY(val) },
        { label: 'ÇEYREK', name: 'Çeyrek Altın', key: 'Çeyrek Altın', format: val => formatTRY(val) },
        { label: 'BTC', name: 'Bitcoin', key: 'BTC', format: val => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val) }
    ];
    
    const buildTickerHTML = (assets) => {
        return assets.map(asset => {
            const price = latestPrices[asset.key] || 0;
            const change = latestChanges[asset.key] || 0;
            
            if (!price) return '';
            
            const changeClass = change >= 0 ? 'up' : 'down';
            const changeIcon = change >= 0 ? 'fa-caret-up' : 'fa-caret-down';
            
            return `
                <div class="ticker-badge" onclick="selectAssetByName('${asset.name}')">
                    <span class="ticker-label">${asset.label}</span>
                    <span class="ticker-val">${asset.format(price)}</span>
                    <span class="ticker-pct ${changeClass}">
                        <i class="fa-solid ${changeIcon}"></i> ${formatPercent(change)}
                    </span>
                </div>
            `;
        }).join('');
    };
    
    leftTickerContainer.innerHTML = buildTickerHTML(leftAssets);
    rightTickerContainer.innerHTML = buildTickerHTML(rightAssets);
}

// Setup timeframe buttons click listeners
function initTimeframeControls() {
    const btns = Array.from(document.querySelectorAll('.timeframe-btn'));
    btns.forEach((btn, i) => {
        btn.addEventListener('click', () => {
            btns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            activeTimeframe = btn.dataset.range;
            updateChart(activeAsset, activeAssetPrice);
        });
        // Arrow-key navigation between tabs (WAI-ARIA tablist pattern).
        btn.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            const next = btns[(i + dir + btns.length) % btns.length];
            next.focus(); next.click();
        });
    });
}

// Portfolio Management State
let portfolio = {}; // format: { assetCode: { amount: X, cost: Y } }
let portfolioChart = null;
let portfolioHistoryChart = null;

// Total current market value of the portfolio (used by portfolio-level alarms too).
function portfolioTotalValue() {
    let t = 0;
    for (const k in portfolio) {
        const it = portfolio[k] || {};
        t += (it.amount || 0) * (latestPrices[k] || 0);
    }
    return t;
}

// Record one daily snapshot of total portfolio value (free, localStorage) → "am I up?" chart.
function snapshotPortfolioValue(totalValue) {
    if (!(totalValue > 0)) return null;
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem('portfolio_history') || '[]') || []; } catch (e) { hist = []; }
    const today = new Date().toISOString().slice(0, 10);
    if (hist.length && hist[hist.length - 1].date === today) hist[hist.length - 1].value = round2(totalValue);
    else hist.push({ date: today, value: round2(totalValue) });
    if (hist.length > 120) hist = hist.slice(-120);
    localStorage.setItem('portfolio_history', JSON.stringify(hist));
    return hist;
}

// % change of portfolio value vs `days` ago (nearest earlier snapshot). null if not enough data.
function perfSince(hist, days) {
    if (!hist || hist.length < 2) return null;
    const cur = hist[hist.length - 1].value;
    const targetDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    let base = null;
    for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].date <= targetDate) { base = hist[i].value; break; }
    }
    if (base === null) base = hist[0].value;
    if (!base) return null;
    return ((cur - base) / base) * 100;
}

function renderPortfolioHistory(hist) {
    const section = document.getElementById('portfolio-history-section');
    if (!section) return;
    if (!hist || hist.length < 2) { section.style.display = 'none'; return; }
    section.style.display = '';

    const setPerf = (id, days, label) => {
        const el = document.getElementById(id);
        if (!el) return;
        const p = perfSince(hist, days);
        if (p === null) { el.textContent = `${label} —`; el.className = 'ph-perf'; return; }
        el.textContent = `${label} ${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
        el.className = 'ph-perf ' + (p >= 0 ? 'up' : 'down');
    };
    setPerf('ph-perf-1', 1, 'Bugün');
    setPerf('ph-perf-7', 7, '7g');
    setPerf('ph-perf-30', 30, '30g');

    const el = document.getElementById('portfolio-history-chart');
    if (!el || typeof Chart === 'undefined') return;
    const labels = hist.map(h => new Date(h.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
    const data = hist.map(h => h.value);
    if (portfolioHistoryChart) {
        portfolioHistoryChart.data.labels = labels;
        portfolioHistoryChart.data.datasets[0].data = data;
        portfolioHistoryChart.update('none');
    } else {
        portfolioHistoryChart = new Chart(el.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [{ data, borderColor: '#d4b572', borderWidth: 2, fill: true, backgroundColor: 'rgba(212,181,114,.10)', tension: 0.3, pointRadius: 0, pointHoverRadius: 5 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatTRY(c.parsed.y) } } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#9aa0ab', font: { size: 8 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                    y: { grid: { color: 'rgba(212,181,114,.12)' }, ticks: { color: '#9aa0ab', font: { size: 8 } } }
                }
            }
        });
    }
}

// Load from local storage
function loadPortfolio() {
    const saved = localStorage.getItem('portfolio');
    if (saved) {
        try {
            const raw = JSON.parse(saved);
            portfolio = {};
            for (const key in raw) {
                if (raw[key] && typeof raw[key] === 'object' && 'amount' in raw[key]) {
                    portfolio[key] = raw[key];
                } else if (typeof raw[key] === 'number') {
                    portfolio[key] = { amount: raw[key], cost: latestPrices[key] || 0 };
                }
            }
        } catch (e) {
            portfolio = {};
        }
    }
}

// Save to local storage
function savePortfolio() {
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
}

// Render Portfolio
function renderPortfolio() {
    const listContainer = document.getElementById('portfolio-items-list');
    const contentDiv = document.getElementById('portfolio-content');
    const emptyStateDiv = document.getElementById('portfolio-empty-state');
    const totalValText = document.getElementById('portfolio-total-value');
    const totalPlText = document.getElementById('portfolio-total-pl');
    const totalChangeText = document.getElementById('portfolio-total-change');
    const aiInsightCard = document.getElementById('ai-insight-card');

    if (!listContainer) return;

    listContainer.innerHTML = '';
    const assetKeys = Object.keys(portfolio);
    
    if (assetKeys.length === 0) {
        contentDiv.style.display = 'none';
        emptyStateDiv.style.display = 'block';
        aiInsightCard.style.display = 'none';
        return;
    }

    contentDiv.style.display = 'block';
    emptyStateDiv.style.display = 'none';

    let totalValue = 0;
    let totalCost = 0;
    let weightedChange = 0;
    let chartLabels = [];
    let chartValues = [];
    let chartColors = ['#ffd075', '#8f8ba8', '#4ade80', '#f3a152', '#26d0ce', '#ff9ff3', '#ec4899'];

    assetKeys.forEach((assetCode, index) => {
        const itemData = portfolio[assetCode] || { amount: 0, cost: 0 };
        const amount = itemData.amount || 0;
        const cost = itemData.cost || 0;
        const price = latestPrices[assetCode] || 0;
        const change = latestChanges[assetCode] || 0;
        
        const itemVal = amount * price;
        const itemCost = amount * cost;
        const itemPl = itemVal - itemCost;
        const itemPlPct = cost > 0 ? ((price - cost) / cost) * 100 : 0;

        totalValue += itemVal;
        totalCost += itemCost;
        weightedChange += itemVal * change;

        chartLabels.push(assetCode);
        chartValues.push(parseFloat(itemVal.toFixed(2)));

        const itemRow = document.createElement('div');
        itemRow.className = 'portfolio-item';
        
        let displayName = assetCode;
        if (assetCode === 'USD') displayName = 'Dolar';
        if (assetCode === 'EUR') displayName = 'Euro';

        itemRow.innerHTML = `
            <div class="portfolio-item-info">
                <span class="portfolio-item-name">${displayName}</span>
                <span class="portfolio-item-amount">${amount} birim @ Maliyet: ${formatTRY(cost)}</span>
            </div>
            <div class="portfolio-item-value-block">
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                    <span class="portfolio-item-val">${formatTRY(itemVal)}</span>
                    <span class="portfolio-item-pl ${itemPl >= 0 ? 'pl-up' : 'pl-down'}" style="font-size: 0.75rem; font-weight: 600;">
                        ${itemPl >= 0 ? '▲' : '▼'} ${itemPl >= 0 ? '+' : ''}${itemPlPct.toFixed(2)}%
                    </span>
                </div>
                <button class="portfolio-item-delete" onclick="deletePortfolioItem('${assetCode}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        listContainer.appendChild(itemRow);
    });

    if (window.NobleVision) NobleVision.countUp(totalValText, totalValue, { format: formatTRY });
    else totalValText.textContent = formatTRY(totalValue);

    // Total profit loss
    const netPl = totalValue - totalCost;
    const netPlPct = totalCost > 0 ? (netPl / totalCost) * 100 : 0;
    const plClass = netPl >= 0 ? 'pl-up' : 'pl-down';
    const plSign = netPl >= 0 ? '+' : '';
    if (totalPlText) {
        totalPlText.textContent = `${plSign}${netPlPct.toFixed(2)}% (${formatTRY(netPl)})`;
        totalPlText.className = `stat-value ${plClass}`;
    }
    
    const finalChange = totalValue > 0 ? (weightedChange / totalValue) : 0;
    const changeClass = finalChange >= 0 ? 'pl-up' : 'pl-down';
    const changeIcon = finalChange >= 0 ? '+' : '';
    totalChangeText.textContent = `${changeIcon}${finalChange.toFixed(2)}%`;
    totalChangeText.className = `stat-value ${changeClass}`;

    // Update Pie Chart
    updatePortfolioChart(chartLabels, chartValues, chartColors);

    // Daily value snapshot + "am I up?" performance chart (retention: the daily return reason)
    const valueHist = snapshotPortfolioValue(totalValue);
    renderPortfolioHistory(valueHist);

    // AI Insights
    aiInsightCard.style.display = 'block';
    renderAIInsights(totalValue, finalChange);
}

// Update Chart.js Pie Chart
function updatePortfolioChart(labels, data, colors) {
    const chartEl = document.getElementById('portfolio-pie-chart');
    if (!chartEl) return;
    const ctx = chartEl.getContext('2d');
    
    if (portfolioChart) {
        portfolioChart.destroy();
    }

    portfolioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            cutout: '65%'
        }
    });
}

// Delete Item
window.deletePortfolioItem = function(assetCode) {
    delete portfolio[assetCode];
    savePortfolio();
    renderPortfolio();
};

// Add Item
function addPortfolioItem() {
    const select = document.getElementById('portfolio-asset-select');
    const input = document.getElementById('portfolio-amount-input');
    const costInput = document.getElementById('portfolio-cost-input');
    
    const assetCode = select.value;
    const amount = parseFloat(input.value);
    const cost = parseFloat(costInput.value) || latestPrices[assetCode] || 0;

    if (isNaN(amount) || amount <= 0) {
        if (window.NobleVision) NobleVision.toast('Lütfen geçerli bir miktar giriniz.', 'down');
        else alert('Lütfen geçerli bir miktar giriniz.');
        return;
    }

    if (portfolio[assetCode]) {
        // Calculate new average cost
        const existing = portfolio[assetCode];
        const totalAmount = existing.amount + amount;
        const totalCost = (existing.amount * existing.cost) + (amount * cost);
        portfolio[assetCode] = {
            amount: totalAmount,
            cost: totalAmount > 0 ? (totalCost / totalAmount) : 0
        };
    } else {
        portfolio[assetCode] = { amount: amount, cost: cost };
    }

    input.value = '';
    costInput.value = '';
    savePortfolio();
    renderPortfolio();
}

// ─── PRICE ALARMS LOGIC ───────────────────────────────────────────────────
let alarms = [];

function loadAlarms() {
    const saved = localStorage.getItem('price_alarms');
    if (saved) {
        try {
            alarms = JSON.parse(saved);
        } catch(e) {
            alarms = [];
        }
    }
}

function saveAlarms() {
    localStorage.setItem('price_alarms', JSON.stringify(alarms));
}

function renderAlarms() {
    const alarmsList = document.getElementById('alarms-list');
    if (!alarmsList) return;
    
    alarmsList.innerHTML = '';
    if (alarms.length === 0) {
        alarmsList.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.8rem; text-align: center; padding: 10px 0;">Aktif fiyat alarmı bulunmamaktadır.</p>`;
        return;
    }
    
    alarms.forEach((alarm, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'alarm-item';
        
        const condSymbol = alarm.condition === 'above' ? '≥' : '≤';
        const label = alarm.assetCode === '__PORTFOLIO__' ? 'Toplam Portföy' : alarm.assetCode;
        const recurBadge = alarm.recur ? ' <i class="fa-solid fa-repeat" title="Her gün tekrar uyarır" style="color: var(--accent, #d4b572);"></i>' : '';
        itemRow.innerHTML = `
            <span class="alarm-item-text"><i class="fa-solid fa-bell"></i> ${label} ${condSymbol} ${formatTRY(alarm.target)}${recurBadge}</span>
            <button class="alarm-delete" onclick="deleteAlarm(${index})">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        alarmsList.appendChild(itemRow);
    });
}

window.deleteAlarm = function(idx) {
    alarms.splice(idx, 1);
    saveAlarms();
    renderAlarms();
};

function addAlarm() {
    const assetSelect = document.getElementById('alarm-asset-select');
    const conditionSelect = document.getElementById('alarm-condition-select');
    const targetInput = document.getElementById('alarm-target-input');
    
    const assetCode = assetSelect.value;
    const condition = conditionSelect.value;
    const target = parseFloat(targetInput.value);
    
    if (isNaN(target) || target <= 0) {
        if (window.NobleVision) NobleVision.toast('Lütfen geçerli bir hedef fiyat giriniz.', 'down');
        else alert('Lütfen geçerli bir hedef fiyat giriniz.');
        return;
    }
    
    // Request permission on setting alarm
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
    
    const recur = !!document.getElementById('alarm-recur')?.checked;
    alarms.push({ assetCode, condition, target, recur, lastFired: null });
    saveAlarms();
    renderAlarms();

    targetInput.value = '';
    const recurEl = document.getElementById('alarm-recur');
    if (recurEl) recurEl.checked = false;

    const label = assetCode === '__PORTFOLIO__' ? 'Toplam portföy' : assetCode;
    sendNotification('Alarm Kuruldu 🔔', `${label} için ${condition === 'above' ? 'yükseliş' : 'düşüş'} yönlü ${formatTRY(target)} alarmı kuruldu${recur ? ' (her gün tekrar)' : ''}.`);
}

function checkAlarms() {
    if (alarms.length === 0) return;
    const today = new Date().toDateString();
    let fired = false;
    const remaining = [];

    alarms.forEach((alarm) => {
        const price = alarm.assetCode === '__PORTFOLIO__' ? portfolioTotalValue() : latestPrices[alarm.assetCode];
        if (!price) { remaining.push(alarm); return; }
        // Recurring alarms fire at most once per calendar day.
        if (alarm.recur && alarm.lastFired === today) { remaining.push(alarm); return; }

        const isTriggered = (alarm.condition === 'above' && price >= alarm.target) ||
                            (alarm.condition === 'below' && price <= alarm.target);
        if (!isTriggered) { remaining.push(alarm); return; }

        const label = alarm.assetCode === '__PORTFOLIO__' ? 'Toplam portföy' : alarm.assetCode;
        sendNotification('Fiyat Alarmı Tetiklendi! ⚡',
            `${label} ${formatTRY(price)} — hedef ${formatTRY(alarm.target)} ${alarm.condition === 'above' ? 'üstü' : 'altı'}.`);
        fired = true;
        if (alarm.recur) { alarm.lastFired = today; remaining.push(alarm); } // keep, throttled to once/day
        // non-recurring: dropped (one-shot)
    });

    if (fired) { alarms = remaining; saveAlarms(); renderAlarms(); }
}

function sendNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { 
            body: body,
            icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239e7d28"%3E%3Ccircle cx="12" cy="12" r="9"/%3E%3C/svg%3E'
        });
    }
    
    // Premium toast (NVDS) replaces the bespoke banner.
    if (window.NobleVision) {
        NobleVision.toast(`${title}: ${body}`, title.includes('Tetiklendi') ? 'up' : 'info');
    }
}

// Generate daily AI market commentary
function renderAIInsights(totalValue, finalChange) {
    const aiInsightText = document.getElementById('ai-insight-text');
    if (!aiInsightText) return;
    let commentary = "";

    const assetKeys = Object.keys(portfolio);
    if (assetKeys.length === 0) return;

    const mainAsset = assetKeys.reduce((a, b) => {
        const valA = (portfolio[a]?.amount || 0) * (latestPrices[a] || 0);
        const valB = (portfolio[b]?.amount || 0) * (latestPrices[b] || 0);
        return valA > valB ? a : b;
    });

    commentary += `Portföyünüzün toplam değeri <strong>${formatTRY(totalValue)}</strong> seviyesinde. `;
    if (finalChange >= 0) {
        commentary += `Bugün piyasalardaki hareketlilik varlıklarınıza <strong>+%${finalChange.toFixed(2)}</strong> oranında pozitif yansıdı. `;
    } else {
        commentary += `Bugün portföyünüzde <strong>-%${Math.abs(finalChange).toFixed(2)}</strong> oranında hafif bir geri çekilme gözlendi. `;
    }

    if (mainAsset === 'Gram Altın' || mainAsset === 'Çeyrek Altın') {
        commentary += `Portföyünüzün ağırlıklı gücünü <strong>altın varlıklarınız</strong> oluşturuyor. Enflasyona karşı korumacı ve güvenli liman stratejiniz dengeli duruyor. `;
    } else if (mainAsset === 'USD' || mainAsset === 'EUR') {
        commentary += `Döviz ağırlıklı yapınız nedeniyle kurlardaki değişimler portföyünüzü doğrudan etkilemekte. Banka makas aralıklarına dikkat etmenizi öneririz. `;
    } else if (mainAsset === 'BTC' || mainAsset === 'ETH') {
        commentary += `Portföyünüzün öncüsü <strong>kripto para varlıkları</strong>. Yüksek getiri potansiyelinin yanında volatilite riskini azaltmak için diğer varlıklarla sepeti çeşitlendirmek faydalı olabilir. `;
    }

    commentary += `<br><br><i class="fa-solid fa-lightbulb" style="color: var(--accent-gold); margin-right: 6px;"></i> <strong>Altınım Önerisi:</strong> Altın ve gümüş kurlarındaki anlık Kapalıçarşı-banka makas farklarını inceleyerek fiziksel birikimlerinizi optimize edebilirsiniz.`;

    aiInsightText.innerHTML = commentary;
}


// ─── Real history, watchlist, streak, analysis & buy-signal ─────────────────

// Load accumulated real price history (built hourly by agent.py). Charts degrade gracefully if absent.
async function fetchHistory() {
    try {
        const res = await fetch('history.json?_h=' + Math.floor(Date.now() / 3600000));
        if (res.ok) {
            const h = await res.json();
            if (h && Array.isArray(h.points)) historyData = h;
        }
    } catch (e) { /* history is optional */ }
}

// Build a REAL price series for the active metal from history. Returns {labels,points} or null.
function getRealMetalSeries(timeframe) {
    if (!historyData || !Array.isArray(historyData.points)) return null;
    const code = metalNameToCode[activeAsset];
    if (!code) return null;
    const series = [];
    for (const p of historyData.points) {
        const v = p.metals && p.metals[code];
        if (typeof v === 'number') series.push([new Date(p.ts), v]);
    }
    if (series.length < 3) return null;

    if (timeframe === '1s') { // Saatlik — son 24 saat
        const cutoff = Date.now() - 24 * 3600 * 1000;
        const pts = series.filter(s => s[0].getTime() >= cutoff);
        if (pts.length < 3) return null;
        return {
            labels: pts.map(s => s[0].toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })),
            points: pts.map(s => round2(s[1]))
        };
    }
    if (timeframe === '1g') { // Günlük — gün başına son değer, son 30 gün
        const byDay = new Map();
        for (const [d, v] of series) byDay.set(d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), v);
        const entries = Array.from(byDay.entries()).slice(-30);
        if (entries.length < 3) return null;
        return { labels: entries.map(e => e[0]), points: entries.map(e => round2(e[1])) };
    }
    return null; // Haftalık/Aylık/10y: 90 günlük tampon yeterince birikene kadar tahmini
}

// Lowest price of a metal over the last `days` days (for the buy-signal). null if insufficient history.
function metalLow(code, days) {
    if (!historyData || !Array.isArray(historyData.points) || historyData.points.length < 10) return null;
    const cutoff = Date.now() - days * 86400 * 1000;
    let lo = Infinity;
    for (const p of historyData.points) {
        const v = p.metals && p.metals[code];
        if (typeof v === 'number' && new Date(p.ts).getTime() >= cutoff) lo = Math.min(lo, v);
    }
    return lo === Infinity ? null : lo;
}

// Set the honest "real vs estimated" chart data-source badge.
function setChartSourceBadge(isReal) {
    const el = document.getElementById('chart-source-badge');
    if (!el) return;
    if (isReal) {
        el.className = 'chart-source-badge real';
        el.innerHTML = '<i class="fa-solid fa-circle-check"></i> Gerçek geçmiş veri';
    } else {
        el.className = 'chart-source-badge est';
        el.innerHTML = '<i class="fa-solid fa-circle-info"></i> Tahmini eğilim — gerçek geçmiş birikiyor';
    }
}

// Add a ⭐ watchlist toggle to a rate row (prepended as a left gutter).
function addWatchStar(row, name) {
    const active = watchlist.includes(name);
    const star = document.createElement('button');
    star.className = 'watch-star' + (active ? ' active' : '');
    star.innerHTML = `<i class="fa-${active ? 'solid' : 'regular'} fa-star"></i>`;
    star.title = active ? 'Takipten çıkar' : 'Takip listesine ekle';
    star.setAttribute('aria-label', star.title);
    star.addEventListener('click', (e) => { e.stopPropagation(); toggleWatch(name); });
    row.insertBefore(star, row.firstChild);
}

function toggleWatch(name) {
    const i = watchlist.indexOf(name);
    if (i >= 0) watchlist.splice(i, 1); else watchlist.push(name);
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    // refresh stars in place
    document.querySelectorAll('.rate-row').forEach(r => {
        const n = r.querySelector('.rate-name')?.textContent.trim();
        const s = r.querySelector('.watch-star');
        if (n && s) {
            const on = watchlist.includes(n);
            s.className = 'watch-star' + (on ? ' active' : '');
            s.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-star"></i>`;
            s.title = on ? 'Takipten çıkar' : 'Takip listesine ekle';
        }
    });
    renderWatchlist();
    if (window.NobleVision) NobleVision.toast(i >= 0 ? 'Takipten çıkarıldı' : 'Takip listesine eklendi ⭐', i >= 0 ? 'info' : 'up');
}

// Render the pinned "Takip Listem" card from live values shown in the main lists.
function renderWatchlist() {
    const card = document.getElementById('watchlist-card');
    const list = document.getElementById('watchlist-list');
    if (!card || !list) return;
    if (!watchlist.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    list.innerHTML = '';
    const rows = Array.from(document.querySelectorAll('.left-column .rate-row, .right-column .rate-row'))
        .filter(r => !r.closest('#watchlist-list'));
    watchlist.forEach(name => {
        const src = rows.find(r => r.querySelector('.rate-name')?.textContent.trim() === name);
        const valHtml = src ? (src.querySelector('.rate-value-group')?.innerHTML || '') : '<span class="rate-price">—</span>';
        const row = document.createElement('div');
        row.className = 'rate-row';
        row.innerHTML = `
            <div class="rate-label-group"><span class="rate-name">${name}</span><span class="rate-code">Takip</span></div>
            <div class="rate-value-group">${valHtml}</div>`;
        const star = document.createElement('button');
        star.className = 'watch-star active';
        star.innerHTML = '<i class="fa-solid fa-star"></i>';
        star.title = 'Takipten çıkar';
        star.addEventListener('click', (e) => { e.stopPropagation(); toggleWatch(name); });
        row.insertBefore(star, row.firstChild);
        row.addEventListener('click', () => window.selectAssetByName(name));
        list.appendChild(row);
    });
}

// Daily visit streak (habit loop).
function updateStreak() {
    const today = new Date().toDateString();
    const last = localStorage.getItem('last_visit');
    let streak = parseInt(localStorage.getItem('visit_streak') || '0', 10) || 0;
    if (last !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        streak = (last === yesterday) ? streak + 1 : 1;
        localStorage.setItem('visit_streak', String(streak));
        localStorage.setItem('last_visit', today);
        if (window.NobleVision) NobleVision.toast(`🔥 ${streak} gün üst üste! Takipte kal.`, 'up');
    }
    const pill = document.getElementById('streak-pill');
    if (pill) { pill.innerHTML = `🔥 ${streak} gün`; pill.style.display = streak > 0 ? '' : 'none'; }
}

// Render the daily AI market commentary ("Günün Yorumu").
function renderAnalysis(text) {
    const card = document.getElementById('analysis-card');
    const el = document.getElementById('analysis-text');
    if (!card || !el) return;
    if (text && String(text).trim()) { el.textContent = String(text).trim(); card.style.display = ''; }
    else { card.style.display = 'none'; }
}

// Initialize application
async function initApp() {
    // Show skeleton placeholders while first data loads (replaced on render).
    ['currency-list', 'metal-list', 'crypto-list', 'bank-list'].forEach(id => {
        const el = document.getElementById(id);
        if (el && window.NobleVision) NobleVision.skeleton(el, 4);
    });

    // NOTE: a standalone service worker is intentionally NOT registered.
    // OneSignal already owns a root-scope worker (OneSignalSDKWorker.js); registering a second
    // root-scope SW would replace it and break push notifications. Offline caching is deferred
    // until it can be folded into OneSignal's worker and verified in a real browser.
    // (sw.js / offline.html are kept in the repo for that follow-up.)
    let _deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); _deferredPrompt = e;
        if (window.NobleVision) NobleVision.toast('Bu uygulamayı ana ekranına ekleyebilirsin 📲', 'info');
    });

    initTimeframeControls();
    await fetchHistory();   // real price history for charts + buy signal
    updateStreak();         // daily visit streak (habit loop)
    loadPortfolio();
    loadAlarms();
    renderAlarms();
    
    // Portfolio add item listener
    const addBtn = document.getElementById('add-portfolio-item-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addPortfolioItem);
    }
    
    // Alarm set listener
    const alarmBtn = document.getElementById('set-alarm-btn');
    if (alarmBtn) {
        alarmBtn.addEventListener('click', addAlarm);
    }
    
    // Search listener
    searchInput.addEventListener('input', applySearchFilter);

    // Keyboard activation for asset rows (Enter/Space → select & chart).
    document.addEventListener('keydown', (e) => {
        const t = e.target;
        if ((e.key === 'Enter' || e.key === ' ') && t && t.classList &&
            (t.classList.contains('rate-row') || t.classList.contains('bank-row'))) {
            e.preventDefault(); t.click();
        }
    });
    
    // Share portfolio listener
    const shareBtn = document.getElementById('share-portfolio-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            const originalText = shareBtn.innerHTML;
            shareBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Hazırlanıyor...';
            shareBtn.disabled = true;
            try {
                // Load html2canvas on demand (kept out of the critical path).
                if (typeof html2canvas === 'undefined') {
                    await new Promise((res, rej) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                        s.onload = res; s.onerror = rej; document.head.appendChild(s);
                    });
                }
                const portfolioContent = document.getElementById('portfolio-content');
                // Use html2canvas to capture the portfolio area
                const canvas = await html2canvas(portfolioContent, {
                    backgroundColor: '#161616', // Match the dark theme background
                    scale: 2, // High resolution
                    logging: false
                });
                
                const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                const file = new File([imageBlob], 'paraaura_portfoy.png', { type: 'image/png' });

                // Try to use native Web Share API with files if supported
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'ParaAura Portföyüm',
                        text: 'ParaAura üzerinden portföyümün güncel durumu!',
                        files: [file]
                    });
                } else {
                    // Fallback to downloading the image
                    const link = document.createElement('a');
                    link.download = 'paraaura_portfoy.png';
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                }
            } catch (err) {
                console.error("Görsel paylaşımı başarısız:", err);
                if (window.NobleVision) NobleVision.toast("Görsel oluşturulurken bir hata oluştu.", 'down');
                else alert("Görsel oluşturulurken bir hata oluştu.");
            } finally {
                shareBtn.innerHTML = originalText;
                shareBtn.disabled = false;
            }
        });
    }

    await updateFeeds();
    updateChart(activeAsset, activeAssetPrice);
    renderPortfolio();
    renderWatchlist();

    // Polling rate update every 10s (silent, no layout shift or countdown texts)
    setInterval(updateFeeds, 10000);
    // Refresh accumulated history hourly (matches the agent's cron cadence).
    setInterval(fetchHistory, 3600 * 1000);
}

initApp();
