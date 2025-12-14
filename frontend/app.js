// AI Portfolio Analyzer - Frontend App

// Auto-detect API URL based on environment
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:8001'
    : 'https://ai-portfolio-analyzer-api.onrender.com';
let selectedSymbol = null;

// ===== LocalStorage Portfolio Management =====
const PORTFOLIO_KEY = 'ai_portfolio_holdings';

function getLocalPortfolio() {
    const data = localStorage.getItem(PORTFOLIO_KEY);
    return data ? JSON.parse(data) : {};
}

function saveLocalPortfolio(portfolio) {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    loadPortfolio();
    loadSectors();
    loadNews();
    loadMarketContext(); // Quietly pre-fetch AI market context

    // Enter key to add stock
    document.getElementById('symbolInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addStock();
    });

    // Auto-refresh: portfolio every 30s, sectors every 60s, news every 2 min
    setInterval(loadPortfolio, 30000);
    setInterval(loadSectors, 60000);
    setInterval(loadNews, 120000);
    setInterval(loadMarketContext, 600000);
});

// ===== Show/Hide Loading =====
function showLoading(text = 'Loading...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

// ===== Portfolio Functions (localStorage-based) =====
async function loadPortfolio() {
    try {
        const localPortfolio = getLocalPortfolio();
        const symbols = Object.keys(localPortfolio);

        if (symbols.length === 0) {
            updatePortfolioSummary({ total_value: 0, daily_change: 0, total_pl: 0, holdings: [] });
            renderHoldings([]);
            return;
        }

        // Fetch current prices for all holdings
        const response = await fetch(`${API_BASE}/api/portfolio/prices?symbols=${symbols.join(',')}`);
        const priceData = await response.json();

        // Merge local holdings with live prices
        let totalValue = 0;
        let dailyChange = 0;
        let totalPL = 0;

        const holdings = symbols.map(symbol => {
            const local = localPortfolio[symbol];
            const live = priceData.prices?.[symbol] || {};
            const price = live.price || 0;
            const value = price * local.shares;
            const costBasis = local.cost_average * local.shares;
            const pl = costBasis > 0 ? value - costBasis : 0;
            const dayChange = (live.change_percent || 0) / 100 * value;

            totalValue += value;
            dailyChange += dayChange;
            totalPL += pl;

            return {
                symbol,
                name: live.name || symbol,
                shares: local.shares,
                cost_average: local.cost_average,
                price,
                value,
                pl,
                pl_percent: costBasis > 0 ? ((value - costBasis) / costBasis * 100) : 0,
                change_percent: live.change_percent || 0
            };
        });

        updatePortfolioSummary({ total_value: totalValue, daily_change: dailyChange, total_pl: totalPL, holdings });
        renderHoldings(holdings);
    } catch (error) {
        console.error('Error loading portfolio:', error);
    }
}

function updatePortfolioSummary(data) {
    const totalValue = document.getElementById('totalValue');
    const dailyChange = document.getElementById('dailyChange');
    const totalPL = document.getElementById('totalPL');

    // Sidebar elements
    const sidebarTotalValue = document.getElementById('sidebarTotalValue');
    const sidebarDailyChange = document.getElementById('sidebarDailyChange');
    const sidebarTotalPL = document.getElementById('sidebarTotalPL');

    const totalValueStr = formatCurrency(data.total_value || 0);
    totalValue.textContent = totalValueStr;
    if (sidebarTotalValue) sidebarTotalValue.textContent = totalValueStr;

    const changeAmount = data.daily_change || 0;
    const changePercent = data.daily_change_percent || 0;
    const isPositive = changeAmount >= 0;

    const dailyChangeStr = `${isPositive ? '+' : ''}${formatCurrency(changeAmount)}`;
    dailyChange.textContent = `${dailyChangeStr} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)`;
    dailyChange.style.color = isPositive ? 'var(--bullish)' : 'var(--bearish)';
    if (sidebarDailyChange) {
        sidebarDailyChange.textContent = dailyChangeStr;
        sidebarDailyChange.style.color = isPositive ? 'var(--bullish)' : 'var(--bearish)';
    }

    // Total P/L display
    if (totalPL) {
        const plAmount = data.total_pl || 0;
        const plPercent = data.total_pl_percent || 0;
        const plPositive = plAmount >= 0;
        const plStr = `${plPositive ? '+' : ''}${formatCurrency(plAmount)}`;
        totalPL.textContent = `${plStr} (${plPositive ? '+' : ''}${plPercent.toFixed(2)}%)`;
        totalPL.style.color = plPositive ? 'var(--bullish)' : 'var(--bearish)';
        if (sidebarTotalPL) {
            sidebarTotalPL.textContent = plStr;
            sidebarTotalPL.style.color = plPositive ? 'var(--bullish)' : 'var(--bearish)';
        }
    }
}

function renderHoldings(holdings) {
    const grid = document.getElementById('holdingsGrid');

    if (!holdings || holdings.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📭</span>
                <p>No stocks in your portfolio</p>
                <p class="hint">Add stocks above to get started!</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = holdings.map(holding => {
        const plClass = holding.pl >= 0 ? 'positive' : 'negative';
        const plSign = holding.pl >= 0 ? '+' : '';
        const hasCostBasis = holding.cost_average > 0;

        return `
        <div class="holding-card ${selectedSymbol === holding.symbol ? 'selected' : ''}" 
             onclick="selectStock('${holding.symbol}')">
            <div class="holding-header">
                <div>
                    <div class="holding-symbol">${holding.symbol}</div>
                    <div class="holding-name">${holding.name || holding.symbol}</div>
                </div>
                <button class="holding-remove" onclick="removeStock('${holding.symbol}', event)">✕</button>
            </div>
            <div class="holding-price">
                <span class="holding-current-price">${formatCurrency(holding.price)}</span>
                <span class="holding-change ${holding.change_percent >= 0 ? 'positive' : 'negative'}">
                    ${holding.change_percent >= 0 ? '+' : ''}${holding.change_percent?.toFixed(2) || 0}%
                </span>
            </div>
            <div class="holding-details">
                <span>${holding.shares} shares</span>
                <span>${formatCurrency(holding.value)}</span>
            </div>
            ${hasCostBasis ? `
            <div class="holding-cost-basis">
                <span>Avg Cost: ${formatCurrency(holding.cost_average)}</span>
                <span class="holding-pl ${plClass}">
                    P/L: ${plSign}${formatCurrency(holding.pl)} (${plSign}${holding.pl_percent?.toFixed(2) || 0}%)
                </span>
            </div>
            ` : `
            <div class="holding-cost-basis no-cost">
                <span>No cost basis set</span>
            </div>
            `}
            <div class="edit-holding-row">
                <div class="edit-field">
                    <label>Shares</label>
                    <input type="number" class="edit-input" id="shares-${holding.symbol}" 
                           value="${holding.shares}" step="0.01" min="0.01" 
                           onclick="event.stopPropagation()">
                </div>
                <div class="edit-field">
                    <label>Avg Cost</label>
                    <input type="number" class="edit-input" id="cost-${holding.symbol}" 
                           value="${holding.cost_average || ''}" placeholder="$0.00" step="0.01" min="0" 
                           onclick="event.stopPropagation()">
                </div>
                <button class="edit-save-btn" onclick="updateHolding('${holding.symbol}', event)">💾</button>
            </div>
        </div>
    `}).join('');
}

async function addStock() {
    const symbolInput = document.getElementById('symbolInput');
    const sharesInput = document.getElementById('sharesInput');
    const costInput = document.getElementById('costInput');

    const symbol = symbolInput.value.trim().toUpperCase();
    const shares = parseFloat(sharesInput.value) || 1;
    const costAverage = parseFloat(costInput.value) || 0;

    if (!symbol) {
        alert('Please enter a stock symbol');
        return;
    }

    showLoading(`Adding ${symbol}...`);

    try {
        // Validate symbol by fetching price
        const response = await fetch(`${API_BASE}/api/stock/${symbol}`);
        if (!response.ok) {
            throw new Error(`Invalid symbol: ${symbol}`);
        }

        // Save to localStorage
        const portfolio = getLocalPortfolio();
        portfolio[symbol] = { shares, cost_average: costAverage };
        saveLocalPortfolio(portfolio);

        symbolInput.value = '';
        sharesInput.value = '1';
        costInput.value = '';

        await loadPortfolio();

    } catch (error) {
        alert(error.message);
    } finally {
        hideLoading();
    }
}

async function updateHolding(symbol, event) {
    event.stopPropagation();

    const sharesInput = document.getElementById(`shares-${symbol}`);
    const costInput = document.getElementById(`cost-${symbol}`);
    const shares = parseFloat(sharesInput.value) || 0;
    const costAverage = parseFloat(costInput.value) || 0;

    if (shares <= 0) {
        alert('Shares must be greater than 0');
        return;
    }

    // Update localStorage
    const portfolio = getLocalPortfolio();
    portfolio[symbol] = { shares, cost_average: costAverage };
    saveLocalPortfolio(portfolio);

    await loadPortfolio();
}

async function removeStock(symbol, event) {
    event.stopPropagation();

    if (!confirm(`Remove ${symbol} from portfolio?`)) return;

    // Remove from localStorage
    const portfolio = getLocalPortfolio();
    delete portfolio[symbol];
    saveLocalPortfolio(portfolio);

    if (selectedSymbol === symbol) {
        selectedSymbol = null;
        document.getElementById('newsSection').style.display = 'none';
    }

    await loadPortfolio();
}

// ===== News & Sentiment =====
async function selectStock(symbol) {
    selectedSymbol = symbol;

    // Update card selection
    document.querySelectorAll('.holding-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    // Load news
    showLoading(`Analyzing ${symbol} news...`);

    try {
        const response = await fetch(`${API_BASE}/api/news/${symbol}`);
        const data = await response.json();

        renderNews(data);
        document.getElementById('newsSection').style.display = 'block';

    } catch (error) {
        console.error('Error loading news:', error);
    } finally {
        hideLoading();
    }
}

function renderNews(data) {
    const newsList = document.getElementById('newsList');
    const sentimentBadge = document.getElementById('overallSentiment');

    // Overall sentiment
    const sentiment = data.overall_sentiment || 'neutral';
    const sentimentEmoji = sentiment === 'bullish' ? '🟢' : sentiment === 'bearish' ? '🔴' : '🟡';
    const sentimentText = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);

    sentimentBadge.className = `sentiment-badge ${sentiment}`;
    sentimentBadge.textContent = `${sentimentEmoji} ${sentimentText} (${data.sentiment_score?.toFixed(2) || 0})`;

    // News items
    if (!data.news || data.news.length === 0) {
        newsList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No recent news found</p>';
        return;
    }

    newsList.innerHTML = data.news.map(article => {
        const s = article.sentiment || {};
        const sentimentClass = s.sentiment || 'neutral';
        const sentimentIcon = sentimentClass === 'bullish' ? '📈' : sentimentClass === 'bearish' ? '📉' : '➡️';

        return `
            <div class="news-item">
                ${article.thumbnail ? `<img src="${article.thumbnail}" class="news-thumbnail" alt="">` : ''}
                <div class="news-content">
                    <div class="news-title">
                        <a href="${article.url}" target="_blank">${article.title}</a>
                    </div>
                    <div class="news-meta">
                        <span>${article.source} • ${article.published || 'Recently'}</span>
                        <span class="news-sentiment ${sentimentClass}">
                            ${sentimentIcon} ${s.reason || sentimentClass}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ===== Utility Functions =====
function formatCurrency(value) {
    if (value === null || value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(value);
}

// ===== Market News Feed Functions =====
async function loadMarketNews() {
    const feedContainer = document.getElementById('marketFeed');
    if (!feedContainer) return;

    try {
        const response = await fetch(`${API_BASE}/api/market-feed`);
        const data = await response.json();

        if (!data.articles || data.articles.length === 0) {
            feedContainer.innerHTML = `
                <div class="feed-empty">
                    <p>No news available</p>
                    <p class="hint">Check back later</p>
                </div>
            `;
            return;
        }

        feedContainer.innerHTML = data.articles.map(item => `
            <a href="${item.link}" target="_blank" class="news-item">
                <div class="news-source">${item.display_name}</div>
                <div class="news-headline">${item.text}</div>
                ${item.time ? `<div class="news-time">${item.time}</div>` : ''}
            </a>
        `).join('');

    } catch (error) {
        console.error('Error loading market news:', error);
        feedContainer.innerHTML = `
            <div class="feed-empty">
                <p>⚠️ Could not load news</p>
                <p class="hint">Check your connection</p>
            </div>
        `;
    }
}

// ===== Sector Performance Functions =====
async function loadSectors() {
    const grid = document.getElementById('sectorsGrid');
    if (!grid) return;

    try {
        const response = await fetch(`${API_BASE}/api/sectors`);
        const data = await response.json();

        if (!data.sectors || data.sectors.length === 0) {
            grid.innerHTML = `
                <div class="feed-empty">
                    <p>No sector data available</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = data.sectors.map((sector, index) => {
            const isPositive = sector.change_percent >= 0;
            const changeClass = isPositive ? 'positive' : 'negative';
            const changeSign = isPositive ? '+' : '';
            const rank = index + 1;
            const isTopGainer = rank <= 3 && isPositive;

            return `
                <div class="sector-card ${isTopGainer ? 'top-gainer' : ''} ${changeClass}">
                    ${isTopGainer ? `<div class="rank-badge">#${rank}</div>` : ''}
                    <div class="sector-name">${sector.name}</div>
                    <div class="sector-symbol">${sector.symbol}</div>
                    <div class="sector-price">${formatCurrency(sector.price)}</div>
                    <div class="sector-metrics">
                        <div class="metric-box ${changeClass}">
                            <div class="metric-label">Today</div>
                            <div class="metric-value">${changeSign}${sector.change_percent?.toFixed(2) || 0}%</div>
                        </div>
                        <div class="metric-box ${sector.change_1w >= 0 ? 'positive' : 'negative'}">
                            <div class="metric-label">1W</div>
                            <div class="metric-value">${sector.change_1w >= 0 ? '+' : ''}${sector.change_1w?.toFixed(2) || 0}%</div>
                        </div>
                        <div class="metric-box ${sector.change_1m >= 0 ? 'positive' : 'negative'}">
                            <div class="metric-label">1M</div>
                            <div class="metric-value">${sector.change_1m >= 0 ? '+' : ''}${sector.change_1m?.toFixed(2) || 0}%</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading sectors:', error);
        grid.innerHTML = `
            <div class="feed-empty">
                <p>⚠️ Could not load sectors</p>
                <p class="hint">Check your connection</p>
            </div>
        `;
    }
}

// ===== News Functions =====
async function loadNews() {
    const container = document.getElementById('newsScroll');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/api/market-feed`);
        const data = await response.json();

        if (!data.articles || data.articles.length === 0) {
            container.innerHTML = `
                <div class="feed-empty">
                    <p>No news available</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.articles.map(article => `
            <div class="news-item" onclick="window.open('${article.link}', '_blank')">
                <div class="news-source">${article.display_name}</div>
                <div class="news-title">${article.text}</div>
                <div class="news-meta">
                    <span>${article.time || ''}</span>
                    <span class="news-symbols">${article.symbols || ''}</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading news:', error);
        container.innerHTML = `
            <div class="feed-empty">
                <p>⚠️ Could not load news</p>
            </div>
        `;
    }
}

// ===== AI Portfolio Analysis =====
async function getPortfolioAnalysis() {
    const container = document.getElementById('aiAnalysis');
    const content = document.getElementById('aiAnalysisContent');

    // Show the container
    container.style.display = 'block';
    content.innerHTML = `
        <div class="analysis-loading">
            <div class="spinner-small"></div>
            <p>Analyzing your portfolio with current market news...</p>
        </div>
    `;

    try {
        // Get portfolio symbols from localStorage
        const localPortfolio = getLocalPortfolio();
        const symbols = Object.keys(localPortfolio).join(',');

        const response = await fetch(`${API_BASE}/api/portfolio-analysis?symbols=${encodeURIComponent(symbols)}`);

        if (!response.ok) {
            throw new Error('Analysis failed');
        }

        const data = await response.json();

        // Convert markdown-style formatting to HTML
        let analysis = data.analysis
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        content.innerHTML = `
            <p>${analysis}</p>
            <div class="analysis-meta">
                <span>📊 ${data.holdings_count} holdings</span>
                <span>📰 ${data.news_count} news items analyzed</span>
                <span>🕐 ${new Date(data.generated_at).toLocaleTimeString()}</span>
            </div>
        `;

    } catch (error) {
        console.error('Error getting analysis:', error);
        content.innerHTML = `
            <div class="analysis-error">
                <p>⚠️ Could not generate analysis</p>
                <p class="hint">Make sure GEMINI_API_KEY is set and you have holdings in your portfolio</p>
            </div>
        `;
    }
}

// ===== Market Context (Background Pre-fetch) =====
async function loadMarketContext() {
    try {
        const response = await fetch(`${API_BASE}/api/market-context`);
        const data = await response.json();
        console.log('📊 Market context loaded:', data.cached ? 'from cache' : 'fresh');
    } catch (error) {
        console.log('Market context pre-fetch failed (non-critical):', error);
    }
}
