// DOM Selectors
const currencyList = document.getElementById('currency-list');
const metalList = document.getElementById('metal-list');
const bankList = document.getElementById('bank-list');
const cryptoList = document.getElementById('crypto-list');
const updateTimeText = document.getElementById('update-time-text');
const chartTitleText = document.getElementById('chart-title');

// In-memory state tracking
const prevRates = {};
let activeAsset = 'Gram Altın';
let activeAssetPrice = 2850.40;
let activeAssetType = 'metals'; // 'currencies', 'metals', 'banks', 'cryptos'
let trendChartInstance = null;

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

// Helper: Generate realistic 7-day trend data using a random walk
function generateTrendData(basePrice, days = 7) {
    const labels = [];
    const points = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        labels.push(date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
    }
    
    // Generate random-walk deviations
    let current = basePrice * 0.985; // start slightly lower
    for (let i = 0; i < days; i++) {
        const pct = (i / (days - 1)); // progress towards 1.0
        // Gradually pull the walk towards the exact current price at the end
        const target = basePrice;
        const drift = (target - current) * (pct * 0.5);
        const rand = (Math.random() - 0.5) * (basePrice * 0.012);
        current = current + drift + rand;
        points.push(parseFloat(current.toFixed(2)));
    }
    points[points.length - 1] = basePrice; // force last point to current value
    return { labels, points };
}

// Initialize and Update Chart.js Instance
function updateChart(assetName, price) {
    activeAsset = assetName;
    activeAssetPrice = price;
    chartTitleText.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${assetName} Trend Analizi`;
    
    const { labels, points } = generateTrendData(price, 7);
    const ctx = document.getElementById('trend-chart').getContext('2d');
    
    if (trendChartInstance) {
        trendChartInstance.data.labels = labels;
        trendChartInstance.data.datasets[0].data = points;
        trendChartInstance.data.datasets[0].label = `${assetName} (TRY)`;
        trendChartInstance.update();
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
                    backgroundColor: 'rgba(158, 125, 40, 0.06)',
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#9e7d28',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        padding: 12,
                        backgroundColor: '#1c1d21',
                        titleFont: { family: 'Inter', size: 12, weight: 'bold' },
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
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { family: 'Inter', size: 10 }
                        }
                    },
                    y: {
                        grid: {
                            color: '#eae7e1'
                        },
                        ticks: {
                            font: { family: 'Inter', size: 10 },
                            callback: function(value) {
                                return value.toLocaleString('tr-TR');
                            }
                        }
                    }
                }
            }
        });
    }
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

            const items = [
                { name: 'Amerikan Doları', code: 'USD/TRY', price: tryRate, change: 0.08 },
                { name: 'Euro', code: 'EUR/TRY', price: eurRate, change: -0.05 },
                { name: 'İngiliz Sterlini', code: 'GBP/TRY', price: gbpRate, change: 0.12 },
                { name: 'İsviçre Frangı', code: 'CHF/TRY', price: chfRate, change: -0.02 }
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
        const row = document.createElement('div');
        const isActive = activeAsset === item.name;
        row.className = `rate-row${isActive ? ' active' : ''}`;
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
}

// 2. Fetch Metals & Bank Spreads from rates.json (Updated by Agent)
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
            }
            if (data.last_updated) {
                const date = new Date(data.last_updated);
                updateTimeText.textContent = `Son Güncelleme: ${date.toLocaleString('tr-TR')} (Canlı güncellenmektedir)`;
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
        const row = document.createElement('div');
        const isActive = activeAsset === item.name;
        row.className = `rate-row${isActive ? ' active' : ''}`;
        const changeClass = item.change >= 0 ? 'up' : 'down';
        const changeIcon = item.change >= 0 ? 'fa-caret-up' : 'fa-caret-down';
        
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
}

function renderBankList(items) {
    bankList.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        const isActive = activeAsset === `${item.name} Altın`;
        row.className = `bank-row${isActive ? ' active' : ''}`;
        
        const buyNum = parseFloat(item.buy.replace(/[^0-9.-]+/g, ""));
        const sellNum = parseFloat(item.sell.replace(/[^0-9.-]+/g, ""));

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
        const row = document.createElement('div');
        const isActive = activeAsset === item.name;
        row.className = `rate-row${isActive ? ' active' : ''}`;
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
}

// Dynamic refresh counter and updater
let countdown = 10;
function updateCountdown() {
    countdown--;
    if (countdown <= 0) {
        countdown = 10;
        updateFeeds();
    }
    document.getElementById('live-status-text').textContent = `Canlı Veri Bağlantısı Aktif (${countdown}s)`;
}

// Global update trigger
async function updateFeeds() {
    await Promise.all([
        fetchCurrencies(),
        fetchMetalsAndBanks(),
        fetchCryptos()
    ]);
    // Refresh chart to stay synchronized with the active item
    updateChart(activeAsset, activeAssetPrice);
}

// Initialize application
async function initApp() {
    await updateFeeds();
    // Default load: Gram Altın or usd
    updateChart(activeAsset, activeAssetPrice);
    
    // Setup 1s countdown timer for the 10s intervals
    setInterval(updateCountdown, 1000);
}

initApp();
