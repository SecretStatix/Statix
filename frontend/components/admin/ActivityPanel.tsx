'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, TrendingUp, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import deploymentsFallback from '@/deployments.json';

type Tab = 'players' | 'users';

type Player = {
  id: number;
  name: string;
};

type UserProfile = {
  id: string;
  email: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  is_approved: boolean;
  is_admin: boolean;
  wallet_address: string | null;
};

type Trade = {
  id: number;
  wallet_address: string;
  player_name: string | null;
  player_index: number;
  side: 'buy' | 'sell';
  shares: number;
  cost: number;
  price_per_share: number;
  fee: number;
  tx_hash: string | null;
  created_at: string;
};

function isBot(u: UserProfile) {
  return !!u.email?.startsWith('bot') && !u.date_of_birth;
}

const TRADE_SELECT =
  'id, wallet_address, player_name, player_index, side, shares, cost, price_per_share, fee, tx_hash, created_at';

const PAGE_SIZE = 1000;
const MAX_TRADE_ROWS = 25_000;

function truncateWallet(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type TradeQueryResult = { data: Trade[] | null; error: { message: string } | null };

async function fetchTradesPaged(
  fetchPage: (from: number, to: number) => Promise<TradeQueryResult>
): Promise<Trade[]> {
  const out: Trade[] = [];
  for (let from = 0; from < MAX_TRADE_ROWS; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      console.warn('[admin] trades page failed:', error.message);
      break;
    }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

export function ActivityPanel() {
  const [tab, setTab] = useState<Tab>('players');

  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  // Players: same-origin proxy is /api/players/* (see next.config.js). Fallback
  // to bundled deployments.json if the API is down or returns an empty list.
  useEffect(() => {
    let cancelled = false;
    setPlayersLoading(true);

    const fromDeployments = (): Player[] => {
      const raw = (deploymentsFallback as { players?: { index: number; name: string }[] }).players ?? [];
      return raw.map(p => ({ id: p.index, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
    };

    (async () => {
      try {
        const r = await fetch('/api/players/');
        if (r.ok) {
          const data: unknown = await r.json();
          const arr = Array.isArray(data) ? data : [];
          if (!cancelled && arr.length > 0) {
            const mapped: Player[] = (
              arr as {
                index?: number;
                player_index?: number;
                name?: string;
                player_name?: string;
              }[]
            ).map(p => ({
              id: typeof p.index === 'number' ? p.index : Number(p.player_index) || 0,
              name: String(p.name ?? p.player_name ?? 'Unknown'),
            }));
            setPlayers(mapped.sort((a, b) => a.name.localeCompare(b.name)));
            return;
          }
        }
      } catch (e) {
        console.warn('[admin] players API failed:', e);
      }
      if (!cancelled) setPlayers(fromDeployments());
    })().finally(() => {
      if (!cancelled) setPlayersLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load all profiles once (requires RLS policy "Admins can read all profiles").
  useEffect(() => {
    let cancelled = false;
    setUsersLoading(true);
    supabase
      .from('profiles')
      .select('id, email, username, first_name, last_name, date_of_birth, is_approved, is_admin, wallet_address')
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.warn('[admin] profiles load failed:', error.message);
        setUsers((data as UserProfile[]) ?? []);
        setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const walletLabelByAddress = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) {
      const raw = u.wallet_address?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const label =
        (u.username && u.username.trim()) ||
        (u.email ? u.email.split('@')[0] : null) ||
        u.email ||
        truncateWallet(raw);
      m.set(key, label);
    }
    return m;
  }, [users]);

  const labelForTradeWallet = (wallet: string) =>
    walletLabelByAddress.get(wallet.toLowerCase()) ?? truncateWallet(wallet);

  // Load trades for selected player
  useEffect(() => {
    if (!selectedPlayer) return;
    let cancelled = false;
    setTrades([]);
    setTradesLoading(true);
    void (async () => {
      const rows = await fetchTradesPaged(async (from, to) => {
        const { data, error } = await supabase
          .from('transactions')
          .select(TRADE_SELECT)
          .eq('player_index', selectedPlayer.id)
          .order('created_at', { ascending: false })
          .range(from, to);
        return {
          data: data as Trade[] | null,
          error: error ? { message: error.message } : null,
        };
      });
      if (!cancelled) {
        setTrades(rows);
        setTradesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPlayer]);

  // Load trades for selected user (ilike wallet: checksummed profile vs lowercase chain rows)
  useEffect(() => {
    if (!selectedUser) return;
    if (!selectedUser.wallet_address?.trim()) {
      setTrades([]);
      setTradesLoading(false);
      return;
    }
    let cancelled = false;
    setTrades([]);
    setTradesLoading(true);
    const w = selectedUser.wallet_address.trim();
    void (async () => {
      const rows = await fetchTradesPaged(async (from, to) => {
        const { data, error } = await supabase
          .from('transactions')
          .select(TRADE_SELECT)
          .ilike('wallet_address', w)
          .order('created_at', { ascending: false })
          .range(from, to);
        return {
          data: data as Trade[] | null,
          error: error ? { message: error.message } : null,
        };
      });
      if (!cancelled) {
        setTrades(rows);
        setTradesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  const handleSelectPlayer = (p: Player) => {
    setSelectedPlayer(prev => (prev?.id === p.id ? null : p));
  };

  const handleSelectUser = (u: UserProfile) => {
    setSelectedUser(prev => (prev?.id === u.id ? null : u));
  };

  const handleTabSwitch = (t: Tab) => {
    setTab(t);
    setSelectedPlayer(null);
    setSelectedUser(null);
    setTrades([]);
  };

  const selectedItem = tab === 'players' ? selectedPlayer : selectedUser;
  const listLoading = tab === 'players' ? playersLoading : usersLoading;

  const tradesPanelLabel =
    selectedItem
      ? tab === 'players'
        ? `${(selectedItem as Player).name} — ${trades.length} trade${trades.length !== 1 ? 's' : ''}`
        : (() => {
            const u = selectedItem as UserProfile;
            return `${u.username || u.email || u.id.slice(0, 8)} — ${trades.length} trade${trades.length !== 1 ? 's' : ''}`;
          })()
      : null;

  return (
    <section className="px-5 py-6 sm:px-8">
      {/* Section header + tab switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
          Activity
        </h2>
        <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
          <button
            onClick={() => handleTabSwitch('players')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === 'players'
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Players
          </button>
          <button
            onClick={() => handleTabSwitch('users')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === 'users'
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Users
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* ── Left: list ── */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          {listLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-primary" />
            </div>
          ) : tab === 'players' ? (
            <ul className="max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto">
              {players.map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => handleSelectPlayer(p)}
                    className={`w-full px-4 py-3 text-left text-sm transition hover:bg-white/[0.04] ${
                      selectedPlayer?.id === p.id
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-foreground'
                    }`}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto">
              {users.map(u => {
                const bot = isBot(u);
                const selected = selectedUser?.id === u.id;
                return (
                  <li key={u.id}>
                    <button
                      onClick={() => handleSelectUser(u)}
                      className={`w-full px-4 py-2.5 text-left transition hover:bg-white/[0.04] ${
                        selected ? 'bg-primary/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-medium ${
                              bot
                                ? selected
                                  ? 'text-amber-300'
                                  : 'text-amber-400'
                                : selected
                                  ? 'text-primary'
                                  : 'text-foreground'
                            }`}
                          >
                            {u.username || u.email || u.id.slice(0, 8)}
                          </p>
                          {u.email && u.username && (
                            <p
                              className={`truncate text-xs ${
                                bot ? 'text-amber-400/50' : 'text-muted-foreground'
                              }`}
                            >
                              {u.email}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {bot && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              BOT
                            </span>
                          )}
                          {u.is_admin && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              ADMIN
                            </span>
                          )}
                          {!u.is_approved && !bot && (
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Right: trades ── */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          {!selectedItem ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Select a {tab === 'players' ? 'player' : 'user'} to view their trades
              </p>
            </div>
          ) : tradesLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-primary" />
            </div>
          ) : !selectedUser?.wallet_address && tab === 'users' ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-muted-foreground">No wallet linked to this user</p>
            </div>
          ) : trades.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-muted-foreground">No trades found</p>
            </div>
          ) : (
            <>
              <div className="border-b border-white/[0.06] px-4 py-3">
                <p className="text-xs text-muted-foreground">{tradesPanelLabel}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-muted-foreground/50">
                      <th className="px-4 py-2 text-left font-medium">Time</th>
                      {tab === 'players' ? (
                        <th className="px-4 py-2 text-left font-medium">User</th>
                      ) : (
                        <th className="px-4 py-2 text-left font-medium">Player</th>
                      )}
                      <th className="px-4 py-2 text-left font-medium">Side</th>
                      <th className="px-4 py-2 text-right font-medium">Shares</th>
                      <th className="px-4 py-2 text-right font-medium">Cost</th>
                      <th className="px-4 py-2 text-right font-medium">Price/share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {trades.map(t => (
                      <tr key={t.id} className="hover:bg-white/[0.02]">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                          {new Date(t.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        {tab === 'players' ? (
                          <td
                            className="max-w-[200px] truncate px-4 py-2.5 text-xs text-foreground"
                            title={t.wallet_address}
                          >
                            {labelForTradeWallet(t.wallet_address)}
                          </td>
                        ) : (
                          <td className="px-4 py-2.5 text-xs text-foreground">
                            {t.player_name || `#${t.player_index}`}
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              t.side === 'buy'
                                ? 'bg-success/15 text-success'
                                : 'bg-destructive/15 text-destructive'
                            }`}
                          >
                            {t.side === 'buy' ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3" />
                            )}
                            {t.side === 'buy' ? 'Buy' : 'Sell'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                          {Number(t.shares).toFixed(4)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                          ${Number(t.cost).toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          ${Number(t.price_per_share).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
