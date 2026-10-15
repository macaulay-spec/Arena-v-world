/**
 * Authored geography of Vora City (fictional country V).
 * Coordinates in meters: x = east, z = south. City footprint ≈ 1.64 km × 1.12 km plus hinterland.
 */
import type { DistrictCode, Polygon, RoadClass, Vec2, BlockUse, LandmarkRole } from '../src/shared/types';
import { shorelineZ, riverCenterX, riverHalfWidthAt } from '../src/shared/terrain';

export const SEED = 20260419;
export const VERSION = '0.2.0';

export interface DistrictDef {
  code: DistrictCode; name: string; character: string; polygon: Polygon; color: string;
  /** local street infill parameters */
  grid: { angle: number; sx: number; sz: number; jitter: number; cls: RoadClass; warp: number; truncate: number; laneChance: number; crescent: number; collectorEvery: number };
  parcel: { w: number; d: number; jitter: number };
}

const R = 0.0174533;

export const DISTRICTS: DistrictDef[] = [
  {
    code: 'CD', name: 'Central District', color: '#6f7fa8',
    character: 'Commercial and administrative heart: skyline towers, civic buildings, hotels, plazas and broad boulevards.',
    polygon: [[-300, -230], [405, -230], [405, 160], [-300, 160]],
    grid: { angle: 0, sx: 82, sz: 74, jitter: 0.06, cls: 'local', warp: 0, truncate: 0.05, laneChance: 0, crescent: 0, collectorEvery: 0 },
    parcel: { w: 28, d: 36, jitter: 0.25 },
  },
  {
    code: 'MQ', name: 'Market Quarter', color: '#c0863a',
    character: 'Dense everyday commerce: covered markets, shophouses, stalls, supermarkets, loading yards and busy lanes.',
    polygon: [[-300, 160], [405, 160], [440, 300], [470, 470], [-300, 470]],
    grid: { angle: 0, sx: 74, sz: 60, jitter: 0.12, cls: 'local', warp: 0, truncate: 0.12, laneChance: 0.45, crescent: 0, collectorEvery: 0 },
    parcel: { w: 12, d: 24, jitter: 0.3 },
  },
  {
    code: 'NH', name: 'North Heights', color: '#5e9a6a',
    character: 'Premium residential district on the rise: villas, mansions, gated compounds and landscaped crescents.',
    polygon: [[-820, -620], [-100, -620], [-100, -230], [-300, -230], [-300, -120], [-820, -120]],
    grid: { angle: -5 * R, sx: 150, sz: 118, jitter: 0.1, cls: 'local', warp: 4, truncate: 0.08, laneChance: 0, crescent: 0.5, collectorEvery: 0 },
    parcel: { w: 26, d: 34, jitter: 0.22 },
  },
  {
    code: 'OT', name: 'Old Town', color: '#a3684a',
    character: 'The historic core above the old harbour: courtyard houses, narrow lanes, shophouses and the Kesari Royal Court.',
    polygon: [[-820, -120], [-300, -120], [-300, 470], [-820, 470]],
    grid: { angle: 13 * R, sx: 68, sz: 56, jitter: 0.24, cls: 'local', warp: 7, truncate: 0.35, laneChance: 0.5, crescent: 0, collectorEvery: 0 },
    parcel: { w: 13, d: 21, jitter: 0.4 },
  },
  {
    code: 'ID', name: 'Industrial District', color: '#8a8378',
    character: 'Employment and logistics across the Ose River: factories, warehouses, workshops, the port and the works.',
    polygon: [[495, -620], [820, -620], [820, 430], [600, 430], [545, 300]],
    grid: { angle: 0, sx: 190, sz: 140, jitter: 0.06, cls: 'service', warp: 0, truncate: 0.05, laneChance: 0, crescent: 0, collectorEvery: 0 },
    parcel: { w: 56, d: 70, jitter: 0.2 },
  },
  {
    code: 'GE', name: 'Green Estates', color: '#7cab5c',
    character: 'Quieter family suburbs: semi-detached homes, terraces, apartment blocks, schools, clinics and tree-lined streets.',
    polygon: [[-100, -620], [412, -620], [405, -230], [-100, -230]],
    grid: { angle: 3 * R, sx: 112, sz: 90, jitter: 0.1, cls: 'local', warp: 3, truncate: 0.1, laneChance: 0, crescent: 0.35, collectorEvery: 0 },
    parcel: { w: 16, d: 27, jitter: 0.25 },
  },
];

export const HINTERLAND = {
  code: 'HL' as DistrictCode, name: 'Vora Outskirts', color: '#9a9a6a',
  character: 'Farmland, scrub and scattered compounds along the roads out of the city.',
};

export interface RoadDef { name: string; cls: RoadClass; points: Vec2[]; streetId: string; }

function arc(cx: number, cz: number, r: number, a0: number, a1: number, n = 6): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}

function lagoonDrive(): Vec2[] {
  const pts: Vec2[] = [];
  for (let x = -820; x <= 468; x += 32) pts.push([x, shorelineZ(x) - 40]);
  return pts;
}
function riversideWest(): Vec2[] {
  const pts: Vec2[] = [];
  for (let z = -620; z <= 445; z += 30) pts.push([riverCenterX(z) - riverHalfWidthAt(z) - 62, z]);
  return pts;
}
function riversideEast(): Vec2[] {
  const pts: Vec2[] = [];
  for (let z = -620; z <= 420; z += 30) pts.push([riverCenterX(z) + riverHalfWidthAt(z) + 62, z]);
  return pts;
}

export const AUTHORED_ROADS: RoadDef[] = [
  // ── Arterials ──────────────────────────────────────────────────────────────
  { streetId: 'unity', name: 'Unity Boulevard', cls: 'arterial', points: [[-1200, 0], [1200, 0]] },
  { streetId: 'meridian', name: 'Meridian Avenue', cls: 'arterial', points: [[0, -950], [0, 520]] },
  {
    streetId: 'ring', name: 'Vora Ring Road', cls: 'arterial',
    points: [
      [-820, 470], [-820, -560], ...arc(-760, -560, 60, Math.PI, Math.PI * 1.5),
      [760, -620], ...arc(760, -560, 60, Math.PI * 1.5, Math.PI * 2), [820, 420],
    ],
  },
  { streetId: 'portroad', name: 'Port Road', cls: 'secondary', points: [[820, 420], [598, 420]] },
  // ── Waterfront / riverside ─────────────────────────────────────────────────
  { streetId: 'lagoon', name: 'Lagoon Drive', cls: 'waterfront', points: lagoonDrive() },
  { streetId: 'riverside-w', name: 'Riverside Road', cls: 'secondary', points: riversideWest() },
  { streetId: 'riverside-e', name: 'East Bank Road', cls: 'service', points: riversideEast() },
  // ── Secondary east-west ────────────────────────────────────────────────────
  { streetId: 'heights', name: 'Heights Road', cls: 'secondary', points: [[-820, -230], [440, -230]] },
  { streetId: 'market', name: 'Market Street', cls: 'secondary', points: [[-820, 160], [455, 160]] },
  { streetId: 'crescent', name: 'Crescent Road', cls: 'secondary', points: [[-820, -420], [440, -420]] },
  { streetId: 'adanse', name: 'Adanse Road', cls: 'secondary', points: [[-820, 320], [480, 320]] },
  // ── Secondary north-south ──────────────────────────────────────────────────
  { streetId: 'kesari', name: 'Kesari Street', cls: 'secondary', points: [[-300, -620], [-300, 520]] },
  { streetId: 'palm', name: 'Palm Avenue', cls: 'secondary', points: [[310, -620], [310, 540]] },
  { streetId: 'olumi', name: 'Olumi Road', cls: 'secondary', points: [[-550, -620], [-550, 500]] },
  { streetId: 'baruwa', name: 'Baruwa Street', cls: 'secondary', points: [[-150, -620], [-150, 520]] },
  { streetId: 'tenda', name: 'Tenda Avenue', cls: 'secondary', points: [[150, -620], [150, 540]] },
  // ── Old Town diagonal ──────────────────────────────────────────────────────
  { streetId: 'oldharbour', name: 'Old Harbour Road', cls: 'secondary', points: [[-300, -120], [-640, 330], [-700, 408]] },
  // ── Industrial spine and service grid ─────────────────────────────────────
  { streetId: 'foundry', name: 'Foundry Avenue', cls: 'secondary', points: [[660, -620], [660, 420]] },
  { streetId: 'works', name: 'Works Road', cls: 'service', points: [[470, -400], [820, -400]] },
  { streetId: 'anvil', name: 'Anvil Road', cls: 'service', points: [[480, -230], [820, -230]] },
  { streetId: 'kiln', name: 'Kiln Street', cls: 'service', points: [[500, -70], [820, -70]] },
  { streetId: 'wharf', name: 'Wharf Road', cls: 'service', points: [[520, 110], [820, 110]] },
  { streetId: 'quay', name: 'Quay Street', cls: 'service', points: [[560, 260], [820, 260]] },
  // ── Framing streets for reserved sites (local) ─────────────────────────────
  { streetId: 'square-e', name: 'Square Street', cls: 'local', points: [[120, -230], [120, 160]] },
  { streetId: 'civic-n', name: 'Assembly Street', cls: 'local', points: [[-300, -90], [310, -90]] },
  { streetId: 'civic-s', name: 'Theatre Street', cls: 'local', points: [[-300, 90], [150, 90]] },
  { streetId: 'cathedral-s', name: 'Chapel Street', cls: 'local', points: [[-300, -140], [-150, -140]] },
  { streetId: 'terminal-s', name: 'Terminal Street', cls: 'local', points: [[-150, 440], [310, 440]] },
  { streetId: 'kesari-w', name: 'Court Lane', cls: 'local', points: [[-480, 160], [-480, 320]] },
  { streetId: 'kesari-e', name: 'Palace Street', cls: 'local', points: [[-380, 160], [-380, 320]] },
  { streetId: 'kesari-s', name: 'Kesari Square Street', cls: 'local', points: [[-550, 280], [-300, 280]] },
  { streetId: 'mosque-s', name: 'Imam Street', cls: 'local', points: [[-550, -20], [-300, -20]] },
  { streetId: 'mosque-w', name: 'Minaret Street', cls: 'local', points: [[-420, -120], [-420, 160]] },
  { streetId: 'otmarket-w', name: 'Weavers Street', cls: 'local', points: [[-700, -120], [-700, 160]] },
  { streetId: 'otmarket-e', name: 'Dyers Street', cls: 'local', points: [[-600, -120], [-600, 160]] },
  { streetId: 'otmarket-n', name: 'Potters Lane', cls: 'local', points: [[-820, -20], [-550, -20]] },
  { streetId: 'otmarket-s', name: 'Calabash Street', cls: 'local', points: [[-820, 60], [-550, 60]] },
  { streetId: 'harbour-w', name: 'Net Street', cls: 'local', points: [[-760, 320], [-760, 420]] },
  { streetId: 'harbour-e', name: 'Fishermen Street', cls: 'local', points: [[-660, 320], [-660, 430]] },
  { streetId: 'hpark-w', name: 'Hilltop Close', cls: 'local', points: [[-500, -420], [-500, -230]] },
  { streetId: 'hpark-e', name: 'Ridge Street', cls: 'local', points: [[-380, -420], [-380, -230]] },
  { streetId: 'hpark-s', name: 'Garden Terrace', cls: 'local', points: [[-550, -330], [-300, -330]] },
  { streetId: 'gepark-s', name: 'Acacia Street', cls: 'local', points: [[-100, -330], [150, -330]] },
  { streetId: 'gepark-e', name: 'Mahogany Street', cls: 'local', points: [[80, -420], [80, -230]] },
  { streetId: 'gestreet', name: 'Iroko Street', cls: 'local', points: [[-100, -520], [150, -520]] },
  { streetId: 'mall-s', name: 'Mall Street', cls: 'local', points: [[150, 90], [310, 90]] },
  { streetId: 'hospital-w', name: 'Hospital Street', cls: 'local', points: [[-230, 0], [-230, 160]] },
  // ── Hinterland farm roads ──────────────────────────────────────────────────
  { streetId: 'farm-w1', name: 'Oyeni Farm Road', cls: 'local', points: [[-820, -380], [-1200, -380]] },
  { streetId: 'farm-w2', name: 'Mill Road', cls: 'local', points: [[-820, 250], [-1200, 300]] },
  { streetId: 'farm-n1', name: 'Hilltop Road', cls: 'local', points: [[-520, -620], [-540, -950]] },
  { streetId: 'farm-n2', name: 'Estate Road', cls: 'local', points: [[250, -620], [270, -950]] },
  { streetId: 'farm-e1', name: 'Quarry Road', cls: 'local', points: [[820, -300], [1200, -330]] },
  { streetId: 'farm-e2', name: 'Pipeline Road', cls: 'local', points: [[820, 200], [1200, 240]] },
];

export interface ZoneDef {
  id: string; name: string; use: BlockUse; rect: [number, number, number, number];
  role?: LandmarkRole; description?: string;
}

/** Reserved sites: block use is forced; local infill does not enter these rectangles (centre-line coordinates). */
export const ZONES: ZoneDef[] = [
  { id: 'unity-square', name: 'Unity Square', use: 'plaza', rect: [0, -90, 120, 0], role: 'city-square', description: 'The signature civic square of Vora City, facing City Hall across Meridian Avenue.' },
  { id: 'city-hall', name: 'Vora City Hall', use: 'landmark', rect: [-150, -90, 0, 0], role: 'civic-landmark', description: 'Seat of the city administration: a domed hall with a colonnaded forecourt.' },
  { id: 'meridian-tower', name: 'Meridian Tower', use: 'landmark', rect: [0, 0, 120, 90], role: 'landmark-office', description: 'The tallest building in V: a 42-storey glass tower on a retail podium.' },
  { id: 'cultural-centre', name: 'V Cultural Centre', use: 'landmark', rect: [-150, 0, 0, 90], role: 'cultural-centre', description: 'National theatre, galleries and the open-air amphitheatre.' },
  { id: 'secretariat', name: 'State Secretariat', use: 'landmark', rect: [-150, -230, 0, -90], role: 'government', description: 'Government offices and the High Court of V.' },
  { id: 'central-park', name: 'Liberty Park', use: 'park', rect: [150, -230, 310, -90], role: 'central-park', description: 'The central park: lawns, a lake, shaded paths and the Liberty Monument.' },
  { id: 'vora-mall', name: 'Palm Crescent Mall', use: 'landmark', rect: [150, 90, 310, 160], role: 'shopping-complex', description: 'The major shopping complex of the city with its own parking grounds.' },
  { id: 'police-fire', name: 'Central Police & Fire', use: 'civic', rect: [150, -90, 310, 0], role: 'government', description: 'Police headquarters and the central fire station.' },
  { id: 'cathedral', name: 'St. Anne Cathedral', use: 'landmark', rect: [-300, -230, -150, -140], role: 'religious', description: 'Twin-towered cathedral and its gardens.' },
  { id: 'hospital', name: 'Vora General Hospital', use: 'landmark', rect: [-300, 0, -230, 160], role: 'hospital', description: 'The main teaching hospital with wards, emergency bays and a helipad.' },
  { id: 'grand-market', name: 'Adanse Grand Market', use: 'market', rect: [-150, 160, 0, 320], role: 'market-complex', description: 'Covered halls, open courtyards and hundreds of stalls - the commercial engine of the Market Quarter.' },
  { id: 'terminal', name: 'Vora Central Terminal', use: 'transport', rect: [0, 320, 150, 440], role: 'transport-terminal', description: 'Intercity and city bus terminal with sheltered bays, taxi ranks and a motor park.' },
  { id: 'kesari-court', name: 'Kesari Royal Court', use: 'landmark', rect: [-480, 160, -380, 280], role: 'historic-building', description: 'The historic royal court of the Kesari dynasty, with its carved veranda posts and courtyards.' },
  { id: 'kesari-square', name: 'Kesari Square', use: 'plaza', rect: [-380, 160, -300, 280], description: 'The old town square: shade trees, a well and the evening market.' },
  { id: 'mosque', name: 'Vora Central Mosque', use: 'landmark', rect: [-420, -120, -300, -20], role: 'religious', description: 'Domed congregational mosque with twin minarets and a walled courtyard.' },
  { id: 'ot-market', name: 'Old Town Market', use: 'market', rect: [-700, -20, -600, 60], role: 'market', description: 'The neighbourhood market of Old Town: sheds, stalls and craft workshops.' },
  { id: 'harbour', name: 'Old Harbour & Fish Market', use: 'market', rect: [-760, 320, -660, 420], role: 'market', description: 'Fish market, boat landing and the harbour square at the end of Old Harbour Road.' },
  { id: 'jag-house', name: 'JAG House', use: 'landmark', rect: [-380, -420, -300, -330], role: 'residence', description: 'The walled hillside estate of the JAG family on Ridge Street: the mansion, its gardens, pool and staff quarters. The player\'s home.' },
  { id: 'heights-park', name: 'Hilltop Gardens', use: 'park', rect: [-500, -420, -380, -330], role: 'park', description: 'Hilltop park of North Heights with views over the city.' },
  { id: 'ge-park', name: 'Acacia Park', use: 'park', rect: [-100, -420, 80, -330], role: 'park', description: 'Neighbourhood park and playground of Green Estates.' },
  { id: 'stadium', name: 'Vora National Stadium', use: 'landmark', rect: [150, -620, 310, -420], role: 'stadium', description: 'The 40,000-seat national stadium and sports complex.' },
  { id: 'works', name: 'Municipal Water & Power Works', use: 'landmark', rect: [495, -620, 660, -400], role: 'utility', description: 'Power station, water treatment basins and the city substation.' },
  { id: 'port', name: 'Vora Port', use: 'landmark', rect: [600, 260, 820, 420], role: 'port', description: 'Container quay, cranes, sheds and the lagoon pilot station.' },
];

export const ROUNDABOUTS: { x: number; z: number; r: number; name: string }[] = [
  { x: 0, z: -230, r: 24, name: 'Meridian Circle' },
  { x: 0, z: -620, r: 26, name: 'North Gate Circle' },
  { x: -300, z: 160, r: 19, name: 'Harbour Circle' },
  { x: 310, z: 160, r: 19, name: 'Palm Circle' },
  { x: 0, z: 320, r: 18, name: 'Market Circle' },
  { x: 660, z: 0, r: 22, name: 'Foundry Circle' },
  { x: -550, z: -420, r: 16, name: 'Olumi Circle' },
];

export const GATEWAY = { x: 0, z: -690, name: 'North Gate', description: 'The monumental gateway on Meridian Avenue welcoming travellers from the north.' };

export const BRIDGES: { streetId: string; name: string; kind: 'cable-stayed' | 'beam'; deckHeight: number }[] = [
  { streetId: 'unity', name: 'Unity Bridge', kind: 'cable-stayed', deckHeight: 11 },
  { streetId: 'ring', name: 'North Bridge', kind: 'beam', deckHeight: 8 },
];

// ── Naming pools (original, V-flavoured) ────────────────────────────────────
export const STREET_NAMES: Record<DistrictCode, string[]> = {
  CD: ['Independence', 'Bankers', 'Exchange', 'Federation', 'Liberty', 'Commerce', 'Senate', 'Harmony', 'Victory', 'Cabinet', 'Treasury', 'Ambassador', 'Progress', 'Republic', 'Chamber'],
  MQ: ['Traders', 'Cowrie', 'Indigo', 'Kola', 'Pepper', 'Yam', 'Spice', 'Tailors', 'Brass', 'Salt', 'Cassava', 'Palm Oil', 'Groundnut', 'Lantern', 'Porters'],
  NH: ['Ridge', 'Summit', 'Hillcrest', 'Bougainvillea', 'Jacaranda', 'Flamboyant', 'Panorama', 'Terrace', 'Highgrove', 'Orchid', 'Crest', 'Belvedere', 'Lookout', 'Serene', 'Horizon'],
  OT: ['Kesari', 'Elders', 'Griot', 'Shrine', 'Clay', 'Weaver', 'Calabash', 'Drum', 'Blacksmith', 'Oracle', 'Bead', 'Masquerade', 'Loom', 'Ancestors', 'Cowhorn'],
  ID: ['Foundry', 'Lathe', 'Cargo', 'Depot', 'Furnace', 'Gantry', 'Pipeline', 'Transit', 'Freight', 'Conveyor', 'Timber', 'Cement', 'Steel', 'Haulage', 'Granary'],
  GE: ['Acacia', 'Mahogany', 'Iroko', 'Baobab', 'Hibiscus', 'Frangipani', 'Cashew', 'Mango', 'Tamarind', 'Neem', 'Guava', 'Almond', 'Shea', 'Moringa', 'Ebony'],
  HL: ['Farm', 'Mill', 'Quarry', 'Orchard', 'Plantation', 'Settlers', 'Granary', 'Harvest'],
};
export const STREET_SUFFIX: Record<RoadClass, string[]> = {
  arterial: ['Boulevard', 'Avenue'], waterfront: ['Drive'], secondary: ['Road', 'Street', 'Avenue'],
  local: ['Street', 'Close', 'Crescent', 'Road', 'Way'], lane: ['Lane', 'Alley', 'Passage'], service: ['Way', 'Road'], access: ['Close'],
};

export const FAMILY_NAMES = ['Adanse', 'Kesari', 'Olumi', 'Tenda', 'Baruwa', 'Ikenna', 'Obaseki', 'Mensah', 'Dauda', 'Ayodele', 'Nwosu', 'Kofi', 'Ekundayo', 'Abena', 'Taiwo', 'Yakubu', 'Oyeni', 'Danjuma', 'Sefako', 'Ladipo', 'Eweka', 'Adjei', 'Bello', 'Okafor', 'Sowande', 'Ekong', 'Chidi', 'Amara', 'Zuberi', 'Folami'];
export const BUSINESS_WORDS = {
  shop: ['Stores', 'Enterprises', 'Provisions', 'Textiles', 'Electronics', 'Fabrics', 'Pharmacy', 'Boutique', 'Phones', 'Bookshop', 'Furniture', 'Hardware', 'Cosmetics', 'Bakery', 'Tailoring', 'Fashion House', 'Ventures', 'Trading Co.', 'Plastics', 'Motors Spares'],
  restaurant: ['Kitchen', 'Grill', 'Bukateria', 'Suya Spot', 'Lounge', 'Cafe', 'Chop House', 'Garden Restaurant', 'Pepper Soup Joint', 'Bistro'],
  office: ['Holdings', 'Group', 'Capital', 'Insurance', 'Partners', 'Consulting', 'Telecom', 'Energy', 'Logistics', 'Properties', 'Microfinance', 'Media', 'Assurance', 'Investments'],
  hotel: ['Hotel', 'Suites', 'Grand Hotel', 'Towers Hotel', 'Lodge', 'Guest House', 'Residences'],
  bank: ['Bank', 'Trust Bank', 'Merchant Bank', 'Savings Bank', 'Mutual Bank'],
  industrial: ['Works', 'Industries', 'Manufacturing', 'Steel', 'Foods', 'Breweries', 'Cement', 'Plastics', 'Textiles Mill', 'Packaging', 'Printing Press', 'Bottling Co.', 'Timber Yard', 'Haulage', 'Depot'],
  workshop: ['Auto Repairs', 'Panel Beaters', 'Welders', 'Vulcanizer', 'Mechanics', 'Carpentry', 'Aluminium Works', 'Tyres', 'Battery Chargers', 'Motor Clinic'],
  school: ['Primary School', 'Secondary School', 'Grammar School', 'College', 'Academy', 'Nursery & Primary School'],
  clinic: ['Clinic', 'Medical Centre', 'Maternity Home', 'Health Centre', 'Dental Clinic'],
  church: ['Baptist Church', 'Methodist Church', 'Anglican Church', 'Cathedral Church', 'Chapel', 'Assembly Church'],
  mosque: ['Mosque', 'Jumat Mosque', 'Central Mosque'],
  fuel: ['Petroleum', 'Oil', 'Energy', 'Gas'],
  supermarket: ['Supermarket', 'Superstore', 'Mart', 'Hypermarket', 'Cash & Carry'],
  community: ['Community Hall', 'Town Hall', 'Youth Centre', 'Library', 'Cooperative Hall'],
};
export const PLACE_WORDS = ['Lagoon', 'Palm', 'Unity', 'Vora', 'Meridian', 'Golden', 'Royal', 'Crescent', 'Ose', 'Harbour', 'Sunrise', 'Heritage', 'Liberty', 'Highland', 'Savannah', 'Coral', 'Emerald', 'Ivory', 'Baobab', 'Horizon'];

export const BUILDING_COLORS = {
  plaster: ['#d9cdb6', '#e3d9c5', '#cfc1a7', '#e8dccb', '#c9b89b', '#dcd3c2', '#e6d6b8', '#d1c6b2', '#c7b9a3', '#efe6d6', '#d8c3a5', '#e0cfbd', '#f0e4d0', '#c8bba9'],
  plasterColour: ['#d7b089', '#c88f6a', '#b9a37c', '#9fb0a8', '#c2b280', '#d6a77a', '#e0b894', '#8fa39a', '#b57f66', '#cdb891', '#a7b2c2', '#e3c0a0', '#bfae8f', '#d49f7e', '#f1d4a8', '#b8c4b0'],
  concrete: ['#b8b2a8', '#a7a39b', '#c2bdb4', '#9c9890', '#aaa59d', '#b3ada2'],
  brick: ['#9d5a45', '#a86a52', '#8c4f3c', '#b3755c'],
  glass: ['#6f8fa6', '#5d7c93', '#7a95a8', '#4f6d82', '#8aa3b3', '#3f5c70'],
  metal: ['#8e949a', '#7a8187', '#a2a7ab', '#6e7479'],
  zinc: ['#8f9398', '#a4a7aa', '#7b7f83', '#9aa0a5'],
  roofRed: ['#8f3b2d', '#a0493a', '#7d3528', '#b05a46'],
  roofGreen: ['#3d5d4b', '#466a55', '#355443'],
  roofBrown: ['#6d4a36', '#7c5640', '#5f4030'],
  roofTile: ['#a0533c', '#8f4a35', '#b56346'],
  trim: ['#ffffff', '#f2efe8', '#e8e2d6', '#2b2b2b', '#3b3a38', '#5a4a3a'],
  sign: ['#b3261e', '#1d5c8a', '#1f7a4d', '#d98a1f', '#222222', '#6b2d8b', '#e0b323', '#0e7c7b', '#c44b8c'],
};
