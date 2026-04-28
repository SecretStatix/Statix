// Hand-picked stars used to make the marketing page pop. These IDs match
// `frontend/deployments.json` so the headshots resolve from cdn.nba.com.
// Team accent colors (a single brand-leaning color per team) drive the radial
// gradients behind each player headshot.
export type FeaturedStar = {
  id: string;
  name: string;
  symbol: string;
  team: string;
  nbaId: number;
  accent: string;
};

export const FEATURED_STARS: FeaturedStar[] = [
  { id: 'lebron_james',           name: 'LeBron James',           symbol: 'JAMEL',  team: 'LAL', nbaId: 2544,    accent: '#FDB927' },
  { id: 'stephen_curry',          name: 'Stephen Curry',          symbol: 'CURRS',  team: 'GSW', nbaId: 201939,  accent: '#FFC72C' },
  { id: 'nikola_jokic',           name: 'Nikola Jokic',           symbol: 'JOKIN',  team: 'DEN', nbaId: 203999,  accent: '#FEC524' },
  { id: 'luka_doncic',            name: 'Luka Doncic',            symbol: 'DONCL',  team: 'LAL', nbaId: 1629029, accent: '#552583' },
  { id: 'jayson_tatum',           name: 'Jayson Tatum',           symbol: 'TATUJ',  team: 'BOS', nbaId: 1628369, accent: '#007A33' },
  { id: 'shai_gilgeous_alexander',name: 'Shai Gilgeous-Alexander',symbol: 'GILS',   team: 'OKC', nbaId: 1628983, accent: '#007AC1' },
  { id: 'anthony_edwards',        name: 'Anthony Edwards',        symbol: 'EDWAA',  team: 'MIN', nbaId: 1630162, accent: '#236192' },
  { id: 'victor_wembanyama',      name: 'Victor Wembanyama',      symbol: 'WEMBV',  team: 'SAS', nbaId: 1641705, accent: '#C4CED4' },
  { id: 'kevin_durant',           name: 'Kevin Durant',           symbol: 'DURAK',  team: 'PHX', nbaId: 201142,  accent: '#E56020' },
  { id: 'jalen_brunson',          name: 'Jalen Brunson',          symbol: 'BRUNJ',  team: 'NYK', nbaId: 1628973, accent: '#F58426' },
  { id: 'donovan_mitchell',       name: 'Donovan Mitchell',       symbol: 'MITCD',  team: 'CLE', nbaId: 1628378, accent: '#860038' },
  { id: 'cade_cunningham',        name: 'Cade Cunningham',        symbol: 'CUNNC',  team: 'DET', nbaId: 1630595, accent: '#C8102E' },
];

export function headshotUrl(nbaId: number, size: '260x190' | '1040x760' = '1040x760') {
  return `https://cdn.nba.com/headshots/nba/latest/${size}/${nbaId}.png`;
}
