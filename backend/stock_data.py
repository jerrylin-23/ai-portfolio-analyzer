"""
Stock Data Fetcher - Uses Finnhub API
Finnhub provides real-time stock quotes with free tier (60 calls/min)
"""
import os
import requests
from typing import Dict, List
import random
from dotenv import load_dotenv

load_dotenv()

# Finnhub API configuration
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
FINNHUB_BASE_URL = "https://finnhub.io/api/v1"

# Mock data fallback when API unavailable
MOCK_DATA = {
    "AAPL": {"name": "Apple Inc.", "price": 193.42, "change": 2.15},
    "GOOGL": {"name": "Alphabet Inc.", "price": 140.45, "change": -1.23},
    "MSFT": {"name": "Microsoft Corp.", "price": 378.91, "change": 3.45},
    "AMZN": {"name": "Amazon.com Inc.", "price": 180.24, "change": 1.87},
    "TSLA": {"name": "Tesla Inc.", "price": 251.73, "change": -5.42},
    "NVDA": {"name": "NVIDIA Corp.", "price": 478.92, "change": 12.34},
    "META": {"name": "Meta Platforms", "price": 335.67, "change": 4.21},
    "AMD": {"name": "AMD Inc.", "price": 141.23, "change": 2.67},
    "NFLX": {"name": "Netflix Inc.", "price": 478.93, "change": 1.45},
    "SPY": {"name": "S&P 500 ETF", "price": 460.25, "change": 1.12},
}


def get_stock_info(symbol: str) -> Dict:
    """Get stock information - tries Finnhub first, falls back to mock data"""
    symbol = symbol.upper().strip()
    
    # Try Finnhub API first
    if FINNHUB_API_KEY:
        try:
            return _fetch_from_finnhub(symbol)
        except Exception as e:
            print(f"Finnhub API failed for {symbol}: {e}")
    else:
        print("FINNHUB_API_KEY not set, using mock data")
    
    # Fallback to mock data for demo
    return _get_mock_data(symbol)


def _fetch_from_finnhub(symbol: str) -> Dict:
    """Fetch real-time quote from Finnhub API"""
    # Get quote data
    quote_url = f"{FINNHUB_BASE_URL}/quote"
    params = {"symbol": symbol, "token": FINNHUB_API_KEY}
    
    response = requests.get(quote_url, params=params, timeout=10)
    response.raise_for_status()
    quote = response.json()
    
    # Finnhub returns: c=current, pc=previous close, d=change, dp=percent change
    if quote.get("c") is None or quote.get("c") == 0:
        raise ValueError(f"No quote data for {symbol}")
    
    # Get company profile for name
    name = symbol
    try:
        profile_url = f"{FINNHUB_BASE_URL}/stock/profile2"
        profile_resp = requests.get(profile_url, params=params, timeout=5)
        if profile_resp.status_code == 200:
            profile = profile_resp.json()
            name = profile.get("name", symbol)
    except Exception:
        pass  # Use symbol as name if profile fails
    
    return {
        "symbol": symbol,
        "name": name,
        "price": round(quote["c"], 2),
        "previous_close": round(quote["pc"], 2),
        "change": round(quote["d"] or 0, 2),
        "change_percent": round(quote["dp"] or 0, 2),
    }


def _get_mock_data(symbol: str) -> Dict:
    """Return mock data for demo purposes"""
    if symbol in MOCK_DATA:
        mock = MOCK_DATA[symbol]
        price = mock["price"]
        change = mock["change"]
        prev = price - change
        return {
            "symbol": symbol,
            "name": mock["name"],
            "price": round(price, 2),
            "previous_close": round(prev, 2),
            "change": round(change, 2),
            "change_percent": round((change / prev) * 100, 2),
            "is_mock": True
        }
    
    # Generate random data for unknown symbols
    price = random.uniform(50, 500)
    change = random.uniform(-5, 5)
    prev = price - change
    return {
        "symbol": symbol,
        "name": symbol,
        "price": round(price, 2),
        "previous_close": round(prev, 2),
        "change": round(change, 2),
        "change_percent": round((change / prev) * 100, 2),
        "is_mock": True
    }


def get_portfolio_data(symbols: List[str]) -> List[Dict]:
    """Get data for multiple stocks at once"""
    return [get_stock_info(s) for s in symbols]


def get_stock_history(symbol: str, period: str = "1mo") -> List[Dict]:
    """Get historical price data from Finnhub"""
    # Can implement using /stock/candle endpoint if needed
    return []
