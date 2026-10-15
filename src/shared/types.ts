/**
 * V-WORLD shared data schema.
 *
 * The generator (Node) writes `data/city.json` conforming to `CityData`.
 * The renderer (browser) and the verification tests (Node) both consume it.
 * Every entity carries a stable, human-readable id so future gameplay systems
 * (ownership, jobs, navigation, multiplayer) can reference the world safely.
 *
 * Units: meters. Axes: x = east, z = south (screen-like map), y = up.
 */

export type Vec2 = [number, number];
export type Polygon = Vec2[];

export type DistrictCode = 'CD' | 'MQ' | 'NH' | 'OT' | 'ID' | 'GE' | 'HL';

export interface District {
  id: string;
  code: DistrictCode;
  name: string;
  character: string;
  polygon: Polygon;
  center: Vec2;
  /** Dominant palette hints for minimap / UI */
  color: string;
}

export type RoadClass = 'arterial' | 'secondary' | 'local' | 'lane' | 'service' | 'access' | 'waterfront';

export interface RoadProfile {
  /** full carriageway width (edge of kerb to edge of kerb), meters */
  carriageway: number;
  /** sidewalk width per side */
  sidewalk: number;
  /** raised planted median width (0 = none) */
  median: number;
  lanes: number;
  /** desired spacing of street lights */
  lampSpacing: number;
  /** open roadside drain (West African local streets) */
  drain: boolean;
  /** kerbside parking lane permitted */
  parking: boolean;
}

export interface RoadNode {
  id: string;
  x: number;
  z: number;
  /** ids of incident edges */
  edges: string[];
  kind: 'junction' | 'bend' | 'roundabout' | 'end';
  /** roundabout radius if kind === 'roundabout' */
  radius?: number;
  signals?: boolean;
}

export interface RoadEdge {
  id: string;
  a: string;
  b: string;
  cls: RoadClass;
  /** polyline from node a to node b (inclusive of endpoints) */
  points: Vec2[];
  length: number;
  streetId: string;
  name: string;
  /** bridge deck profile: edge is elevated over water */
  bridge?: { kind: 'cable-stayed' | 'beam'; deckHeight: number };
  oneWay?: boolean;
  /** open roadside drain on this edge */
  drain?: boolean;
  /** deck/centreline elevation per point (same length as points) */
  heights?: number[];
}

export type BlockUse =
  | 'residential' | 'commercial' | 'mixed' | 'industrial' | 'civic' | 'park'
  | 'plaza' | 'transport' | 'market' | 'water' | 'open' | 'landmark' | 'farmland';

export interface Block {
  id: string;
  districtId: string;
  /** polygon between road centrelines (graph face) */
  polygon: Polygon;
  /** polygon inset to the building line (behind sidewalks) */
  buildable: Polygon | null;
  use: BlockUse;
  area: number;
  /** road edge ids bounding this block */
  edgeIds: string[];
  reservedFor?: string;
}

export type ParcelUse =
  | 'building' | 'garden' | 'parking' | 'courtyard' | 'yard' | 'park' | 'plaza'
  | 'stalls' | 'construction' | 'playground' | 'field' | 'open' | 'pitch' | 'quay';

export interface Parcel {
  id: string;
  blockId: string;
  districtId: string;
  polygon: Polygon;
  area: number;
  /** road edge that provides street frontage; null for interior parcels */
  frontageEdgeId: string | null;
  /** unit direction along the frontage edge */
  frontDir: Vec2 | null;
  /** outward normal towards the street */
  frontNormal: Vec2 | null;
  use: ParcelUse;
  buildingId?: string;
  /** boundary treatment */
  fence?: 'wall' | 'fence' | 'hedge' | 'railing' | null;
  gate?: { x: number; z: number; dir: Vec2; width: number } | null;
  address: string;
}

export type RoofType = 'flat' | 'hip' | 'gable' | 'shed' | 'sawtooth' | 'dome' | 'barrel' | 'parapet';

export interface MassFeature {
  kind:
    | 'balconies' | 'canopy' | 'columns' | 'awning' | 'sign' | 'stairs' | 'parapet'
    | 'rooftank' | 'ac' | 'antenna' | 'helipad' | 'pergola' | 'chimney' | 'minaret'
    | 'spire' | 'clerestory' | 'loadingdock' | 'rollerdoor' | 'portico' | 'flagpoles'
    | 'cross' | 'crescent' | 'fins' | 'crown' | 'skylight' | 'veranda' | 'dish'
    | 'solar' | 'pylon' | 'cables' | 'tank' | 'stack' | 'pitchlights' | 'arch' | 'clock';
  /** which side (0 = front/frontage, 1 = right, 2 = back, 3 = left) */
  side?: number;
  /** generic numeric params per feature type */
  p?: number[];
  text?: string;
  color?: string;
}

export interface BuildingMass {
  /** rectangle center, half sizes and rotation (radians, around y) */
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  floors: number;
  floorHeight: number;
  /** y of the ground floor slab (plinth top) */
  baseY: number;
  /** elevation of the plinth bottom (below terrain) */
  plinthBottom: number;
  roof: { type: RoofType; tile: string; pitch?: number; overhang?: number; parapet?: number; color?: string };
  facade: { tile: string; bayWidth: number; groundTile?: string; groundHeight?: number; color: string; trim?: string };
  features: MassFeature[];
  /** 4 world-space corners (derived; kept for tests and picking) */
  footprint: Polygon;
  /** mass sits on top of masses[0] (podium + tower) */
  onTop?: number;
}

export type BuildingUse =
  | 'house' | 'duplex' | 'villa' | 'mansion' | 'terrace' | 'courtyard-house' | 'apartments'
  | 'residential-tower' | 'shophouse' | 'shop' | 'restaurant' | 'supermarket' | 'market-hall'
  | 'office' | 'office-tower' | 'hotel' | 'bank' | 'mall' | 'warehouse' | 'factory' | 'workshop'
  | 'fuel-station' | 'school' | 'clinic' | 'hospital' | 'government' | 'church' | 'mosque'
  | 'police' | 'fire-station' | 'cultural' | 'library' | 'stadium' | 'terminal' | 'utility'
  | 'port' | 'kiosk' | 'palace' | 'construction' | 'depot' | 'garage' | 'community';

export interface Building {
  id: string;
  parcelId: string;
  blockId: string;
  districtId: string;
  archetype: string;
  use: BuildingUse;
  name: string;
  address: string;
  masses: BuildingMass[];
  /** approx total height above baseY */
  height: number;
  floors: number;
  entrance: { x: number; z: number; dir: Vec2 };
  landmark?: boolean;
  tags: string[];
}

export type LandmarkRole =
  | 'city-square' | 'civic-landmark' | 'market-complex' | 'bridge' | 'central-park' | 'stadium'
  | 'cultural-centre' | 'historic-building' | 'landmark-office' | 'shopping-complex'
  | 'transport-terminal' | 'gateway' | 'religious' | 'hospital' | 'government' | 'port'
  | 'utility' | 'park' | 'market' | 'hotel' | 'residence';

export interface Landmark {
  id: string;
  role: LandmarkRole;
  name: string;
  districtId: string;
  x: number;
  z: number;
  buildingIds: string[];
  description: string;
  /** suggested camera for the inspector / tours */
  view: { pos: [number, number, number]; target: [number, number, number] };
  /** graded terrace the site sits on (terrain is flattened to `y` inside the polygon); the parcel itself stays empty in city data */
  plateau?: { polygon: Vec2[]; y: number };
}

export type PropType =
  | 'lamp' | 'lamp-double' | 'tree-palm' | 'tree-broad' | 'tree-neem' | 'tree-small' | 'shrub'
  | 'bench' | 'bin' | 'bollard' | 'signal' | 'stopsign' | 'streetsign' | 'busstop' | 'busshelter'
  | 'pole' | 'kiosk' | 'stall' | 'car' | 'minibus' | 'pickup' | 'truck' | 'manhole' | 'planter'
  | 'billboard' | 'fountain' | 'monument' | 'sculpture' | 'playground' | 'goalpost' | 'crane'
  | 'container' | 'cone' | 'barrier' | 'hoarding' | 'flag' | 'umbrella' | 'tank' | 'pylon'
  | 'gate' | 'wall' | 'fence' | 'hedge' | 'railing' | 'drain' | 'floodlight' | 'quaycrane'
  | 'boat' | 'pier' | 'arch' | 'wire' | 'pump' | 'stairs' | 'parkingline' | 'directional'
  | 'hydrant' | 'cabinet' | 'speedbump' | 'zebra' | 'roadworks' | 'sandheap' | 'scaffold' | 'path'
  | 'lamp-tall' | 'washline' | 'pallets' | 'bush' | 'field';

export interface Prop {
  t: PropType;
  x: number;
  y: number;
  z: number;
  /** rotation around y, radians */
  r: number;
  /** uniform or [sx, sy, sz] scale */
  s?: number | [number, number, number];
  /** variant index (mesh / colour) */
  v?: number;
  /** colour override */
  c?: string;
  /** extra length / endpoints for linear props (walls, wires, fences) */
  e?: Vec2;
  /** free params */
  p?: number[];
  text?: string;
}

export interface WaterData {
  level: number;
  river: { points: Vec2[]; widths: number[] };
  /** shoreline is z = shoreline(x); water for z greater */
  lagoon: { a: number; b: number; c: number; d: number; e: number; base: number };
}

export interface TerrainParams {
  seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  cityBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  resolution: number;
  water: WaterData;
  plateaus: { x: number; z: number; r: number; h: number }[];
}

export interface CityStats {
  nodes: number; edges: number; roadLengthByClass: Record<string, number>;
  blocks: number; parcels: number; parcelsByUse: Record<string, number>;
  buildings: number; buildingsByDistrict: Record<string, number>; buildingsByUse: Record<string, number>; buildingsByArchetype: Record<string, number>;
  landmarks: number; props: number; propsByType: Record<string, number>;
  streets: number; bridges: number; intersections: number; roundabouts: number;
}

export interface CityData {
  meta: {
    name: string;
    country: string;
    seed: number;
    version: string;
    generatedAt: string;
    units: 'meters';
    terrain: TerrainParams;
    /** [minX, minZ, maxX, maxZ] of the generated world */
    bounds: [number, number, number, number];
  };
  water: WaterData;
  districts: District[];
  roads: { nodes: RoadNode[]; edges: RoadEdge[]; profiles: Record<RoadClass, RoadProfile> };
  blocks: Block[];
  parcels: Parcel[];
  buildings: Building[];
  landmarks: Landmark[];
  props: Prop[];
  streets: { id: string; name: string; cls: RoadClass; edgeIds: string[] }[];
  stats: CityStats;
}

export const ROAD_PROFILES: Record<RoadClass, RoadProfile> = {
  arterial:   { carriageway: 15.0, sidewalk: 3.2, median: 2.2, lanes: 4, lampSpacing: 30, drain: false, parking: false },
  waterfront: { carriageway: 11.0, sidewalk: 3.6, median: 0,   lanes: 2, lampSpacing: 30, drain: false, parking: true },
  secondary:  { carriageway: 10.0, sidewalk: 2.6, median: 0,   lanes: 2, lampSpacing: 34, drain: false, parking: true },
  local:      { carriageway: 7.0,  sidewalk: 1.9, median: 0,   lanes: 2, lampSpacing: 40, drain: true, parking: true },
  lane:       { carriageway: 4.4,  sidewalk: 1.1, median: 0,   lanes: 1, lampSpacing: 0,  drain: true, parking: false },
  service:    { carriageway: 9.0,  sidewalk: 1.6, median: 0,   lanes: 2, lampSpacing: 42, drain: false, parking: true },
  access:     { carriageway: 5.5,  sidewalk: 1.4, median: 0,   lanes: 2, lampSpacing: 0,  drain: false, parking: false },
};

/** total half width of the road right-of-way (centre to outer edge of sidewalk) */
export function corridorHalfWidth(cls: RoadClass): number {
  const p = ROAD_PROFILES[cls];
  return p.carriageway / 2 + p.median / 2 + p.sidewalk;
}

/** half width of the paved carriageway (centre to kerb) including half median */
export function carriagewayHalfWidth(cls: RoadClass): number {
  const p = ROAD_PROFILES[cls];
  return p.carriageway / 2 + p.median / 2;
}

export const CLASS_RANK: Record<RoadClass, number> = {
  arterial: 6, waterfront: 5, secondary: 4, service: 3, local: 2, access: 1, lane: 0,
};
