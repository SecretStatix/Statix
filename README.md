# Dividend Fantasy

NBA player stock market with weekly dividends based on fantasy performance.

## Architecture

```
dividend_fantasy/
├── contracts/          # Solidity smart contracts (Hardhat)
│   ├── PlayerToken.sol       # ERC20 token for each player
│   ├── PlayerAMM.sol         # Constant product AMM
│   ├── DividendDistributor.sol # Weekly dividend distribution
│   └── MockUSDC.sol          # Test USDC token
│
├── backend/            # Python FastAPI
│   ├── main.py               # API entry point
│   ├── players.py            # Player data endpoints
│   ├── dividends.py          # Dividend calculation
│   └── blockchain.py         # Contract interactions
│
├── frontend/           # Next.js + React
│   ├── app/                  # Next.js app router
│   └── components/           # React components
│
├── dividend_math.py    # Core math functions
└── math_explained.md   # Math documentation
```

## How It Works

### 1. AMM Trading
- Each player has a token (ERC20) and an AMM pool
- Constant product formula: `shares × cash = k`
- Trading fee: 1.5% (split between dividend pool and protocol)

### 2. Fee Split
```
Trading Fee (1.5%)
├── 67% → Dividend Pool
└── 33% → Protocol Revenue
```

### 3. Dividend Distribution
```
Dividend Pool
├── 20% → Base Dividend (ALL shareholders)
└── 80% → Outperformer Dividend (only outperforming players)
```

### 4. Outperformance Calculation
```
outperformance = (actual_points - projected_points) / projected_points
```

Players who beat their fantasy projection share the outperformer pool proportionally.

## Setup

### Contracts

```bash
cd contracts
npm install
npx hardhat compile

# Deploy to local network
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost

# Deploy to Base Sepolia
npx hardhat run scripts/deploy.js --network baseSepolia
```

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run server
uvicorn main:app --reload
```

#### Backend With Docker

```bash
# Build the runtime image
docker build -t statix-backend ./backend

# Run the API locally on http://localhost:8000
docker run --rm -p 8000:8000 --env-file backend/.env statix-backend

# Build and run the test image
docker build --target test -t statix-backend-test ./backend
docker run --rm statix-backend-test
```

If you have not created `backend/.env` yet, copy `backend/.env.example` first and fill in the values you need.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

### Contracts (.env)
```
PRIVATE_KEY=your_wallet_private_key
BASE_SEPOLIA_RPC=https://sepolia.base.org
BASESCAN_API_KEY=your_basescan_api_key
```

### Backend (.env)
```
BASE_SEPOLIA_RPC=https://sepolia.base.org
PRIVATE_KEY=your_private_key
DATABASE_URL=sqlite:///./dividend_fantasy.db
```

### Frontend (.env.local)
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

## API Endpoints

### Players
- `GET /players` - List all players
- `GET /players/{id}` - Get player details
- `GET /players/{id}/performance` - Get performance history

### Dividends
- `GET /dividends/week/{week}` - Get weekly dividend pool
- `GET /dividends/user/{address}` - Get user's dividend history
- `POST /dividends/calculate` - Calculate dividend distribution

### Blockchain
- `GET /blockchain/status` - Check connection
- `GET /blockchain/player/{id}/market` - Get AMM market data
- `GET /blockchain/player/{id}/buy-quote` - Get buy quote
- `GET /blockchain/player/{id}/sell-quote` - Get sell quote

## Smart Contract Addresses (Base Sepolia)

After deployment, addresses will be saved to `contracts/deployed-addresses.json`.

## License

MIT
