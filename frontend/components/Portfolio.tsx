'use client';

import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { usePortfolio, useDBucksBalance, useFaucetDBucks } from '@/hooks/useContracts';

export function Portfolio() {
  const { address, isConnected } = useAccount();
  const { data: portfolioData, isLoading } = usePortfolio(address);
  const { data: dbucksBalance } = useDBucksBalance(address);
  const { faucet, isPending: minting, isSuccess: minted } = useFaucetDBucks();

  if (!isConnected) {
    return (
      <div className="bg-gray-800 rounded-xl p-8 text-center">
        <p className="text-gray-400">Connect your wallet to view your portfolio</p>
      </div>
    );
  }

  const balance = dbucksBalance ? parseFloat(formatUnits(dbucksBalance as bigint, 6)) : 0;

  let holdings: { index: number; shares: number; value: number }[] = [];
  let holdingsValue = 0;

  if (portfolioData) {
    const [idxs, sharesArr, valuesArr] = portfolioData as [bigint[], bigint[], bigint[]];
    holdings = idxs.map((idx, i) => {
      const shares = parseFloat(formatUnits(sharesArr[i], 6));
      const value = parseFloat(formatUnits(valuesArr[i], 6));
      holdingsValue += value;
      return { index: Number(idx), shares, value };
    });
  }

  const totalValue = balance + holdingsValue;

  const handleFaucet = () => {
    faucet(10000);
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Total Portfolio Value</p>
          <p className="text-2xl font-bold">${totalValue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Holdings Value</p>
          <p className="text-2xl font-bold">${holdingsValue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">D-Bucks Balance</p>
          <p className="text-2xl font-bold">${balance.toFixed(2)}</p>
        </div>
      </div>

      {/* Get Test D-Bucks */}
      <div className="bg-gray-800 rounded-xl p-4">
        <button
          onClick={handleFaucet}
          disabled={minting}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition"
        >
          {minting ? 'Minting...' : minted ? 'Got 10,000 D-Bucks!' : 'Get 10,000 D-Bucks (Free Faucet)'}
        </button>
        <p className="text-xs text-gray-500 mt-2">Free D-Bucks for testing trades. 100k limit per wallet.</p>
      </div>

      {/* Holdings Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : holdings.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No holdings yet. Get some D-Bucks above, then buy player shares!
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-400">Player #</th>
                <th className="text-right p-4 font-medium text-gray-400">Shares</th>
                <th className="text-right p-4 font-medium text-gray-400">Value</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.index} className="border-t border-gray-700 hover:bg-gray-700/50">
                  <td className="p-4 font-medium">Player #{h.index}</td>
                  <td className="p-4 text-right font-mono">{h.shares.toFixed(2)}</td>
                  <td className="p-4 text-right font-mono">${h.value.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
