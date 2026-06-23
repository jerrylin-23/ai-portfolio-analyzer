// AI Portfolio Analyzer - Frontend App

// Auto-detect API URL based on environment
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8001'
    : '';
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
            renderPortfolioPreview([], 0);
            renderHoldings([]);
            updatePortfolioHistoryChart(currentChartTimeframe);
            return;
        }

        // Fetch current prices for all holdings
        const response = await fetch(`${API_BASE}/api/portfolio/prices?symbols=${symbols.join(',')}`);
        const priceData = await response.json();

        // Merge local holdings with live prices
        let totalValue = 0;
        let dailyChange = 0;
        let totalPL = 0;
        let totalCost = 0;

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
            totalCost += costBasis;

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

        const previousValue = totalValue - dailyChange;
        const dailyChangePercent = previousValue > 0 ? (dailyChange / previousValue) * 100 : 0;
        const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

        updatePortfolioSummary({
            total_value: totalValue,
            daily_change: dailyChange,
            daily_change_percent: dailyChangePercent,
            total_pl: totalPL,
            total_pl_percent: totalPLPercent,
            holdings
        });
        renderPortfolioPreview(holdings, totalValue);
        renderHoldings(holdings);
        updatePortfolioHistoryChart(currentChartTimeframe);
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
    dailyChange.innerHTML = `
        <span class="summary-amount">${dailyChangeStr}</span>
        <span class="summary-percent">(${formatSignedPercent(changePercent)})</span>
    `;
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
        totalPL.innerHTML = `
            <span class="summary-amount">${plStr}</span>
            <span class="summary-percent">(${formatSignedPercent(plPercent)})</span>
        `;
        totalPL.style.color = plPositive ? 'var(--bullish)' : 'var(--bearish)';
        if (sidebarTotalPL) {
            sidebarTotalPL.textContent = plStr;
            sidebarTotalPL.style.color = plPositive ? 'var(--bullish)' : 'var(--bearish)';
        }
    }
}

function renderPortfolioPreview(holdings, totalValue) {
    const allocationList = document.getElementById('previewAllocationList');
    const allocationMeta = document.getElementById('allocationMeta');
    const largestWeight = document.getElementById('previewLargestWeight');
    const largestSymbol = document.getElementById('previewLargestSymbol');
    const concentrationRing = document.getElementById('previewConcentrationRing');
    const upBar = document.getElementById('previewUpBar');
    const downBar = document.getElementById('previewDownBar');
    const flatBar = document.getElementById('previewFlatBar');
    const upCountEl = document.getElementById('previewUpCount');
    const downCountEl = document.getElementById('previewDownCount');
    const flatCountEl = document.getElementById('previewFlatCount');

    if (!allocationList) return;

    const liveHoldings = (holdings || [])
        .filter(holding => holding.value > 0)
        .sort((a, b) => b.value - a.value);
    const total = totalValue || liveHoldings.reduce((sum, holding) => sum + holding.value, 0);
    const count = liveHoldings.length;

    if (allocationMeta) {
        allocationMeta.textContent = `${count} ${count === 1 ? 'holding' : 'holdings'}`;
    }

    if (!count || total <= 0) {
        allocationList.innerHTML = '<div class="allocation-empty">Add holdings to see live allocation.</div>';
        if (largestWeight) largestWeight.textContent = '0%';
        if (largestSymbol) largestSymbol.textContent = 'No holdings';
        if (concentrationRing) concentrationRing.style.setProperty('--donut-angle', '0deg');
        updatePreviewBar(upBar, upCountEl, 0, 0);
        updatePreviewBar(downBar, downCountEl, 0, 0);
        updatePreviewBar(flatBar, flatCountEl, 0, 0);
        return;
    }

    allocationList.innerHTML = liveHoldings.slice(0, 5).map(holding => {
        const weight = (holding.value / total) * 100;
        const safeSymbol = escapeHtml(holding.symbol);
        const safeName = escapeHtml(holding.name || holding.symbol);

        return `
            <div class="allocation-row" title="${safeName}">
                <div class="allocation-label">
                    <span>${safeSymbol}</span>
                    <small>${formatCurrency(holding.value)}</small>
                </div>
                <div class="allocation-track" aria-hidden="true">
                    <span style="width: ${clampPercent(weight)}%"></span>
                </div>
                <strong>${weight.toFixed(1)}%</strong>
            </div>
        `;
    }).join('');

    const largest = liveHoldings[0];
    const largestPct = (largest.value / total) * 100;
    if (largestWeight) largestWeight.textContent = `${Math.round(largestPct)}%`;
    if (largestSymbol) largestSymbol.textContent = largest.symbol;
    if (concentrationRing) {
        concentrationRing.style.setProperty('--donut-angle', `${clampPercent(largestPct) * 3.6}deg`);
    }

    const upCount = liveHoldings.filter(holding => holding.change_percent > 0).length;
    const downCount = liveHoldings.filter(holding => holding.change_percent < 0).length;
    const flatCount = liveHoldings.filter(holding => holding.change_percent === 0).length;
    updatePreviewBar(upBar, upCountEl, upCount, count);
    updatePreviewBar(downBar, downCountEl, downCount, count);
    updatePreviewBar(flatBar, flatCountEl, flatCount, count);
}

function updatePreviewBar(bar, label, count, total) {
    const percent = total > 0 ? (count / total) * 100 : 0;
    if (bar) bar.style.width = `${clampPercent(percent)}%`;
    if (label) label.textContent = String(count);
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
}

function renderHoldings(holdings) {
    const grid = document.getElementById('holdingsGrid');

    if (!holdings || holdings.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">—</span>
                <p>No stocks in your portfolio</p>
                <p class="hint">Add a ticker above to start the desk.</p>
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
             onclick="selectStock('${holding.symbol}', event)">
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
                    ${formatSignedPercent(holding.change_percent)}
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
                    P/L: ${plSign}${formatCurrency(holding.pl)} (${formatSignedPercent(holding.pl_percent)})
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
                <button class="edit-save-btn" onclick="updateHolding('${holding.symbol}', event)">Save</button>
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
async function selectStock(symbol, event) {
    selectedSymbol = symbol;

    // Update card selection
    document.querySelectorAll('.holding-card').forEach(card => {
        card.classList.remove('selected');
    });
    if (event?.currentTarget) {
        event.currentTarget.classList.add('selected');
    }

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
    const sentimentText = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);

    sentimentBadge.className = `sentiment-badge ${sentiment}`;
    sentimentBadge.textContent = `${sentimentText} (${(data.sentiment_score || 0).toFixed(2)})`;

    // News items
    if (!data.news || data.news.length === 0) {
        newsList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No recent news found</p>';
        return;
    }

    newsList.innerHTML = data.news.map(article => {
        const s = article.sentiment || {};
        const sentimentClass = s.sentiment || 'neutral';

        return `
            <div class="news-item">
                ${article.thumbnail ? `<img src="${article.thumbnail}" class="news-thumbnail" alt="">` : ''}
                <div class="news-content">
                    <div class="news-title">
                        <a href="${article.url}" target="_blank">${article.title}</a>
                    </div>
                    <div class="news-meta">
                        <span>${article.source} • ${formatNewsTime(article.published_at, article.published || 'Recently')}</span>
                        <span class="news-sentiment ${sentimentClass}">
                            ${s.reason || sentimentClass}
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

function formatSignedPercent(value) {
    const number = Number(value) || 0;
    return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatNewsTime(isoTimestamp, fallback = '') {
    if (!isoTimestamp) return fallback || '';

    const publishedAt = new Date(isoTimestamp);
    if (Number.isNaN(publishedAt.getTime())) {
        return fallback || '';
    }

    const now = new Date();
    const diffMs = now.getTime() - publishedAt.getTime();
    const futureGraceMs = 5 * 60 * 1000;

    if (diffMs < -futureGraceMs) return 'Just now';
    if (diffMs < 60 * 1000) return 'Just now';
    if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 1000))}m ago`;
    if (diffMs < 24 * 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;

    return publishedAt.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function cleanSectorName(name) {
    const cleaned = String(name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    return cleaned || name || 'Sector';
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);
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
                ${item.published_at || item.time ? `<div class="news-time">${formatNewsTime(item.published_at, item.time)}</div>` : ''}
            </a>
        `).join('');

    } catch (error) {
        console.error('Error loading market news:', error);
        feedContainer.innerHTML = `
            <div class="feed-empty">
                <p>Could not load news</p>
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
            const rank = index + 1;
            const isTopGainer = rank <= 3 && isPositive;
            const sectorName = cleanSectorName(sector.name);

            return `
                <div class="sector-card ${isTopGainer ? 'top-gainer' : ''} ${changeClass}">
                    ${isTopGainer ? `<div class="rank-badge">#${rank}</div>` : ''}
                    <div class="sector-name">${sectorName}</div>
                    <div class="sector-symbol">${sector.symbol}</div>
                    <div class="sector-price">${formatCurrency(sector.price)}</div>
                    <div class="sector-metrics">
                        <div class="metric-box ${changeClass}">
                            <div class="metric-label">Today</div>
                            <div class="metric-value">${formatSignedPercent(sector.change_percent)}</div>
                        </div>
                        <div class="metric-box ${sector.change_1w >= 0 ? 'positive' : 'negative'}">
                            <div class="metric-label">1W</div>
                            <div class="metric-value">${formatSignedPercent(sector.change_1w)}</div>
                        </div>
                        <div class="metric-box ${sector.change_1m >= 0 ? 'positive' : 'negative'}">
                            <div class="metric-label">1M</div>
                            <div class="metric-value">${formatSignedPercent(sector.change_1m)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading sectors:', error);
        grid.innerHTML = `
            <div class="feed-empty">
                <p>Could not load sectors</p>
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
                    <span>${formatNewsTime(article.published_at, article.time || '')}</span>
                    <span class="news-symbols">${article.symbols || ''}</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading news:', error);
        container.innerHTML = `
            <div class="feed-empty">
                <p>Could not load news</p>
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
                <span>${data.holdings_count} holdings</span>
                <span>${data.news_count} news items analyzed</span>
                <span>${new Date(data.generated_at).toLocaleTimeString()}</span>
            </div>
        `;

    } catch (error) {
        console.error('Error getting analysis:', error);
        content.innerHTML = `
            <div class="analysis-error">
                <p>Could not generate analysis</p>
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
        console.log('Market context loaded:', data.cached ? 'from cache' : 'fresh');
    } catch (error) {
        console.log('Market context pre-fetch failed (non-critical):', error);
    }
}

// ===== Portfolio History Chart =====
let currentChartTimeframe = '1d';
window.portfolioChartInstance = null;

async function updatePortfolioHistoryChart(range) {
    const emptyState = document.getElementById('chartEmptyState');
    const canvasContainer = document.getElementById('portfolioChart')?.parentElement;
    const changeEl = document.getElementById('chartValueChange');
    
    const localPortfolio = getLocalPortfolio();
    if (Object.keys(localPortfolio).length === 0) {
        if (canvasContainer) canvasContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        if (changeEl) changeEl.textContent = '+$0.00 (0.00%)';
        if (window.portfolioChartInstance) {
            window.portfolioChartInstance.destroy();
            window.portfolioChartInstance = null;
        }
        return;
    }
    
    if (canvasContainer) canvasContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE}/api/portfolio/history`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                holdings: localPortfolio,
                range: range
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.history || data.history.length === 0) {
            if (canvasContainer) canvasContainer.style.display = 'none';
            if (emptyState) emptyState.style.display = 'flex';
            if (changeEl) changeEl.textContent = '+$0.00 (0.00%)';
            return;
        }
        
        renderChartInstance(data.history, range);
        
        const changeVal = data.change || 0;
        const changePct = data.change_percent || 0;
        const isPositive = changeVal >= 0;
        
        if (changeEl) {
            changeEl.textContent = `${isPositive ? '+' : ''}${formatCurrency(changeVal)} (${formatSignedPercent(changePct)})`;
            changeEl.className = `chart-change ${isPositive ? 'positive' : 'negative'}`;
        }
        
    } catch (error) {
        console.error('Error fetching history:', error);
        if (canvasContainer) canvasContainer.style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'flex';
            emptyState.innerHTML = '<p class="error">Could not load chart data</p>';
        }
    }
}

window.changeChartTimeframe = async function(range, btn) {
    currentChartTimeframe = range;
    const buttons = btn.parentElement.querySelectorAll('.timeframe-btn');
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    await updatePortfolioHistoryChart(range);
};

function getNYTime(date) {
    try {
        const nyHourStr = date.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
        const nyMinuteStr = date.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' });
        return {
            hour: parseInt(nyHourStr, 10),
            minute: parseInt(nyMinuteStr, 10)
        };
    } catch (e) {
        return {
            hour: date.getHours(),
            minute: date.getMinutes()
        };
    }
}

function renderChartInstance(historyData, range) {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (window.portfolioChartInstance) {
        window.portfolioChartInstance.destroy();
    }
    
    // Calculate indices for clean timeline formatting
    const dayChangeIndices = [];
    const mondayIndices = [];
    let lastDayStr = null;
    let lastMondayStr = null;
    
    // NY target times for 1D chart: 9:30 AM, 11:00 AM, 1:00 PM, 3:00 PM, 4:00 PM
    const targetNYTimes = [
        { hour: 9, minute: 30 },
        { hour: 11, minute: 0 },
        { hour: 13, minute: 0 },
        { hour: 15, minute: 0 },
        { hour: 16, minute: 0 }
    ];
    
    const dayTickIndices = [];
    
    historyData.forEach((d, idx) => {
        const date = new Date(d.timestamp);
        const dayStr = date.toDateString();
        
        // 1W transitions
        if (dayStr !== lastDayStr) {
            dayChangeIndices.push(idx);
            lastDayStr = dayStr;
        }
        
        // 1M Mondays
        if (date.getDay() === 1) { 
            if (dayStr !== lastMondayStr) {
                mondayIndices.push(idx);
                lastMondayStr = dayStr;
            }
        }
    });
    
    // 1D specific tick calculations in NY time
    if (range === '1d') {
        targetNYTimes.forEach(target => {
            let closestIdx = -1;
            let minDiff = Infinity;
            historyData.forEach((d, idx) => {
                const date = new Date(d.timestamp);
                const nyTime = getNYTime(date);
                const currentMinutes = nyTime.hour * 60 + nyTime.minute;
                const targetMinutes = target.hour * 60 + target.minute;
                const diff = Math.abs(currentMinutes - targetMinutes);
                
                if (diff < minDiff && diff <= 10) { // must be within 10 minutes
                    minDiff = diff;
                    closestIdx = idx;
                }
            });
            if (closestIdx !== -1 && !dayTickIndices.includes(closestIdx)) {
                dayTickIndices.push(closestIdx);
            }
        });
        
        // Frame the chart
        if (historyData.length > 0 && !dayTickIndices.includes(0)) {
            dayTickIndices.push(0);
        }
        if (historyData.length > 0 && !dayTickIndices.includes(historyData.length - 1)) {
            dayTickIndices.push(historyData.length - 1);
        }
        dayTickIndices.sort((a, b) => a - b);
    }
    
    const labels = historyData.map(d => formatChartDate(d.timestamp, range));
    const values = historyData.map(d => d.value);
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(255, 104, 44, 0.18)');
    gradient.addColorStop(1, 'rgba(255, 104, 44, 0.00)');
    
    window.portfolioChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                borderColor: '#ff682c',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#ff682c',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 2,
                fill: true,
                backgroundColor: gradient,
                tension: 0.35
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
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#202020',
                    titleColor: '#828282',
                    titleFont: {
                        family: 'Inter',
                        size: 11
                    },
                    bodyColor: '#ffffff',
                    bodyFont: {
                        family: 'Space Grotesk',
                        weight: 'bold',
                        size: 13
                    },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            const d = historyData[index];
                            if (!d) return '';
                            const date = new Date(d.timestamp);
                            if (range === '1d') {
                                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' Today';
                            } else if (range === '1w') {
                                const dateStr = date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
                                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return `${dateStr}, ${timeStr}`;
                            } else {
                                return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                            }
                        },
                        label: function(context) {
                            return '$' + context.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                        color: '#828282',
                        font: {
                            family: 'Inter',
                            size: 10
                        },
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: false,
                        callback: function(value, index) {
                            const dataIndex = value;
                            if (dataIndex >= historyData.length) return '';
                            const d = historyData[dataIndex];
                            if (!d) return '';
                            
                            const date = new Date(d.timestamp);
                            if (range === '1d') {
                                if (dayTickIndices.includes(dataIndex)) {
                                    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                }
                                return '';
                            } else if (range === '1w') {
                                if (dayChangeIndices.includes(dataIndex)) {
                                    return date.toLocaleDateString([], { weekday: 'short' });
                                }
                                return '';
                            } else {
                                if (mondayIndices.includes(dataIndex) || dataIndex === 0 || dataIndex === historyData.length - 1) {
                                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                }
                                return '';
                            }
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(28, 28, 28, 0.04)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#828282',
                        font: {
                            family: 'Space Grotesk',
                            size: 10
                        },
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            }
        }
     });
}

function formatChartDate(timestamp, range) {
    const date = new Date(timestamp);
    if (range === '1d') {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (range === '1w') {
        const weekday = date.toLocaleDateString([], { weekday: 'short' });
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${weekday} ${time}`;
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}

