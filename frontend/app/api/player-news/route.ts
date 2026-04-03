import { NextRequest, NextResponse } from 'next/server';

interface NewsItem {
  title: string;
  source: string;
  time: string;
  url: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  category: 'player' | 'team';
}

const NBA_TEAMS: Record<string, string> = {
  ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets',
  CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons',
  GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'LA Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans', NYK: 'New York Knicks', OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors', UTA: 'Utah Jazz', WAS: 'Washington Wizards',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function guessSentiment(title: string): 'positive' | 'negative' | 'neutral' {
  const lower = title.toLowerCase();
  const negative = ['injury', 'injured', 'out ', 'miss', 'suspend', 'loss', 'lose', 'lost', 'doubt', 'concern', 'worry', 'struggle', 'decline', 'worst', 'fine', 'foul', 'ejected', 'surgery', 'torn', 'fracture', 'sprain'];
  const positive = ['win', 'won', 'career-high', 'season-high', 'triple-double', 'double-double', 'lead', 'star', 'dominat', 'clutch', 'return', 'upgrade', 'sign', 'extend', 'streak', 'record', 'playoff', 'all-star', 'mvp', 'breakout', 'surge', 'boost'];

  if (negative.some(w => lower.includes(w))) return 'negative';
  if (positive.some(w => lower.includes(w))) return 'positive';
  return 'neutral';
}

async function fetchGoogleNews(query: string, category: 'player' | 'team'): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' NBA')}&hl=en-US&gl=US&ceid=US:en`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) return [];

  const xml = await res.text();
  const items: NewsItem[] = [];

  // Parse RSS XML items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const block = match[1];

    const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/);
    const linkMatch = block.match(/<link\s*\/?>([^<]*)|<link>(.*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);
    const sourceMatch = block.match(/<source.*?>(.*?)<\/source>/);

    const rawTitle = titleMatch?.[1] || titleMatch?.[2] || '';
    const url = (linkMatch?.[1] || linkMatch?.[2] || '').trim();
    // Google News appends " - Source Name" to titles, strip it
    const dashIdx = rawTitle.lastIndexOf(' - ');
    const title = dashIdx > 0 ? rawTitle.substring(0, dashIdx).trim() : rawTitle.trim();
    const source = sourceMatch?.[1]?.trim() || (dashIdx > 0 ? rawTitle.substring(dashIdx + 3).trim() : 'News');
    const pubDate = pubDateMatch?.[1] || '';

    if (title) {
      items.push({
        title,
        source,
        url,
        time: pubDate ? timeAgo(pubDate) : '',
        sentiment: guessSentiment(title),
        category,
      });
    }
  }

  return items;
}

export async function GET(req: NextRequest) {
  const playerName = req.nextUrl.searchParams.get('player');
  const team = req.nextUrl.searchParams.get('team');

  if (!playerName || !team) {
    return NextResponse.json({ error: 'Missing player or team' }, { status: 400 });
  }

  const teamFull = NBA_TEAMS[team.toUpperCase()] || team;

  try {
    const [playerNews, teamNews] = await Promise.all([
      fetchGoogleNews(playerName, 'player'),
      fetchGoogleNews(teamFull, 'team'),
    ]);

    const news = [...playerNews, ...teamNews];

    return NextResponse.json({ news, configured: true });
  } catch (err: any) {
    console.error('News fetch error:', err.message);
    return NextResponse.json({ news: [], configured: true, error: err.message });
  }
}
