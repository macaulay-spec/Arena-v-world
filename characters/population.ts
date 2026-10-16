/**
 * The people of Vora City: roles with district affinity, wardrobe rules and behaviour clips,
 * expanded deterministically into named characters with stable ids.
 */
import { defaultBody, type BodyParams } from './body';
import type { CharacterSpec } from './assemble';
import type { GarmentId, Look, OutfitItem } from './garments';
import type { HairStyle, HeadwearStyle } from './hair';
import type { PropId } from './props';
import { PLAIN_COLOURS } from './fabrics';

export type District = 'central' | 'market' | 'north' | 'oldtown' | 'industrial' | 'green';
export const DISTRICT_NAMES: Record<District, string> = { central: 'Central District', market: 'Market Quarter', north: 'North Heights', oldtown: 'Old Town', industrial: 'Industrial', green: 'Green Estates' };

export interface Role {
  id: string; label: string; districts: District[]; weight: number;
  sex: ('f' | 'm')[]; age: [number, number];
  /** clips this role tends to play when standing (walk/run handled by the crowd layer) */
  idle: string[]; moving: 'walk' | 'walk_carry' | 'run';
  tags: string[];
  dress: (r: Rand, sex: 'f' | 'm', age: number) => { outfit: OutfitItem[]; hair: HairStyle; hairColour?: string; headwear?: HeadwearStyle; headwearLook?: Look; props?: PropId[] };
}

export class Rand { constructor(public s: number) {} next(): number { this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0; return this.s / 4294967296; } pick<T>(a: T[]): T { return a[Math.floor(this.next() * a.length) % a.length]; } range(a: number, b: number): number { return a + (b - a) * this.next(); } chance(p: number): boolean { return this.next() < p; } }

const ANKARA = ['ankara_0', 'ankara_1', 'ankara_2', 'ankara_3', 'ankara_4', 'ankara_5', 'ankara_6', 'ankara_7'];
const print = (r: Rand): Look => ({ fabric: r.pick(ANKARA), seed: Math.floor(r.next() * 7) });
const plain = (r: Rand, pool: string[], fabric = 'cotton'): Look => ({ fabric, colour: r.pick(pool), seed: Math.floor(r.next() * 7) });
const shoes = (r: Rand, kinds: GarmentId[], pool = PLAIN_COLOURS.shoe): OutfitItem => ({ id: r.pick(kinds), look: plain(r, pool, 'leather') });
const femaleHair = (r: Rand): HairStyle => r.pick(['braids', 'braids', 'twists', 'coils', 'afro', 'cornrows', 'bun', 'coils_fade']);
const maleHair = (r: Rand): HairStyle => r.pick(['low_cut', 'low_cut', 'coils_fade', 'coils', 'twists']);
const hairColour = (r: Rand) => r.pick(['#14100E', '#14100E', '#1A1210', '#2A1A12', '#3B1F1A']);

const casualF = (r: Rand): OutfitItem[] => r.chance(0.45) ? [{ id: 'dress', look: r.chance(0.7) ? print(r) : plain(r, PLAIN_COLOURS.skirt) }, shoes(r, ['sandals', 'slides', 'heels', 'sneakers'])]
  : [{ id: r.pick(['blouse', 'tshirt', 'polo']), look: r.chance(0.5) ? print(r) : plain(r, PLAIN_COLOURS.tee) }, r.chance(0.5) ? { id: 'jeans', look: plain(r, PLAIN_COLOURS.denim, 'denim') } : { id: r.pick(['skirt_knee', 'skirt_long', 'trousers']), look: plain(r, PLAIN_COLOURS.skirt) }, shoes(r, ['sandals', 'slides', 'sneakers', 'heels'])];
const casualM = (r: Rand): OutfitItem[] => [{ id: r.pick(['tshirt', 'polo', 'shirt_short', 'jersey']), look: r.chance(0.2) ? { fabric: 'jersey_green' } : plain(r, PLAIN_COLOURS.tee) }, r.chance(0.6) ? { id: 'jeans', look: plain(r, PLAIN_COLOURS.denim, 'denim') } : { id: r.pick(['trousers', 'shorts']), look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['sneakers', 'slides', 'shoes', 'sandals'])];
const tradF = (r: Rand, gele = true) => ({ outfit: [{ id: 'iro_buba' as GarmentId, look: print(r) }, shoes(r, ['slides', 'sandals'])], hair: femaleHair(r), headwear: (gele ? 'gele' : 'scarf') as HeadwearStyle, headwearLook: print(r) });
const tradM = (r: Rand, big = false) => { const look = r.chance(0.5) ? plain(r, PLAIN_COLOURS.agbada, 'polyester') : { fabric: r.pick(['aso_oke', 'adire', 'kente', 'ankara_7']) }; return { outfit: [{ id: (big ? 'agbada' : r.pick(['kaftan', 'senator'])) as GarmentId, look }, { id: 'sokoto' as GarmentId, look: look.fabric === 'polyester' ? look : plain(r, PLAIN_COLOURS.kaftan, 'polyester') }, shoes(r, ['shoes', 'slides', 'sandals'])], hair: maleHair(r), headwear: 'fila' as HeadwearStyle, headwearLook: look }; };

export const ROLES: Role[] = [
  // ---- Central District
  { id: 'office_worker', label: 'Office worker', districts: ['central', 'north'], weight: 3, sex: ['f', 'm'], age: [24, 50], idle: ['idle', 'phone', 'idle_talk'], moving: 'walk', tags: ['street', 'office'],
    dress: (r, sex) => sex === 'm' ? { outfit: [{ id: 'shirt_long', look: plain(r, PLAIN_COLOURS.shirt) }, { id: 'trousers', look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['shoes'])], hair: maleHair(r), props: r.chance(0.6) ? ['laptop_bag'] : ['phone'] }
      : { outfit: [{ id: 'blouse', look: plain(r, PLAIN_COLOURS.shirt) }, { id: r.pick(['skirt_knee', 'trousers']), look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['heels', 'shoes'])], hair: femaleHair(r), props: ['handbag'] } },
  { id: 'banker', label: 'Banker', districts: ['central'], weight: 1, sex: ['m', 'f'], age: [28, 55], idle: ['idle', 'phone'], moving: 'walk', tags: ['street', 'office'],
    dress: (r, sex) => ({ outfit: [{ id: 'shirt_long', look: plain(r, ['#FFFFFF', '#E8EEF5', '#9FC5E8']) }, { id: 'trousers', look: plain(r, ['#1F2933', '#0D1B2A', '#263238'], 'polyester') }, { id: 'jacket', look: plain(r, ['#1F2933', '#0D1B2A', '#263238'], 'polyester') }, shoes(r, ['shoes'])], hair: sex === 'm' ? 'low_cut' : 'bun', props: ['briefcase'] }) },
  { id: 'tech_worker', label: 'Tech worker', districts: ['central', 'north'], weight: 1, sex: ['m', 'f'], age: [22, 38], idle: ['phone', 'idle'], moving: 'walk', tags: ['street'],
    dress: (r, sex) => ({ outfit: [{ id: 'tshirt', look: plain(r, PLAIN_COLOURS.tee) }, { id: 'jeans', look: plain(r, PLAIN_COLOURS.denim, 'denim') }, shoes(r, ['sneakers'], ['#F5F5F5', '#1B1B1B'])], hair: sex === 'm' ? maleHair(r) : femaleHair(r), props: ['backpack'] }) },
  { id: 'security_guard', label: 'Security guard', districts: ['central', 'north', 'industrial'], weight: 2, sex: ['m'], age: [25, 55], idle: ['idle', 'idle_talk'], moving: 'walk', tags: ['uniform'],
    dress: r => ({ outfit: [{ id: 'uniform_shirt', look: plain(r, ['#1F2A44', '#0D1B2A']) }, { id: 'trousers', look: plain(r, ['#1F2A44', '#0D1B2A']) }, shoes(r, ['boots'], ['#1B1B1B'])], hair: 'low_cut', headwear: 'beret', headwearLook: plain(r, ['#0D1B2A']) }) },
  { id: 'traffic_officer', label: 'VTMA traffic officer', districts: ['central', 'market'], weight: 1, sex: ['m', 'f'], age: [25, 50], idle: ['wave', 'idle'], moving: 'walk', tags: ['uniform'],
    dress: (r, sex) => ({ outfit: [{ id: 'uniform_shirt', look: plain(r, ['#F2B705']) }, { id: 'trousers', look: plain(r, ['#7B1B2A']) }, { id: 'hivis', look: { fabric: 'hivis' } }, shoes(r, ['boots'], ['#1B1B1B'])], hair: sex === 'm' ? 'low_cut' : 'cornrows', headwear: 'cap', headwearLook: plain(r, ['#7B1B2A']) }) },
  { id: 'police', label: 'Police officer', districts: ['central', 'oldtown'], weight: 1, sex: ['m', 'f'], age: [25, 50], idle: ['idle', 'idle_talk'], moving: 'walk', tags: ['uniform'],
    dress: (r, sex) => ({ outfit: [{ id: 'uniform_shirt', look: plain(r, ['#111111']) }, { id: 'trousers', look: plain(r, ['#111111']) }, shoes(r, ['boots'], ['#1B1B1B'])], hair: sex === 'm' ? 'low_cut' : 'bun', headwear: 'beret', headwearLook: plain(r, ['#111111']) }) },
  // ---- Market Quarter
  { id: 'market_woman', label: 'Market woman', districts: ['market', 'oldtown'], weight: 4, sex: ['f'], age: [28, 62], idle: ['sell', 'idle_talk'], moving: 'walk_carry', tags: ['market'],
    dress: r => ({ ...tradF(r, r.chance(0.6)), props: [r.pick(['head_tray_tomatoes', 'head_tray_oranges', 'head_basket_yams', 'head_basin_sachets'])] }) },
  { id: 'hawker', label: 'Street hawker', districts: ['market', 'central'], weight: 3, sex: ['m', 'f'], age: [16, 40], idle: ['sell', 'idle'], moving: 'walk_carry', tags: ['market', 'street'],
    dress: (r, sex) => ({ outfit: sex === 'm' ? [{ id: 'tshirt', look: plain(r, PLAIN_COLOURS.tee) }, { id: r.pick(['shorts', 'jeans']), look: plain(r, PLAIN_COLOURS.denim, 'denim') }, shoes(r, ['slides'], PLAIN_COLOURS.slipper)] : [{ id: 'blouse', look: print(r) }, { id: 'wrapper', look: print(r) }, shoes(r, ['slides'], PLAIN_COLOURS.slipper)], hair: sex === 'm' ? 'low_cut' : 'cornrows', headwear: sex === 'f' ? 'scarf' : 'none', headwearLook: print(r), props: [r.pick(['head_basin_sachets', 'head_tray_bread', 'head_tray_oranges'])] }) },
  { id: 'trader', label: 'Trader', districts: ['market'], weight: 2, sex: ['m'], age: [30, 60], idle: ['idle_talk', 'sell', 'phone'], moving: 'walk', tags: ['market'],
    dress: r => r.chance(0.6) ? tradM(r) : { outfit: [{ id: 'shirt_short', look: plain(r, PLAIN_COLOURS.shirt, 'stripes') }, { id: 'trousers', look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['sandals', 'shoes'])], hair: maleHair(r), headwear: r.chance(0.5) ? 'fila' : 'none', headwearLook: plain(r, PLAIN_COLOURS.kaftan, 'polyester') } },
  { id: 'porter', label: 'Porter', districts: ['market', 'industrial'], weight: 2, sex: ['m'], age: [18, 40], idle: ['idle'], moving: 'walk_carry', tags: ['market'],
    dress: r => ({ outfit: [{ id: 'tank', look: plain(r, PLAIN_COLOURS.tee) }, { id: 'shorts', look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['slides'], PLAIN_COLOURS.slipper)], hair: 'low_cut', props: ['head_sack'] }) },
  { id: 'food_seller', label: 'Food seller', districts: ['market', 'oldtown', 'industrial'], weight: 2, sex: ['f'], age: [25, 60], idle: ['sell', 'sit'], moving: 'walk', tags: ['market'],
    dress: r => ({ outfit: [{ id: 'buba', look: print(r) }, { id: 'wrapper', look: print(r) }, shoes(r, ['slides'], PLAIN_COLOURS.slipper)], hair: 'cornrows', headwear: 'scarf', headwearLook: print(r), props: ['bowl'] }) },
  { id: 'okada_rider', label: 'Okada rider', districts: ['market', 'oldtown', 'industrial'], weight: 2, sex: ['m'], age: [20, 45], idle: ['sit', 'idle_talk'], moving: 'walk', tags: ['street', 'transport'],
    dress: r => ({ outfit: [{ id: r.pick(['tshirt', 'jersey', 'polo']), look: r.chance(0.4) ? { fabric: 'jersey_green' } : plain(r, PLAIN_COLOURS.tee) }, { id: 'jeans', look: plain(r, PLAIN_COLOURS.denim, 'denim') }, shoes(r, ['slides', 'sneakers'], PLAIN_COLOURS.slipper)], hair: 'low_cut', headwear: 'cap', headwearLook: plain(r, PLAIN_COLOURS.tee) }) },
  { id: 'bus_conductor', label: 'Danfo conductor', districts: ['market', 'central'], weight: 1, sex: ['m'], age: [18, 40], idle: ['wave', 'idle_talk'], moving: 'walk', tags: ['street', 'transport'],
    dress: r => ({ outfit: [{ id: 'polo', look: plain(r, PLAIN_COLOURS.tee) }, { id: 'jeans', look: plain(r, PLAIN_COLOURS.denim, 'denim') }, shoes(r, ['slides'], PLAIN_COLOURS.slipper)], hair: 'low_cut' }) },
  { id: 'shopper', label: 'Shopper', districts: ['market', 'central', 'green'], weight: 3, sex: ['f', 'm'], age: [18, 60], idle: ['idle', 'phone', 'idle_talk'], moving: 'walk', tags: ['street'],
    dress: (r, sex) => sex === 'f' ? { outfit: casualF(r), hair: femaleHair(r), hairColour: hairColour(r), props: [r.pick(['handbag', 'ghana_bag', 'cane_basket'])] } : { outfit: casualM(r), hair: maleHair(r), props: r.chance(0.5) ? ['ghana_bag'] : ['phone'] } },
  // ---- North Heights
  { id: 'elite_woman', label: 'Society lady', districts: ['north', 'central'], weight: 2, sex: ['f'], age: [28, 60], idle: ['idle', 'phone', 'idle_talk'], moving: 'walk', tags: ['street', 'traditional'],
    dress: r => { const look = r.chance(0.5) ? { fabric: r.pick(['aso_oke', 'lace', 'kente']), colour: r.pick(['#F2F2F2', '#5B2A86', '#F2B705', '#2E4A7D']) } : print(r); return { outfit: [{ id: r.pick(['gown', 'boubou', 'iro_buba']), look }, shoes(r, ['heels', 'sandals'])], hair: 'bun', headwear: 'gele', headwearLook: look.fabric === 'lace' ? { fabric: 'aso_oke' } : look, props: ['handbag'] }; } },
  { id: 'elite_man', label: 'Chief', districts: ['north', 'oldtown'], weight: 2, sex: ['m'], age: [35, 70], idle: ['idle_talk', 'idle', 'phone'], moving: 'walk', tags: ['street', 'traditional'],
    dress: r => ({ ...tradM(r, true), props: r.chance(0.4) ? ['walking_stick'] : [] }) },
  { id: 'jogger', label: 'Jogger', districts: ['north', 'green'], weight: 1, sex: ['m', 'f'], age: [20, 45], idle: ['idle'], moving: 'run', tags: ['street'],
    dress: (r, sex) => ({ outfit: [{ id: r.pick(['jersey', 'tank', 'tshirt']), look: r.chance(0.5) ? { fabric: 'jersey_green' } : plain(r, PLAIN_COLOURS.tee, 'polyester') }, { id: 'shorts', look: plain(r, PLAIN_COLOURS.trousers, 'polyester') }, shoes(r, ['sneakers'], ['#F5F5F5', '#1B1B1B', '#C62828'])], hair: sex === 'm' ? 'low_cut' : 'braids' }) },
  { id: 'schoolchild', label: 'School pupil', districts: ['green', 'oldtown', 'north'], weight: 3, sex: ['f', 'm'], age: [7, 12], idle: ['idle', 'idle_talk'], moving: 'walk', tags: ['child'],
    dress: (r, sex) => { const col = r.pick(['#9FC5E8', '#F8BBD0', '#C8E6C9', '#FFFFFF']); const bottom = r.pick(['#1F2933', '#7B1B2A', '#0D1B2A']); return { outfit: [{ id: 'school_shirt', look: plain(r, [col]) }, sex === 'f' ? { id: 'school_skirt', look: plain(r, [bottom]) } : { id: 'shorts', look: plain(r, [bottom]) }, shoes(r, ['sandals', 'shoes'], ['#3E2723', '#1B1B1B'])], hair: sex === 'f' ? r.pick(['cornrows', 'braids', 'coils']) : 'low_cut', props: ['school_bag'] }; } },
  { id: 'kid', label: 'Child', districts: ['oldtown', 'green', 'market'], weight: 2, sex: ['f', 'm'], age: [5, 11], idle: ['idle', 'wave'], moving: 'run', tags: ['child'],
    dress: (r, sex) => ({ outfit: [{ id: 'tshirt', look: plain(r, PLAIN_COLOURS.tee) }, { id: 'shorts', look: plain(r, PLAIN_COLOURS.denim, 'denim') }, ...(r.chance(0.5) ? [shoes(r, ['slides'], PLAIN_COLOURS.slipper)] : [])], hair: sex === 'f' ? 'coils' : 'low_cut' }) },
  // ---- Old Town
  { id: 'elder_man', label: 'Elder', districts: ['oldtown', 'green'], weight: 2, sex: ['m'], age: [65, 82], idle: ['sit', 'idle_talk'], moving: 'walk', tags: ['elder', 'traditional'],
    dress: r => ({ ...tradM(r, r.chance(0.3)), hair: 'grey_short', hairColour: '#B9B2A8', props: ['walking_stick'] }) },
  { id: 'elder_woman', label: 'Mama', districts: ['oldtown', 'market'], weight: 2, sex: ['f'], age: [62, 80], idle: ['sit', 'idle_talk'], moving: 'walk', tags: ['elder', 'traditional'],
    dress: r => ({ ...tradF(r, false), hair: 'grey_short', hairColour: '#B9B2A8' }) },
  { id: 'imam', label: 'Imam', districts: ['oldtown'], weight: 1, sex: ['m'], age: [40, 70], idle: ['idle_talk', 'idle'], moving: 'walk', tags: ['traditional'],
    dress: r => ({ outfit: [{ id: 'kaftan', look: plain(r, ['#F2F2F2', '#E6D5A8'], 'polyester') }, { id: 'sokoto', look: plain(r, ['#F2F2F2', '#E6D5A8'], 'polyester') }, shoes(r, ['sandals'])], hair: 'low_cut', headwear: 'fila', headwearLook: plain(r, ['#F2F2F2']) }) },
  { id: 'artisan', label: 'Artisan', districts: ['oldtown', 'industrial'], weight: 2, sex: ['m'], age: [20, 55], idle: ['idle_talk', 'sit'], moving: 'walk', tags: ['street', 'work'],
    dress: r => ({ outfit: [{ id: 'shirt_short', look: plain(r, PLAIN_COLOURS.shirt, 'checks') }, { id: 'trousers', look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['slides', 'shoes'], PLAIN_COLOURS.slipper)], hair: maleHair(r), props: ['tool_bag'] }) },
  { id: 'mother', label: 'Mother with baby', districts: ['oldtown', 'green', 'market'], weight: 2, sex: ['f'], age: [20, 38], idle: ['idle', 'idle_talk'], moving: 'walk', tags: ['street'],
    dress: r => ({ outfit: [{ id: 'buba', look: print(r) }, { id: 'wrapper', look: print(r) }, shoes(r, ['slides'], PLAIN_COLOURS.slipper)], hair: 'cornrows', headwear: 'scarf', headwearLook: print(r), props: ['baby_wrap'] }) },
  { id: 'student', label: 'Student', districts: ['central', 'green', 'oldtown'], weight: 2, sex: ['f', 'm'], age: [17, 25], idle: ['phone', 'idle_talk'], moving: 'walk', tags: ['street'],
    dress: (r, sex) => ({ outfit: sex === 'm' ? casualM(r) : casualF(r), hair: sex === 'm' ? maleHair(r) : femaleHair(r), hairColour: hairColour(r), props: ['backpack'] }) },
  // ---- Industrial
  { id: 'factory_worker', label: 'Factory worker', districts: ['industrial'], weight: 3, sex: ['m', 'f'], age: [20, 55], idle: ['idle', 'idle_talk'], moving: 'walk', tags: ['uniform', 'work'],
    dress: (r, sex) => ({ outfit: [{ id: 'shirt_short', look: plain(r, ['#2E4A7D', '#1F2933', '#5D4037']) }, { id: 'trousers', look: plain(r, ['#2E4A7D', '#1F2933']) }, { id: 'hivis', look: { fabric: 'hivis' } }, shoes(r, ['boots'], ['#3E2723', '#1B1B1B'])], hair: sex === 'm' ? 'low_cut' : 'cornrows', headwear: 'hardhat', headwearLook: plain(r, ['#F2B705', '#F5F5F5', '#2E86AB'], 'plastic') }) },
  { id: 'construction_worker', label: 'Construction worker', districts: ['industrial', 'central', 'north'], weight: 2, sex: ['m'], age: [20, 50], idle: ['idle', 'idle_talk'], moving: 'walk_carry', tags: ['uniform', 'work'],
    dress: r => ({ outfit: [{ id: 'tshirt', look: plain(r, PLAIN_COLOURS.tee) }, { id: 'jeans', look: plain(r, PLAIN_COLOURS.denim, 'denim') }, { id: 'hivis', look: { fabric: 'hivis' } }, shoes(r, ['boots'], ['#3E2723'])], hair: 'low_cut', headwear: 'hardhat', headwearLook: plain(r, ['#F2B705'], 'plastic'), props: ['head_sack'] }) },
  { id: 'truck_driver', label: 'Truck driver', districts: ['industrial'], weight: 1, sex: ['m'], age: [28, 58], idle: ['sit', 'idle_talk', 'phone'], moving: 'walk', tags: ['transport'],
    dress: r => ({ outfit: [{ id: 'shirt_short', look: plain(r, PLAIN_COLOURS.shirt, 'stripes') }, { id: 'trousers', look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['slides', 'shoes'])], hair: 'low_cut', headwear: 'cap', headwearLook: plain(r, ['#1B1B1B', '#2E4A7D']) }) },
  { id: 'mechanic', label: 'Mechanic', districts: ['industrial', 'oldtown'], weight: 2, sex: ['m'], age: [18, 50], idle: ['idle_talk', 'sit'], moving: 'walk', tags: ['work'],
    dress: r => ({ outfit: [{ id: 'shirt_long', look: plain(r, ['#2E4A7D', '#4E342E', '#37474F']) }, { id: 'trousers', look: plain(r, ['#2E4A7D', '#37474F']) }, shoes(r, ['boots', 'slides'], ['#1B1B1B'])], hair: 'low_cut', props: ['jerrycan'] }) },
  { id: 'fisherman', label: 'Fisherman', districts: ['industrial'], weight: 1, sex: ['m'], age: [20, 60], idle: ['sit', 'idle'], moving: 'walk', tags: ['work', 'harbour'],
    dress: r => ({ outfit: [{ id: 'tank', look: plain(r, PLAIN_COLOURS.tee) }, { id: 'shorts', look: plain(r, PLAIN_COLOURS.trousers) }], hair: 'low_cut', headwear: 'cap', headwearLook: plain(r, ['#F2B705', '#1B1B1B']), props: ['bucket'] }) },
  // ---- Green Estates
  { id: 'resident', label: 'Resident', districts: ['green', 'north', 'oldtown'], weight: 3, sex: ['f', 'm'], age: [20, 65], idle: ['idle', 'phone', 'idle_talk'], moving: 'walk', tags: ['street'],
    dress: (r, sex) => sex === 'f' && r.chance(0.4) ? { outfit: [{ id: 'abaya', look: plain(r, PLAIN_COLOURS.abaya, 'polyester') }, shoes(r, ['sandals', 'slides'])], hair: 'none', headwear: 'hijab', headwearLook: plain(r, PLAIN_COLOURS.hijab, 'polyester'), props: r.chance(0.5) ? ['handbag'] : [] }
      : sex === 'f' ? { outfit: casualF(r), hair: femaleHair(r), hairColour: hairColour(r) } : { outfit: [{ id: r.pick(['polo', 'shirt_short', 'tshirt']), look: plain(r, PLAIN_COLOURS.shirt) }, { id: 'trousers', look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['slides', 'shoes'], PLAIN_COLOURS.slipper)], hair: maleHair(r), props: r.chance(0.3) ? ['newspaper'] : [] } },
  { id: 'nurse', label: 'Nurse', districts: ['green', 'central'], weight: 1, sex: ['f', 'm'], age: [24, 50], idle: ['idle', 'idle_talk'], moving: 'walk', tags: ['uniform'],
    dress: (r, sex) => ({ outfit: [{ id: 'uniform_shirt', look: plain(r, ['#FFFFFF', '#9FC5E8']) }, { id: sex === 'f' ? 'skirt_knee' : 'trousers', look: plain(r, ['#FFFFFF', '#2E4A7D']) }, shoes(r, ['shoes'], ['#F5F5F5'])], hair: sex === 'f' ? 'bun' : 'low_cut' }) },
  { id: 'teacher', label: 'Teacher', districts: ['green', 'oldtown'], weight: 1, sex: ['f', 'm'], age: [26, 58], idle: ['idle_talk', 'idle'], moving: 'walk', tags: ['street'],
    dress: (r, sex) => sex === 'f' ? { outfit: [{ id: 'blouse', look: print(r) }, { id: 'skirt_long', look: plain(r, PLAIN_COLOURS.skirt) }, shoes(r, ['shoes', 'sandals'])], hair: 'braids', props: ['handbag'] } : { outfit: [{ id: 'shirt_long', look: plain(r, PLAIN_COLOURS.shirt) }, { id: 'trousers', look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['shoes'])], hair: 'coils', props: ['briefcase'] } },
  // ---- household staff (JAG House and, later, other estates)
  { id: 'housekeeper', label: 'Housekeeper', districts: ['north'], weight: 1, sex: ['f'], age: [32, 52], idle: ['idle', 'idle_talk'], moving: 'walk_carry', tags: ['home', 'work'],
    dress: r => ({ outfit: [{ id: 'buba', look: plain(r, ['#F5EFE6', '#E8D9C4']) }, { id: 'skirt_long', look: plain(r, ['#2F3E4E', '#3E2F2F']) }, shoes(r, ['slides'], ['#2B2B2B'])], hair: 'cornrows', headwear: 'scarf', headwearLook: plain(r, ['#2F3E4E']) }) },
  { id: 'driver', label: 'Driver', districts: ['north', 'central'], weight: 1, sex: ['m'], age: [30, 55], idle: ['idle', 'phone', 'idle_talk'], moving: 'walk', tags: ['home', 'work'],
    dress: r => ({ outfit: [{ id: 'shirt_short', look: plain(r, ['#FFFFFF', '#E3ECF5']) }, { id: 'trousers', look: plain(r, ['#111827', '#1F2933'], 'polyester') }, shoes(r, ['shoes'], ['#1B1B1B'])], hair: 'low_cut', headwear: r.chance(0.5) ? 'cap' : 'none', headwearLook: plain(r, ['#111827']) }) },
  { id: 'gateman', label: 'Gateman', districts: ['north'], weight: 1, sex: ['m'], age: [38, 62], idle: ['idle', 'idle_talk', 'sit'], moving: 'walk', tags: ['home', 'uniform'],
    dress: r => ({ outfit: [{ id: 'kaftan', look: plain(r, ['#4B5563', '#374151'], 'polyester') }, { id: 'sokoto', look: plain(r, ['#4B5563', '#374151'], 'polyester') }, shoes(r, ['sandals'], ['#3E2723'])], hair: 'low_cut', headwear: 'fila', headwearLook: plain(r, ['#374151']) }) },
  { id: 'gardener', label: 'Gardener', districts: ['green', 'north'], weight: 1, sex: ['m'], age: [20, 60], idle: ['idle'], moving: 'walk', tags: ['work'],
    dress: r => ({ outfit: [{ id: 'tshirt', look: plain(r, PLAIN_COLOURS.tee) }, { id: 'trousers', look: plain(r, PLAIN_COLOURS.trousers) }, shoes(r, ['boots', 'slides'], ['#3E2723'])], hair: 'low_cut', headwear: 'cap', headwearLook: plain(r, ['#2E7D32', '#1B1B1B']), props: ['bucket'] }) },
];

// ---- names (West-African-inspired pools for the fictional country V) ----------------------------
const FIRST_F = ['Adaeze', 'Folake', 'Amina', 'Ngozi', 'Ifeoma', 'Zainab', 'Kemi', 'Halima', 'Chiamaka', 'Bisi', 'Aisha', 'Yetunde', 'Nneka', 'Fatima', 'Titilayo', 'Oluwaseun', 'Hauwa', 'Ebele', 'Morenike', 'Ronke', 'Chidinma', 'Sade', 'Uche', 'Abeni', 'Temitope', 'Maryam', 'Funmilayo', 'Ijeoma', 'Jumoke', 'Safiya'];
const FIRST_M = ['Tunde', 'Chidi', 'Yusuf', 'Emeka', 'Seyi', 'Bashir', 'Dayo', 'Obi', 'Ibrahim', 'Kunle', 'Nnamdi', 'Musa', 'Femi', 'Ikenna', 'Sani', 'Wale', 'Chukwuma', 'Abdul', 'Segun', 'Tobenna', 'Lekan', 'Garba', 'Ayo', 'Kelechi', 'Umar', 'Bayo', 'Ekene', 'Idris', 'Rotimi', 'Osaze'];
const LAST = ['Adebayo', 'Nwosu', 'Bello', 'Okafor', 'Lawal', 'Eze', 'Afolabi', 'Danjuma', 'Okonkwo', 'Balogun', 'Mohammed', 'Okoro', 'Adeyemi', 'Umaru', 'Obi', 'Olawale', 'Igwe', 'Sule', 'Oyelaran', 'Nnaji', 'Abubakar', 'Ogunleye', 'Chukwu', 'Yakubu', 'Bankole', 'Madu', 'Suleiman', 'Fashola', 'Anyanwu', 'Garuba'];

const TONES = ['#2E1A12', '#3C2319', '#4A2C1E', '#5A3A28', '#6B4530', '#784B32', '#8A5A3C', '#5E3B2A'];

function bodyFor(r: Rand, sex: 'f' | 'm', age: number, role: Role): BodyParams {
  const b = defaultBody(); b.gender = sex === 'm' ? 1 : 0; b.ageYears = age;
  b.african = 0.92 + r.next() * 0.08; b.asian = 0; b.caucasian = 1 - b.african;
  // MakeHuman's height slider spans ~1.55–2.17 m; keep adults in a realistic bell (men ≈1.60–1.90, women ≈1.50–1.78)
  const bell = (r.next() + r.next()) * 0.5;
  b.height = sex === 'm' ? 0.27 + bell * 0.28 : 0.26 + bell * 0.26; b.weight = 0.35 + r.next() * 0.4 + (age > 45 ? 0.08 : 0); b.muscle = 0.45 + r.next() * 0.3 + (role.tags.includes('work') ? 0.1 : 0);
  b.proportions = 0.55 + r.next() * 0.35; // lean towards "ideal" proportions
  if (sex === 'f') { b.cup = 0.4 + r.next() * 0.3; b.firmness = 0.5 + r.next() * 0.3; }
  if (role.id === 'jogger') { b.weight = 0.35 + r.next() * 0.15; b.muscle = 0.7; }
  if (role.id === 'porter') { b.muscle = 0.85; b.weight = 0.45; }
  return b;
}
function skinFor(sex: 'f' | 'm', age: number, r: Rand): string {
  if (age <= 12) return 'skin_child';
  if (sex === 'f') return age >= 60 ? 'skin_f_old' : 'skin_f_young';
  if (age >= 60) return 'skin_m_old';
  return r.pick(['skin_m_young', 'skin_m_stubble', 'skin_m_beard', 'skin_m_goatee', 'skin_m_young']);
}

export interface PopulationEntry extends CharacterSpec { roleId: string; roleLabel: string; districts: District[]; idle: string[]; moving: string }

/** Expand roles into a deterministic population (stable ids `chr_<role>_<n>`). */
export function population(seed = 20260419, perWeight = 1): PopulationEntry[] {
  const out: PopulationEntry[] = []; const usedNames = new Set<string>();
  for (const role of ROLES) {
    const count = Math.max(1, Math.round(role.weight * perWeight));
    for (let n = 0; n < count; n++) {
      const r = new Rand((seed ^ (hash(role.id) * 2654435761)) + n * 97 + 1);
      const sex = role.sex[n % role.sex.length]; const age = Math.round(r.range(role.age[0], role.age[1]));
      let name = ''; do { name = `${r.pick(sex === 'f' ? FIRST_F : FIRST_M)} ${r.pick(LAST)}`; } while (usedNames.has(name)); usedNames.add(name);
      const d = role.dress(r, sex, age);
      const tone = r.pick(TONES);
      out.push({
        id: `chr_${role.id}_${n + 1}`, name, role: role.label, roleId: role.id, roleLabel: role.label, districts: role.districts, district: role.districts[0], tags: [...role.tags, sex === 'f' ? 'female' : 'male'],
        sex, age, body: bodyFor(r, sex, age, role), skin: skinFor(sex, age, r), tone, eyes: r.chance(0.8) ? 'dark' : 'brown',
        outfit: d.outfit, hair: d.hair, hairColour: d.hairColour, headwear: d.headwear, headwearLook: d.headwearLook, seed: n + hash(role.id) % 97,
        props: d.props ?? [], idle: role.idle, moving: role.moving,
      } as PopulationEntry);
    }
  }
  return out;
}
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
