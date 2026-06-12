# 📊 AI Portfolio Analyzer

A real-time stock portfolio tracker with AI-powered analysis using Google Gemini. Get contextual market insights based on your holdings, upcoming economic events, and megacap earnings.

![Python](https://img.shields.io/badge/Python-3.9+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green)
![Gemini](https://img.shields.io/badge/Gemini-2.5-purple)

## ✨ Features

- **Real-time Portfolio Tracking** - Live stock prices via yfinance
- **Sector Performance** - Track 15+ sectors with Today/1W/1M performance
- **AI Portfolio Analysis** - Gemini analyzes your holdings with market context
- **Gemini-to-Gemini Pipeline** - First AI summarizes market, second analyzes your portfolio
- **Economic Calendar** - Real-time FOMC, CPI, NFP events from ForexFactory
- **Earnings Calendar** - Upcoming earnings for 30+ megacaps & sector leaders
- **Real-time News** - Live headlines from newsfilter.io

The **AI Portfolio Analyzer** is fully deployed on Render.

### Live Website

View the base URL for the deployed application here. This link serves as the backend API for the project:

[![View Live Website on Render](https://img.shields.io/badge/View%20Live%20Website-Render-blue?style=for-the-badge&logo=render&logoColor=white)](https://ai-portfolio-analyzer.onrender.com)

> **⚠️ Performance Disclaimer:** Due to the resource constraints of the free-tier Render deployment, the service may take time to spin up (cold start latency), and AI analysis calls (Gemini API) can take **5-10 seconds** to complete. For the **best and fastest user experience**, we highly recommend running the application locally using the **Quick Start** guide.

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Gemini API Key ([get free](https://aistudio.google.com/apikey))

### Installation

```bash
# Clone the repo
git clone https://github.com/jerrylin-23/ai-portfolio-analyzer.git
cd ai-portfolio-analyzer

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Start backend
python3 main.py
```

```bash
# Frontend (new terminal)
cd frontend
python3 -m http.server 3000
```

Open http://localhost:3000

## 🔑 API Keys Required

| Service | Required | Get Key |
|---------|----------|---------|
| **Gemini** | ✅ Yes | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **Finnhub** | Optional | [finnhub.io](https://finnhub.io) |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (HTML/JS)                    │
│  Portfolio View │ Sectors │ News │ AI Analysis Button   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                 Backend (FastAPI)                        │
│  /api/portfolio │ /api/sectors │ /api/market-context    │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   ┌─────────┐    ┌───────────┐    ┌───────────┐
   │ yfinance │    │ForexFactory│    │  Gemini   │
   │(stocks)  │    │(calendar)  │    │   API     │
   └─────────┘    └───────────┘    └───────────┘
```

## 🤖 AI Analysis Pipeline

1. **Page Load** → Gemini #1 summarizes market context
   - Fetches economic calendar (FOMC, CPI, NFP)
   - Checks upcoming megacap earnings
   - Generates risk assessment

2. **Click AI Analysis** → Gemini #2 analyzes portfolio
   - Your holdings + sector exposure
   - Market context from Gemini #1
   - Actionable insights

## 📁 Project Structure

```
ai-portfolio-analyzer/
├── backend/
│   ├── main.py          # FastAPI app with all endpoints
│   ├── stock_data.py    # yfinance integration
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html       # Main UI
│   ├── app.js           # Frontend logic
│   └── styles.css       # Dark theme styling
└── README.md
```

## 🛣️ Roadmap

- [ ] Add more international markets
- [ ] Portfolio performance charts
- [ ] Alerts for earnings/FOMC
- [ ] Mobile responsive design

## 📝 License

MIT License - feel free to use and modify!

---
