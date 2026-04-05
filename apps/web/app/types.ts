export interface ChartRequest {
  date_of_birth: string;
  time_of_birth?: string;
  birthplace: string;
  birth_time_quality: "exact" | "approximate" | "unknown";
}

export interface ChartResponse {
  chart: CanonicalChart;
  latitude: number;
  longitude: number;
  timezone: string;
  display_name: string;
}

export interface CanonicalChart {
  birth_profile_id: string;
  computed_at: string;
  ayanamsa: number;
  tropical_planets: PlanetPosition[];
  sidereal_planets: PlanetPosition[];
  houses_placidus: HouseCusp[];
  houses_whole_sign: HouseCusp[];
  ascendant_tropical: number;
  ascendant_sidereal: number;
  midheaven_tropical: number;
  midheaven_sidereal: number;
  aspects: Aspect[];
  vimshottari_dasha: DashaInfo | null;
  birth_time_quality: string;
  confidence_metadata: Record<string, string>;
}

export interface PlanetPosition {
  name: string;
  longitude: number;
  latitude: number;
  speed: number;
  sign: string;
  sign_degree: number;
  retrograde: boolean;
  nakshatra?: string;
  nakshatra_pada?: number;
  house?: number;
}

export interface HouseCusp {
  house_number: number;
  sign: string;
  degree: number;
  lord?: string;
}

export interface Aspect {
  planet1: string;
  planet2: string;
  aspect_type: string;
  orb: number;
  applying: boolean;
}

export interface DashaInfo {
  maha_lord: string;
  maha_start: string;
  maha_end: string;
  antar_lord?: string;
  antar_start?: string;
  antar_end?: string;
}

export interface AskRequest {
  query: string;
  method: "vedic" | "kp" | "western" | "compare" | "auto";
  tone: "practical" | "emotional" | "spiritual" | "concise";
  chart_data?: Record<string, unknown>;
  date_of_birth?: string;
  time_of_birth?: string;
  birthplace?: string;
  birth_time_quality?: string;
}

export interface ReadingResponse {
  direct_answer: string;
  why_this_answer: string;
  key_factors: string[];
  method_view: string;
  confidence_note: string;
  what_to_watch: string;
  explore_further: string[];
  raw_text: string;
}

export interface AskResponse {
  query: string;
  classification: QueryClassification;
  method_used: string;
  reading: ReadingResponse;
  evidence_summary: {
    relevant_planets: string[];
    relevant_houses: number[];
    confidence: number;
    method: string;
  };
}

export interface QueryClassification {
  domain: string;
  time_orientation: string;
  intent: string;
  birth_time_sensitivity: string;
  depth_mode: string;
  best_fit_engine: string;
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface UserProfile {
  date_of_birth: string;
  time_of_birth?: string;
  birthplace: string;
  birth_time_quality: "exact" | "approximate" | "unknown";
  tone: "practical" | "emotional" | "spiritual" | "concise";
  language?: string;
}

export interface PlanetPlacement {
  name: string;
  symbol: string;
  sign: string;
  house: number | null;
  dignity: string;
}

export interface YogaInfo {
  name: string;
  planets: string[];
  strength: "strong" | "moderate" | "weak";
  description: string;
}

export interface HouseInfo {
  number: number;
  sign: string;
  lord: string;
  planets_in: string[];
  significance: string;
}

export interface DashaContext {
  maha_lord: string;
  antar_lord?: string;
  maha_lord_house?: number;
  antar_lord_house?: number;
  interpretation: string;
}

export interface PlanetContext {
  planets: PlanetPlacement[];
  yogas: YogaInfo[];
  houses: HouseInfo[];
  dasha: DashaContext | null;
  method: string;
  domain: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reading?: ReadingResponse;
  classification?: QueryClassification;
  evidence_summary?: Record<string, unknown>;
  planet_context?: PlanetContext;
  method_used?: string;
  timestamp: number;
}
