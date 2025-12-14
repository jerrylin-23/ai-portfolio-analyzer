"""
AI Sentiment Analyzer - Using Google Gemini
"""
import os
from typing import Dict
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Use Gemini 1.5 Flash (fast and cheap)
model = genai.GenerativeModel('gemini-1.5-flash') if GEMINI_API_KEY else None


def analyze_sentiment(title: str, summary: str = "") -> Dict:
    """
    Analyze sentiment of a news article using Gemini AI
    Returns: {sentiment: 'bullish'|'bearish'|'neutral', score: -1 to 1, reason: str}
    """
    
    # Fallback if no API key
    if not GEMINI_API_KEY or not model:
        return fallback_sentiment(title, summary)
    
    try:
        prompt = f"""Analyze the sentiment of this financial news for investors.

Title: {title}
Summary: {summary}

Respond in this exact JSON format only, no other text:
{{"sentiment": "bullish" or "bearish" or "neutral", "score": number from -1 to 1, "reason": "brief 10 word reason"}}

Score guide: -1 = very bearish, 0 = neutral, 1 = very bullish"""

        response = model.generate_content(prompt)
        text = response.text.strip()
        
        # Parse JSON response
        import json
        # Clean up response (sometimes has markdown)
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        
        result = json.loads(text.strip())
        return {
            "sentiment": result.get("sentiment", "neutral"),
            "score": float(result.get("score", 0)),
            "reason": result.get("reason", "")
        }
        
    except Exception as e:
        print(f"Gemini error: {e}")
        return fallback_sentiment(title, summary)


def fallback_sentiment(title: str, summary: str = "") -> Dict:
    """
    Simple keyword-based sentiment analysis (fallback if no API key)
    """
    text = (title + " " + summary).lower()
    
    bullish_words = [
        'surge', 'soar', 'jump', 'gain', 'rise', 'beat', 'exceed', 'record',
        'bullish', 'upgrade', 'buy', 'strong', 'growth', 'profit', 'success',
        'breakthrough', 'innovation', 'expand', 'outperform', 'rally'
    ]
    
    bearish_words = [
        'fall', 'drop', 'plunge', 'decline', 'loss', 'miss', 'cut', 'layoff',
        'bearish', 'downgrade', 'sell', 'weak', 'struggle', 'warning', 'risk',
        'concern', 'crash', 'slump', 'underperform', 'lawsuit'
    ]
    
    bullish_count = sum(1 for word in bullish_words if word in text)
    bearish_count = sum(1 for word in bearish_words if word in text)
    
    if bullish_count > bearish_count:
        score = min(bullish_count * 0.2, 1.0)
        return {"sentiment": "bullish", "score": score, "reason": "Positive keywords detected"}
    elif bearish_count > bullish_count:
        score = max(-bearish_count * 0.2, -1.0)
        return {"sentiment": "bearish", "score": score, "reason": "Negative keywords detected"}
    else:
        return {"sentiment": "neutral", "score": 0, "reason": "No strong sentiment signals"}


def get_portfolio_sentiment(symbols: list) -> Dict:
    """Get overall sentiment for a list of stocks"""
    # This could be expanded to analyze multiple stocks
    pass
