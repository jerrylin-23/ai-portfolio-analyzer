"""
AI Portfolio Analyzer - Backend
FastAPI app for portfolio tracking with news and AI sentiment analysis
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Optional
import uvicorn
from pathlib import Path
import json

from stock_data import get_stock_info, get_portfolio_data
from news_fetcher import get_stock_news
from sentiment import analyze_sentiment

# Initialize FastAPI app
app = FastAPI(
    title="AI Portfolio Analyzer",
    description="Track your portfolio with AI-powered news sentiment analysis",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Portfolio storage file path
PORTFOLIO_FILE = Path(__file__).parent / "portfolio_data.json"

# Portfolio structure: {symbol: {"shares": float, "cost_average": float}}
portfolio = {}


def load_portfolio():
    """Load portfolio from JSON file"""
    global portfolio
    if PORTFOLIO_FILE.exists():
        try:
            with open(PORTFOLIO_FILE, "r") as f:
                portfolio = json.load(f)
            print(f"Loaded portfolio: {portfolio}")
        except Exception as e:
            print(f"Error loading portfolio: {e}")
            portfolio = {}
    else:
        portfolio = {}


def save_portfolio():
    """Save portfolio to JSON file"""
    try:
        with open(PORTFOLIO_FILE, "w") as f:
            json.dump(portfolio, f, indent=2)
        print(f"Saved portfolio: {portfolio}")
    except Exception as e:
        print(f"Error saving portfolio: {e}")


# Load portfolio on startup
load_portfolio()

# Mount frontend static files
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

@app.get("/")
async def root():
    """Serve the frontend"""
    index_path = frontend_path / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "AI Portfolio Analyzer API", "status": "running"}


@app.get("/api/portfolio")
async def get_portfolio():
    """Get current portfolio with live data"""
    if not portfolio:
        return {"holdings": [], "total_value": 0, "daily_change": 0, "total_cost": 0, "total_pl": 0}
    
    holdings = []
    total_value = 0
    total_change = 0
    total_cost = 0
    total_pl = 0
    
    for symbol, holding_data in portfolio.items():
        # Support both old format (just shares) and new format (dict with shares/cost_average)
        if isinstance(holding_data, dict):
            shares = holding_data.get("shares", 0)
            cost_average = holding_data.get("cost_average", 0)
        else:
            shares = holding_data
            cost_average = 0
        
        try:
            data = get_stock_info(symbol)
            current_price = data['price']
            value = current_price * shares
            change = data.get('change_percent', 0)
            cost_basis = cost_average * shares
            pl = value - cost_basis if cost_average > 0 else 0
            pl_percent = ((current_price - cost_average) / cost_average * 100) if cost_average > 0 else 0
            
            holdings.append({
                "symbol": symbol,
                "shares": shares,
                "price": current_price,
                "value": round(value, 2),
                "change_percent": change,
                "name": data.get('name', symbol),
                "cost_average": cost_average,
                "cost_basis": round(cost_basis, 2),
                "pl": round(pl, 2),
                "pl_percent": round(pl_percent, 2)
            })
            
            total_value += value
            total_change += value * (change / 100)
            total_cost += cost_basis
            total_pl += pl
        except Exception as e:
            holdings.append({
                "symbol": symbol,
                "shares": shares,
                "price": 0,
                "value": 0,
                "cost_average": cost_average,
                "error": str(e)
            })
    
    return {
        "holdings": holdings,
        "total_value": round(total_value, 2),
        "daily_change": round(total_change, 2),
        "daily_change_percent": round((total_change / total_value * 100) if total_value > 0 else 0, 2),
        "total_cost": round(total_cost, 2),
        "total_pl": round(total_pl, 2),
        "total_pl_percent": round((total_pl / total_cost * 100) if total_cost > 0 else 0, 2)
    }


@app.get("/api/portfolio/prices")
async def get_portfolio_prices(symbols: str):
    """Get live prices for a comma-separated list of symbols (for localStorage-based portfolios)"""
    symbol_list = [s.strip().upper() for s in symbols.split(',') if s.strip()]
    
    if not symbol_list:
        return {"prices": {}}
    
    prices = {}
    for symbol in symbol_list:
        try:
            data = get_stock_info(symbol)
            if data:
                prices[symbol] = {
                    "price": data.get("price", 0),
                    "name": data.get("name", symbol),
                    "change_percent": data.get("change_percent", 0)
                }
        except:
            prices[symbol] = {"price": 0, "name": symbol, "change_percent": 0}
    
    return {"prices": prices}


@app.post("/api/portfolio/add")
async def add_to_portfolio(symbol: str, shares: float = 1, cost_average: float = 0):
    """Add a stock to portfolio"""
    symbol = symbol.upper().strip()
    
    # Validate symbol exists
    try:
        data = get_stock_info(symbol)
        if not data or data.get('price') is None:
            raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found: {str(e)}")
    
    if symbol in portfolio:
        # Update existing holding - recalculate weighted average cost
        existing = portfolio[symbol]
        if isinstance(existing, dict):
            old_shares = existing.get("shares", 0)
            old_cost = existing.get("cost_average", 0)
        else:
            old_shares = existing
            old_cost = 0
        
        total_shares = old_shares + shares
        # Weighted average cost
        if cost_average > 0 and total_shares > 0:
            new_avg = ((old_cost * old_shares) + (cost_average * shares)) / total_shares
        else:
            new_avg = old_cost if old_cost > 0 else cost_average
        
        portfolio[symbol] = {"shares": total_shares, "cost_average": new_avg}
    else:
        portfolio[symbol] = {"shares": shares, "cost_average": cost_average}
    
    save_portfolio()
    return {"message": f"Added {shares} shares of {symbol}", "portfolio": portfolio}


@app.delete("/api/portfolio/remove/{symbol}")
async def remove_from_portfolio(symbol: str):
    """Remove a stock from portfolio"""
    symbol = symbol.upper().strip()
    
    if symbol not in portfolio:
        raise HTTPException(status_code=404, detail=f"{symbol} not in portfolio")
    
    del portfolio[symbol]
    save_portfolio()
    return {"message": f"Removed {symbol}", "portfolio": portfolio}


@app.put("/api/portfolio/update/{symbol}")
async def update_holding(symbol: str, shares: Optional[float] = None, cost_average: Optional[float] = None):
    """Update shares or cost average for a holding"""
    symbol = symbol.upper().strip()
    
    if symbol not in portfolio:
        raise HTTPException(status_code=404, detail=f"{symbol} not in portfolio")
    
    holding = portfolio[symbol]
    if isinstance(holding, dict):
        if shares is not None:
            holding["shares"] = shares
        if cost_average is not None:
            holding["cost_average"] = cost_average
    else:
        portfolio[symbol] = {
            "shares": shares if shares is not None else holding,
            "cost_average": cost_average if cost_average is not None else 0
        }
    
    save_portfolio()
    return {"message": f"Updated {symbol}", "holding": portfolio[symbol]}


@app.get("/api/news/{symbol}")
async def get_news(symbol: str, limit: int = 5):
    """Get news for a stock with AI sentiment analysis"""
    symbol = symbol.upper().strip()
    
    try:
        # Fetch news
        news = get_stock_news(symbol, limit=limit)
        
        if not news:
            return {"symbol": symbol, "news": [], "overall_sentiment": "neutral"}
        
        # Analyze sentiment for each article
        analyzed_news = []
        sentiments = []
        
        for article in news:
            sentiment = analyze_sentiment(article['title'], article.get('summary', ''))
            article['sentiment'] = sentiment
            analyzed_news.append(article)
            sentiments.append(sentiment['score'])
        
        # Calculate overall sentiment
        avg_score = sum(sentiments) / len(sentiments) if sentiments else 0
        if avg_score > 0.2:
            overall = "bullish"
        elif avg_score < -0.2:
            overall = "bearish"
        else:
            overall = "neutral"
        
        return {
            "symbol": symbol,
            "news": analyzed_news,
            "overall_sentiment": overall,
            "sentiment_score": round(avg_score, 2)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sectors")
async def get_sector_performance():
    """Get real-time sector performance using ETF proxies with 1W and 1M history"""
    import yfinance as yf
    from datetime import datetime, timedelta
    
    # Sector ETF mappings - using popular ETFs as proxies for each sector
    sectors = [
        {"name": "🤖 Robotics & AI", "symbol": "BOTZ", "category": "tech"},
        {"name": "💊 Healthcare", "symbol": "XLV", "category": "health"},
        {"name": "🛒 Retail", "symbol": "XRT", "category": "consumer"},
        {"name": "💻 Software", "symbol": "IGV", "category": "tech"},
        {"name": "🏢 Data Centers/REITs", "symbol": "VNQ", "category": "real_estate"},
        {"name": "🔬 Semiconductors", "symbol": "SMH", "category": "tech"},
        {"name": "⚡ Clean Energy", "symbol": "ICLN", "category": "energy"},
        {"name": "🏦 Financials", "symbol": "XLF", "category": "finance"},
        {"name": "🏭 Industrials", "symbol": "XLI", "category": "industrial"},
        {"name": "📡 Communication", "symbol": "XLC", "category": "tech"},
        {"name": "🛡️ Cybersecurity", "symbol": "HACK", "category": "tech"},
        {"name": "☁️ Cloud Computing", "symbol": "SKYY", "category": "tech"},
        {"name": "🧬 Biotech", "symbol": "XBI", "category": "health"},
        {"name": "🛢️ Energy", "symbol": "XLE", "category": "energy"},
        {"name": "📦 Small Caps", "symbol": "IWM", "category": "market"},
    ]
    
    results = []
    
    # Get all symbols for batch request
    symbols = [s["symbol"] for s in sectors]
    
    try:
        # Fetch 1 month of historical data for all symbols at once
        tickers = yf.Tickers(" ".join(symbols))
        
        for sector in sectors:
            try:
                ticker = tickers.tickers.get(sector["symbol"])
                if not ticker:
                    raise ValueError(f"Ticker not found: {sector['symbol']}")
                
                # Get 1 month of daily data
                hist = ticker.history(period="1mo")
                
                if hist.empty:
                    raise ValueError("No historical data")
                
                current_price = hist['Close'].iloc[-1]
                
                # Calculate changes
                # Daily change
                if len(hist) >= 2:
                    prev_close = hist['Close'].iloc[-2]
                    change_day = current_price - prev_close
                    change_day_pct = ((current_price / prev_close) - 1) * 100
                else:
                    change_day = 0
                    change_day_pct = 0
                
                # 1 week change (5 trading days)
                if len(hist) >= 5:
                    price_1w_ago = hist['Close'].iloc[-5]
                    change_1w_pct = ((current_price / price_1w_ago) - 1) * 100
                else:
                    change_1w_pct = 0
                
                # 1 month change
                price_1m_ago = hist['Close'].iloc[0]
                change_1m_pct = ((current_price / price_1m_ago) - 1) * 100
                
                results.append({
                    "name": sector["name"],
                    "symbol": sector["symbol"],
                    "category": sector["category"],
                    "price": round(current_price, 2),
                    "change": round(change_day, 2),
                    "change_percent": round(change_day_pct, 2),
                    "change_1w": round(change_1w_pct, 2),
                    "change_1m": round(change_1m_pct, 2),
                })
                
            except Exception as e:
                print(f"Error fetching {sector['symbol']}: {e}")
                # Fallback to real-time only
                try:
                    data = get_stock_info(sector["symbol"])
                    results.append({
                        "name": sector["name"],
                        "symbol": sector["symbol"],
                        "category": sector["category"],
                        "price": data.get("price", 0),
                        "change": data.get("change", 0),
                        "change_percent": data.get("change_percent", 0),
                        "change_1w": 0,
                        "change_1m": 0,
                    })
                except:
                    results.append({
                        "name": sector["name"],
                        "symbol": sector["symbol"],
                        "category": sector["category"],
                        "price": 0,
                        "change": 0,
                        "change_percent": 0,
                        "change_1w": 0,
                        "change_1m": 0,
                        "error": str(e)
                    })
    except Exception as e:
        print(f"Batch fetch failed: {e}")
        # Fallback to individual fetches
        for sector in sectors:
            try:
                data = get_stock_info(sector["symbol"])
                results.append({
                    "name": sector["name"],
                    "symbol": sector["symbol"],
                    "category": sector["category"],
                    "price": data.get("price", 0),
                    "change": data.get("change", 0),
                    "change_percent": data.get("change_percent", 0),
                    "change_1w": 0,
                    "change_1m": 0,
                })
            except Exception as e:
                results.append({
                    "name": sector["name"],
                    "symbol": sector["symbol"],
                    "category": sector["category"],
                    "price": 0,
                    "change": 0,
                    "change_percent": 0,
                    "change_1w": 0,
                    "change_1m": 0,
                    "error": str(e)
                })
    
    # Sort by daily change_percent descending (best performers first)
    results.sort(key=lambda x: x.get("change_percent", 0), reverse=True)
    
    return {
        "sectors": results,
        "top_gainers": [s for s in results if s.get("change_percent", 0) > 0][:5],
        "top_losers": [s for s in results if s.get("change_percent", 0) < 0][-5:][::-1]
    }


@app.get("/api/market-feed")
async def get_market_feed():
    """Get real-time financial news from newsfilter.io (10,000+ sources)"""
    import requests
    from datetime import datetime
    
    all_news = []
    
    try:
        # Use newsfilter.io Query API (free, no API key needed)
        url = "https://api.newsfilter.io/public/actions"
        
        # Query for recent market news
        payload = {
            "type": "filterArticles",
            "queryString": "source.name:Reuters OR source.name:Bloomberg OR source.name:\"Wall Street Journal\" OR source.name:CNBC OR source.name:\"Seeking Alpha\" OR source.name:MarketWatch",
            "from": 0,
            "size": 20
        }
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": "https://newsfilter.io",
            "Referer": "https://newsfilter.io/"
        }
        
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            articles = data.get("articles", [])
            
            for article in articles[:20]:
                # Parse published date
                published = article.get("publishedAt", "")
                time_str = ""
                if published:
                    try:
                        dt = datetime.fromisoformat(published.replace('Z', '+00:00'))
                        time_str = dt.strftime("%b %d, %I:%M %p")
                    except:
                        pass
                
                source_name = article.get("source", {}).get("name", "News")
                symbols = article.get("symbols", [])
                symbols_str = " ".join([f"${s}" for s in symbols[:3]]) if symbols else ""
                
                all_news.append({
                    "account": f"@{source_name.replace(' ', '')}",
                    "display_name": source_name,
                    "text": article.get("title", "")[:280],
                    "time": time_str,
                    "link": article.get("url", "#"),
                    "symbols": symbols_str
                })
                
            print(f"Fetched {len(articles)} articles from newsfilter.io")
        else:
            print(f"newsfilter.io API error: {response.status_code}")
            
    except Exception as e:
        print(f"newsfilter.io API failed: {e}")
    
    # Fallback to Google News RSS if newsfilter fails (very reliable)
    if not all_news:
        import feedparser
        
        # Google News RSS - works reliably on all cloud platforms
        google_news_url = "https://news.google.com/rss/search?q=stock+market+OR+wall+street+OR+nasdaq+OR+dow+jones+when:1d&hl=en-US&gl=US&ceid=US:en"
        
        try:
            feed = feedparser.parse(google_news_url)
            print(f"Google News returned {len(feed.entries)} articles")
            
            for entry in feed.entries[:15]:
                time_str = ""
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    try:
                        from time import mktime
                        dt = datetime.fromtimestamp(mktime(entry.published_parsed))
                        time_str = dt.strftime("%b %d, %I:%M %p")
                    except:
                        pass
                
                # Extract source from title (format: "Title - Source")
                title = entry.get("title", "")
                source = "News"
                if " - " in title:
                    parts = title.rsplit(" - ", 1)
                    title = parts[0]
                    source = parts[1] if len(parts) > 1 else "News"
                
                all_news.append({
                    "account": f"@{source.replace(' ', '')}",
                    "display_name": source,
                    "text": title[:280],
                    "time": time_str,
                    "link": entry.get("link", "#"),
                    "symbols": ""
                })
        except Exception as e:
            print(f"Google News RSS failed: {e}")
    
    # Ultimate fallback - static placeholder if everything fails
    if not all_news:
        all_news = [
            {"account": "@MarketUpdate", "display_name": "Market Update", "text": "Markets are open. Check individual stocks for latest prices.", "time": datetime.now().strftime("%I:%M %p"), "link": "#", "symbols": ""},
            {"account": "@TradingView", "display_name": "Trading Tip", "text": "Monitor your sector exposure and upcoming earnings for risk management.", "time": "", "link": "#", "symbols": ""},
        ]
    
    return {
        "articles": all_news[:20], 
        "fetched_at": datetime.now().isoformat(),
        "source": "newsfilter.io" if len(all_news) > 2 and "newsfilter" in str(all_news[0].get("account", "")).lower() else "google_news"
    }


@app.get("/api/stock/{symbol}")
async def get_stock(symbol: str):
    """Get detailed stock information"""
    symbol = symbol.upper().strip()
    
    try:
        data = get_stock_info(symbol)
        return data
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


# Global cache for market context
market_context_cache = {
    "summary": None,
    "generated_at": None
}

@app.get("/api/market-context")
async def get_market_context():
    """Get AI-generated market context summary (Gemini call #1)"""
    import google.generativeai as genai
    import os
    import requests
    from datetime import datetime, timedelta
    
    global market_context_cache
    
    # Return cached if less than 10 minutes old
    if market_context_cache["summary"] and market_context_cache["generated_at"]:
        age = datetime.now() - market_context_cache["generated_at"]
        if age < timedelta(minutes=10):
            return {
                "summary": market_context_cache["summary"],
                "cached": True,
                "generated_at": market_context_cache["generated_at"].isoformat()
            }
    
    # Get Gemini API key
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return {"summary": "Market context unavailable", "error": "No API key"}
    
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    # Get recent news for context
    recent_news = []
    try:
        url = "https://api.newsfilter.io/public/actions"
        payload = {
            "type": "filterArticles",
            "queryString": "source.name:Reuters OR source.name:Bloomberg OR source.name:CNBC OR source.name:MarketWatch",
            "from": 0,
            "size": 25
        }
        headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            articles = response.json().get("articles", [])
            recent_news = [a.get("title", "") for a in articles[:25]]
    except Exception as e:
        print(f"Error fetching news: {e}")
    
    # Get real economic calendar from ForexFactory (free, no API key)
    from datetime import timedelta
    upcoming_events = []
    try:
        calendar_url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
        response = requests.get(calendar_url, timeout=10)
        if response.status_code == 200:
            events = response.json()
            # Filter US high/medium impact events
            usd_events = [e for e in events if e.get('country') == 'USD' and e.get('impact') in ['High', 'Medium']]
            for event in usd_events[:15]:
                date_str = event.get('date', '')[:10]  # YYYY-MM-DD
                title = event.get('title', '')
                impact = event.get('impact', '')
                upcoming_events.append(f"{date_str}: {title} [{impact} Impact]")
    except Exception as e:
        print(f"Economic calendar error: {e}")
    
    # Get upcoming earnings for megacaps + sector leaders (yfinance - real-time)
    upcoming_earnings = []
    try:
        import yfinance as yf
        # Megacaps + Sector Leaders
        watchlist = [
            # Tech Megacaps
            'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'ORCL', 'AVGO', 'CRM',
            # Financials
            'JPM', 'GS', 'BAC', 'MS', 'WFC',
            # Healthcare
            'UNH', 'JNJ', 'LLY', 'PFE', 'ABBV',
            # Energy
            'XOM', 'CVX', 'COP',
            # Industrials
            'CAT', 'BA', 'UNP', 'HON',
            # Consumer
            'WMT', 'HD', 'MCD', 'NKE', 'COST'
        ]
        today = datetime.now()
        next_month = today + timedelta(days=45)  # Look 45 days ahead
        
        for symbol in watchlist:
            try:
                stock = yf.Ticker(symbol)
                cal = stock.calendar
                if cal is not None and len(cal) > 0:
                    earnings_dates = cal.get('Earnings Date', [])
                    if earnings_dates and len(earnings_dates) > 0:
                        earnings_date = earnings_dates[0]
                        # Check if within next 45 days
                        if hasattr(earnings_date, 'date'):
                            ed = earnings_date.date()
                        else:
                            ed = earnings_date
                        if today.date() <= ed <= next_month.date():
                            upcoming_earnings.append(f"{symbol}: {ed.strftime('%Y-%m-%d')}")
            except:
                pass
    except Exception as e:
        print(f"Earnings calendar error: {e}")
    
    
    
    # Get current date
    today = datetime.now()
    date_str = today.strftime("%A, %B %d, %Y")  # e.g., "Friday, December 13, 2024"
    
    # Build economic events section
    events_text = ""
    if upcoming_events:
        events_text = "\n\nUpcoming Economic Events:\n" + chr(10).join(f'- {e}' for e in upcoming_events)
    
    # Build earnings section
    earnings_text = ""
    if upcoming_earnings:
        earnings_text = "\n\nUpcoming Megacap Earnings:\n" + chr(10).join(f'- {e}' for e in upcoming_earnings)
    
    # Build headlines section
    headlines_text = ""
    if recent_news:
        headlines_text = "\n\nRecent Headlines:\n" + chr(10).join(f'- {h}' for h in recent_news)
    
    # Ask Gemini to summarize market context with focus on week ahead
    prompt = f"""You are a macro market strategist. TODAY IS {date_str}.
{events_text}
{earnings_text}
{headlines_text}

Based on the ACTUAL upcoming events, earnings, and headlines above, provide a market context summary (5-6 sentences):

1. **Key Events This Week**: Summarize important macro events (FOMC, CPI, NFP, Fed speeches, etc.)
2. **Upcoming Earnings**: Highlight any megacap earnings coming soon that could move markets
3. **Risk Positioning**: Should investors be defensive ahead of these events? Risk-on or risk-off?
4. **Sector Impact**: Which sectors might be most affected?

Be specific about dates. Focus on FUTURE events only. Keep it concise."""

    try:
        response = model.generate_content(prompt)
        summary = response.text
        
        # Cache the result
        market_context_cache["summary"] = summary
        market_context_cache["generated_at"] = datetime.now()
        
        return {
            "summary": summary,
            "cached": False,
            "generated_at": datetime.now().isoformat()
        }
    except Exception as e:
        return {"summary": f"Market context unavailable: {str(e)}", "error": str(e)}


@app.get("/api/portfolio-analysis")
async def get_portfolio_analysis():
    """Get AI analysis of portfolio with real-time news context"""
    import google.generativeai as genai
    import os
    import requests
    from datetime import datetime
    
    # Get Gemini API key
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")
    
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    # Get portfolio data
    portfolio_summary = []
    total_value = 0
    sector_exposure = {}
    
    for symbol, holding in portfolio.items():
        try:
            stock_data = get_stock_info(symbol)
            current_price = stock_data.get("price", 0)
            shares = holding.get("shares", 0)
            value = current_price * shares
            total_value += value
            
            portfolio_summary.append({
                "symbol": symbol,
                "name": stock_data.get("name", symbol),
                "shares": shares,
                "price": current_price,
                "value": value,
                "change_percent": stock_data.get("change_percent", 0),
                "sector": stock_data.get("sector", "Unknown")
            })
            
            # Track sector exposure
            sector = stock_data.get("sector", "Unknown")
            sector_exposure[sector] = sector_exposure.get(sector, 0) + value
        except Exception as e:
            print(f"Error getting data for {symbol}: {e}")
    
    # Calculate sector percentages
    sector_pct = {}
    for sector, value in sector_exposure.items():
        sector_pct[sector] = round((value / total_value * 100) if total_value > 0 else 0, 1)
    
    # Get recent news
    recent_news = []
    try:
        url = "https://api.newsfilter.io/public/actions"
        payload = {
            "type": "filterArticles",
            "queryString": "source.name:Reuters OR source.name:Bloomberg OR source.name:CNBC OR source.name:MarketWatch",
            "from": 0,
            "size": 15
        }
        headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            articles = response.json().get("articles", [])
            recent_news = [a.get("title", "") for a in articles[:15]]
    except Exception as e:
        print(f"Error fetching news: {e}")
    
    # Build the prompt
    prompt = f"""You are a portfolio analyst. Analyze this portfolio in the context of current market events.

## Portfolio Holdings (Total Value: ${total_value:,.2f})
"""
    for holding in portfolio_summary:
        prompt += f"- {holding['symbol']} ({holding['name']}): {holding['shares']} shares @ ${holding['price']:.2f} = ${holding['value']:,.2f} ({holding['change_percent']:+.2f}% today)\n"
    
    prompt += f"""
## Sector Exposure
"""
    for sector, pct in sorted(sector_pct.items(), key=lambda x: x[1], reverse=True):
        prompt += f"- {sector}: {pct}%\n"
    
    prompt += f"""
## Recent Market News Headlines
"""
    for i, headline in enumerate(recent_news, 1):
        prompt += f"{i}. {headline}\n"
    
    # Add pre-analyzed market context if available
    if market_context_cache["summary"]:
        prompt += f"""
## AI Market Context Summary
{market_context_cache["summary"]}
"""
    
    prompt += """
## Your Analysis Task
1. Consider the AI Market Context Summary when analyzing portfolio risk
2. Identify any portfolio exposure concerns based on current market themes
3. Highlight specific holdings that may be affected by today's events
4. Provide actionable insights
5. Keep it concise - 3-4 short paragraphs max

Be direct and specific. Reference actual holdings and market events."""

    try:
        response = model.generate_content(prompt)
        analysis = response.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")
    
    return {
        "analysis": analysis,
        "portfolio_value": total_value,
        "sector_exposure": sector_pct,
        "holdings_count": len(portfolio_summary),
        "news_count": len(recent_news),
        "has_market_context": market_context_cache["summary"] is not None,
        "generated_at": datetime.now().isoformat()
    }



if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,  # Different port than amazon-deals-finder
        reload=True
    )
