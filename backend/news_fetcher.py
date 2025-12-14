"""
News Fetcher - Using free news sources with fallback
"""
import requests
from typing import List, Dict
from datetime import datetime
import random


USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
]

# Mock news for demo when APIs are rate limited
MOCK_NEWS = {
    "AAPL": [
        {"title": "Apple Reports Strong iPhone Sales in Holiday Quarter", "source": "Reuters", "sentiment": "bullish"},
        {"title": "Apple's Services Revenue Continues Growth Trajectory", "source": "Bloomberg", "sentiment": "bullish"},
        {"title": "Apple Announces New Product Launch Event for Spring", "source": "CNBC", "sentiment": "neutral"},
        {"title": "Apple Faces Regulatory Challenges in EU Market", "source": "WSJ", "sentiment": "bearish"},
        {"title": "Apple Stock Reaches New All-Time High", "source": "MarketWatch", "sentiment": "bullish"},
    ],
    "GOOGL": [
        {"title": "Google AI Advances Drive Cloud Revenue Growth", "source": "Reuters", "sentiment": "bullish"},
        {"title": "Alphabet Reports Better Than Expected Earnings", "source": "Bloomberg", "sentiment": "bullish"},
        {"title": "Google Faces New Antitrust Investigation", "source": "WSJ", "sentiment": "bearish"},
    ],
    "MSFT": [
        {"title": "Microsoft Azure Growth Exceeds Expectations", "source": "CNBC", "sentiment": "bullish"},
        {"title": "Microsoft's AI Integration Boosts Office 365 Subscriptions", "source": "Reuters", "sentiment": "bullish"},
        {"title": "Microsoft Gaming Division Shows Strong Performance", "source": "Bloomberg", "sentiment": "bullish"},
    ],
    "TSLA": [
        {"title": "Tesla Deliveries Beat Analyst Expectations", "source": "Reuters", "sentiment": "bullish"},
        {"title": "Tesla Cuts Prices on Popular Models", "source": "Bloomberg", "sentiment": "bearish"},
        {"title": "Tesla Expands Supercharger Network in Europe", "source": "CNBC", "sentiment": "neutral"},
    ],
    "NVDA": [
        {"title": "NVIDIA's AI Chip Demand Surges Amid AI Boom", "source": "Reuters", "sentiment": "bullish"},
        {"title": "NVIDIA Data Center Revenue Hits Record High", "source": "Bloomberg", "sentiment": "bullish"},
        {"title": "NVIDIA Announces Next-Gen GPU Architecture", "source": "CNBC", "sentiment": "bullish"},
    ],
}


def get_stock_news(symbol: str, limit: int = 5) -> List[Dict]:
    """Get news for a stock - tries real API, falls back to mock data"""
    symbol = symbol.upper()
    
    # Try Yahoo Finance news API first
    try:
        news = _fetch_yahoo_news(symbol, limit)
        if news:
            return news
    except Exception as e:
        print(f"Yahoo news failed for {symbol}: {e}")
    
    # Fallback to mock news for demo
    if symbol in MOCK_NEWS:
        articles = MOCK_NEWS[symbol][:limit]
        return [
            {
                "title": a["title"],
                "summary": f"This is a demo news article about {symbol}.",
                "url": f"https://finance.yahoo.com/quote/{symbol}",
                "source": a["source"],
                "published": datetime.now().strftime('%Y-%m-%d %H:%M'),
                "thumbnail": None,
                "is_mock": True
            }
            for a in articles
        ]
    
    # For unknown symbols, generate generic news
    return [
        {
            "title": f"{symbol} Shows Mixed Trading Activity",
            "summary": f"Trading activity in {symbol} continues with normal volume.",
            "url": f"https://finance.yahoo.com/quote/{symbol}",
            "source": "Market Update",
            "published": datetime.now().strftime('%Y-%m-%d %H:%M'),
            "is_mock": True
        }
    ]


def _fetch_yahoo_news(symbol: str, limit: int = 5) -> List[Dict]:
    """Fetch news from Yahoo Finance API"""
    url = f"https://query1.finance.yahoo.com/v1/finance/search?q={symbol}&newsCount={limit}"
    
    headers = {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'application/json',
    }
    
    response = requests.get(url, headers=headers, timeout=10)
    
    if response.status_code == 429:
        raise ValueError("Rate limited")
    
    response.raise_for_status()
    data = response.json()
    
    news = data.get('news', [])
    
    return [
        {
            "title": item.get('title', ''),
            "summary": item.get('publisher', ''),
            "url": item.get('link', ''),
            "source": item.get('publisher', 'Unknown'),
            "published": datetime.fromtimestamp(item.get('providerPublishTime', 0)).strftime('%Y-%m-%d %H:%M') if item.get('providerPublishTime') else None,
            "thumbnail": item.get('thumbnail', {}).get('resolutions', [{}])[0].get('url') if item.get('thumbnail') else None
        }
        for item in news[:limit]
    ]


def get_market_news(limit: int = 10) -> List[Dict]:
    """Get general market news"""
    return get_stock_news("SPY", limit=limit)
