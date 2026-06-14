// DOM Selectors
const currencyList = document.getElementById('currency-list');
const metalList = document.getElementById('metal-list');
const bankList = document.getElementById('bank-list');
const cryptoList = document.getElementById('crypto-list');
const updateTimeText = document.getElementById('update-time-text');
const chartTitleText = document.getElementById('chart-title');
const searchInput = document.getElementById('search-input');

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

// Update Chart.js Instance
function updateChart(assetName, price) {
    activeAsset = assetName;
    activeAssetPrice = price;
    chartTitleText.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${assetName}`;
    
    const { labels, points } = generateTimeframeData(price, activeTimeframe);
    const ctx = document.getElementById('trend-chart').getContext('2d');
    
    if (trendChartInstance) {
        trendChartInstance.data.labels = labels;
        trendChartInstance.data.datasets[0].data = points;
        trendChartInstance.data.datasets[0].label = `${assetName} (TRY)`;
        trendChartInstance.update('none'); // silent update
    } else {
        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${assetName} (TRY)`,
                    data: points,
                    borderColor: '#9e7d28',
                    borderWidth: 2,
                    backgroundColor: 'rgba(158, 125, 40, 0.05)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#9e7d28',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: activeTimeframe === '5D' ? 1 : 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        padding: 10,
                        backgroundColor: '#1c1d21',
                        titleFont: { family: 'Inter', size: 11, weight: 'bold' },
                        bodyFont: { family: 'Inter', size: 11 },
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
                        ticks: { font: { family: 'Inter', size: 9 }, maxRotation: 0 }
                    },
                    y: {
                        grid: { color: '#eae7e1' },
                        ticks: { font: { family: 'Inter', size: 9 } }
                    }
                }
            }
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
        currencyList.innerHTML = '<div class="rate-item-placeholder">Döviz kurları yüklenemedi.</div>';
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
        });

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
                updateTimeText.textContent = `Son Güncelleme: ${date.toLocaleString('tr-TR')} (Veriler anlık taranmaktadır)`;
            }
        }
    } catch (err) {
        console.error("Error fetching metals/banks database: ", err);
        metalList.innerHTML = '<div class="rate-item-placeholder">Metal fiyatları yüklenemedi.</div>';
        bankList.innerHTML = '<div class="rate-item-placeholder">Banka kurları yüklenemedi.</div>';
    }
}

function renderMetalList(items) {
    metalList.innerHTML = '';
    items.forEach(item => {
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

        row.addEventListener('click', () => {
            document.querySelectorAll('.rate-row, .bank-row').forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            updateChart(item.name, isNaN(priceNum) ? 1000 : priceNum);
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

        row.innerHTML = `
            <div class="rate-label-group">
                <span class="rate-name">${item.name}</span>
                <span class="rate-code">Gram Altın Makas</span>
            </div>
            <span class="bank-price-buy">${formatTRY(buyNum)}</span>
            <span class="bank-price-sell">${formatTRY(sellNum)}</span>
        `;

        row.addEventListener('click', () => {
            document.querySelectorAll('.rate-row, .bank-row').forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            updateChart(`${item.name} Altın`, sellNum);
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
        cryptoList.innerHTML = '<div class="rate-item-placeholder">Kripto kurları yüklenemedi.</div>';
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
        });

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
    checkAlarms();
}

// Setup timeframe buttons click listeners
function initTimeframeControls() {
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTimeframe = btn.dataset.range;
            updateChart(activeAsset, activeAssetPrice);
        });
    });
}

// Portfolio Management State
let portfolio = {}; // format: { assetCode: { amount: X, cost: Y } }
let portfolioChart = null;

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

    totalValText.textContent = formatTRY(totalValue);
    
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
        alert('Lütfen geçerli bir miktar giriniz.');
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
        itemRow.innerHTML = `
            <span class="alarm-item-text"><i class="fa-solid fa-bell"></i> ${alarm.assetCode} ${condSymbol} ${formatTRY(alarm.target)}</span>
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
        alert('Lütfen geçerli bir hedef fiyat giriniz.');
        return;
    }
    
    // Request permission on setting alarm
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
    
    alarms.push({ assetCode, condition, target });
    saveAlarms();
    renderAlarms();
    
    targetInput.value = '';
    
    // Show notification prompt confirmation
    sendNotification('Alarm Kuruldu 🔔', `${assetCode} için ${condition === 'above' ? 'yükseliş' : 'düşüş'} yönlü ${target} ₺ fiyat alarmı kuruldu.`);
}

function checkAlarms() {
    if (alarms.length === 0) return;
    
    let triggeredIndex = [];
    
    alarms.forEach((alarm, idx) => {
        const price = latestPrices[alarm.assetCode];
        if (!price) return;
        
        let isTriggered = false;
        if (alarm.condition === 'above' && price >= alarm.target) {
            isTriggered = true;
        } else if (alarm.condition === 'below' && price <= alarm.target) {
            isTriggered = true;
        }
        
        if (isTriggered) {
            sendNotification(
                `Fiyat Alarmı Tetiklendi! ⚡`,
                `${alarm.assetCode} değeri hedeflediğiniz ${alarm.target} ₺ seviyesine ulaştı! Güncel: ${price} ₺`
            );
            triggeredIndex.push(idx);
        }
    });
    
    if (triggeredIndex.length > 0) {
        alarms = alarms.filter((_, idx) => !triggeredIndex.includes(idx));
        saveAlarms();
        renderAlarms();
    }
}

function sendNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { 
            body: body,
            icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239e7d28"%3E%3Ccircle cx="12" cy="12" r="9"/%3E%3C/svg%3E'
        });
    }
    
    // Custom UI banner alert
    const banner = document.createElement('div');
    banner.className = 'custom-alert-banner';
    banner.innerHTML = `<i class="fa-solid fa-bell"></i> <span><strong>${title}</strong>: ${body}</span>`;
    document.body.appendChild(banner);
    
    setTimeout(() => {
        banner.classList.add('fade-out');
        setTimeout(() => banner.remove(), 500);
    }, 6000);
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


// Initialize application
async function initApp() {
    initTimeframeControls();
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
    
    await updateFeeds();
    updateChart(activeAsset, activeAssetPrice);
    renderPortfolio();
    
    // Polling rate update every 10s (silent, no layout shift or countdown texts)
    setInterval(updateFeeds, 10000);
}

initApp();
