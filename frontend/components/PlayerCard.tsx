'use client';

import { PlayerData } from './PlayerGrid';

interface PlayerCardProps {
  player: PlayerData;
  onTrade: () => void;
}

export function PlayerCard({ player, onTrade }: PlayerCardProps) {
  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-orange-500 transition-all">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-xl font-bold">
              {player.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <h3 className="font-semibold">{player.name}</h3>
              <p className="text-sm text-gray-400">{player.team} · {player.position}</p>
            </div>
          </div>
          <span className="text-xs bg-gray-700 px-2 py-1 rounded font-mono">{player.symbol}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Price</span>
          <span className="text-xl font-bold">${player.price.toFixed(2)}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Avg FPts/Game</span>
          <span className="font-medium">{player.avgFantasyPoints.toFixed(1)}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Weekly Projection</span>
          <span className="font-medium">{player.weeklyProjection.toFixed(1)}</span>
        </div>
      </div>

      {/* Trade Button */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={onTrade}
          className="w-full py-2 px-4 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg font-semibold hover:opacity-90 transition"
        >
          Trade
        </button>
      </div>
    </div>
  );
}
