/** Appareils que Luna peut allumer ou éteindre. */
export const HOME_ASSISTANT_CONTROL_DOMAINS = ['light', 'switch'] as const;
/** Entités lisibles ; les volets/stores disposent aussi de commandes dédiées. */
export const HOME_ASSISTANT_SENSOR_DOMAINS = [
  'sensor',
  'binary_sensor',
  'timer',
  'input_datetime',
  'input_number',
  'input_boolean',
  'input_select',
  'counter',
  'climate',
  'cover',
  'lock',
] as const;
export type HomeAssistantDomain =
  (typeof HOME_ASSISTANT_CONTROL_DOMAINS)[number] | (typeof HOME_ASSISTANT_SENSOR_DOMAINS)[number];
export const HOME_ASSISTANT_ENTITY_PATTERN =
  '^(' +
  [...HOME_ASSISTANT_CONTROL_DOMAINS, ...HOME_ASSISTANT_SENSOR_DOMAINS].join('|') +
  ')\\.[a-z0-9_]+$';

export interface HomeAssistantEntity {
  id: string;
  name: string;
  aliases: string[];
  domain: HomeAssistantDomain;
  state: string;
  brightness: boolean;
  brightnessPct: number | null;
  observedAt: string | null;
  /** Capteurs : unité et classe Home Assistant (absentes des anciens catalogues). */
  unit?: string | null;
  deviceClass?: string | null;
  /** Attributs utiles seulement : fin de minuterie, température, position… */
  attributes?: Record<string, string | number | boolean | null>;
}

export function isControllable(entity: Pick<HomeAssistantEntity, 'domain'>): boolean {
  return entity.domain === 'light' || entity.domain === 'switch';
}

export interface HomeAssistantView {
  url: string;
  hasToken: boolean;
  enabled: boolean;
  connected: boolean;
  error: string | null;
  entities: HomeAssistantEntity[];
  selected: string[];
  revision: number;
  /** Luna ne commande ni ne lit la maison sans personne reconnue devant le miroir. */
  knownPeopleOnly: boolean;
}

export interface HomeAssistantCommand {
  entityId: string;
  action: 'read' | 'turn_on' | 'turn_off';
  brightnessPct: number | null;
}

export interface LightingCatalog {
  areasAvailable: boolean;
  areas: { id: string; name: string }[];
  entities?: (HomeAssistantEntity & { areaId: string | null; authorized: boolean })[];
  lights: {
    id: string;
    name: string;
    domain: string;
    areaId: string | null;
    authorized: boolean;
  }[];
}

/** Volets et stores seulement : exclut portes, garages, portails et fenêtres. */
export function isRoomCover(entity: Pick<HomeAssistantEntity, 'domain' | 'deviceClass'>): boolean {
  return (
    entity.domain === 'cover' &&
    ['shutter', 'blind', 'shade', 'curtain'].includes(entity.deviceClass ?? '')
  );
}
