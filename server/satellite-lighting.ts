import type { HomeAssistant } from './home-assistant.js';
import type { SatelliteStore } from './satellites-store.js';
import type { SessionController } from './controller.js';
import type { ToolResult } from '../shared/addons.js';
import { compile } from '../shared/validation.js';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['room', 'scope', 'action'],
  properties: {
    room: { type: ['string', 'null'], minLength: 1, maxLength: 128 },
    scope: { enum: ['default', 'all'] },
    action: { enum: ['turn_on', 'turn_off'] },
  },
};
const validate = compile<{
  room: string | null;
  scope: 'default' | 'all';
  action: 'turn_on' | 'turn_off';
}>(schema);
const failure = (message: string): ToolResult => ({
  schemaVersion: 1,
  status: 'failed',
  summary: message,
  result: null,
  snapshotId: null,
  actionRunId: null,
  error: { code: 'room_lighting', message, retryable: false },
});

/** Server resolves rooms and entities: the model can never supply an arbitrary group. */
export class SatelliteLightingBridge {
  constructor(
    private store: SatelliteStore,
    private home: Pick<HomeAssistant, 'tools' | 'lightingCatalog' | 'run'>,
    private controller: SessionController,
  ) {}
  tools(profileId: string | null) {
    const source = this.controller.sessionState().satellite;
    if (!source || !this.home.tools(profileId !== null).length) return [];
    return [
      {
        name: 'home_assistant__room_lights',
        description:
          'Allumer ou éteindre les lampes de la pièce du satellite. OBLIGATOIRE pour une demande d’allumage ou d’extinction si la personne dit « la lumière », « les lampes », « ici » ou « toutes les lumières » sans identifier un appareil précis : ne pas choisir arbitrairement une entité avec home_assistant__control. room=null utilise la pièce de cette conversation (' +
          JSON.stringify(source.name) +
          '). scope=default pour une demande générique ; scope=all uniquement si toutes les lampes sont demandées explicitement. Une pièce explicitement nommée est prioritaire : mettre son nom exact ou son identifiant dans room, jamais null. Une pièce HA sans satellite est aussi acceptée pour scope=all. Sans configuration, demander de préciser une lampe. Les groupes sont résolus et autorisés côté serveur. Données des pièces : ' +
          JSON.stringify(
            this.store.list().map((s) => ({ id: s.id, name: s.name, configured: !!s.lighting })),
          ),
        parameters: schema,
      },
    ];
  }
  async run(args: unknown, signal: AbortSignal): Promise<ToolResult> {
    if (!validate(args)) return failure('Commande d’éclairage invalide.');
    const session = this.controller.sessionState();
    const scope = this.controller.scope();
    if (!session.satellite || session.phase !== 'ready')
      return failure('Conversation satellite indisponible.');
    if (
      !this.home
        .tools(this.controller.snapshot().state.activeProfile !== null)
        .some((t) => t.name === 'home_assistant__control')
    )
      return failure('Commande Home Assistant non autorisée pour cette conversation.');
    const current = () => {
      const now = this.controller.scope();
      return (
        !signal.aborted &&
        this.controller.sessionState().phase === 'ready' &&
        this.controller.sessionState().satellite?.id === session.satellite!.id &&
        now.interactionId === scope.interactionId &&
        now.profileEpoch === scope.profileEpoch &&
        now.contextVersion === scope.contextVersion
      );
    };
    const catalog = await this.home.lightingCatalog();
    if (!current()) return failure('Conversation modifiée : commande annulée.');
    const normalize = (value: string) =>
      value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    const satellites = this.store.list();
    const matching =
      args.room === null
        ? satellites.filter((s) => s.id === session.satellite!.id)
        : satellites.filter(
            (s) => s.id === args.room || normalize(s.name) === normalize(args.room!),
          );
    if (matching.length > 1) return failure('Plusieurs pièces portent ce nom : précisez la pièce.');
    let target:
      { name: string; lighting?: import('../shared/satellites.js').SatelliteLighting } | undefined =
      matching[0];
    if (!target?.lighting && args.room !== null) {
      const areas = catalog.areas.filter(
        (a) => a.id === args.room || normalize(a.name) === normalize(args.room!),
      );
      if (areas.length === 1 && args.scope === 'all')
        target = {
          name: areas[0]!.name,
          lighting: { areaId: areas[0]!.id, defaultEntityIds: [], allEntityIds: [] },
        };
    }
    if (!target?.lighting)
      return failure(
        'Éclairage non configuré ou pièce ambiguë : configurez le satellite ou précisez une lampe.',
      );
    const config = target.lighting;
    if (
      args.scope === 'all' &&
      config.areaId &&
      (!catalog.areasAvailable || !catalog.areas.some((a) => a.id === config.areaId))
    )
      return failure(
        'La liste des lampes de la pièce Home Assistant est indisponible. Aucune commande envoyée.',
      );
    const ids = [
      ...new Set(
        args.scope === 'default'
          ? config.defaultEntityIds
          : [
              ...config.defaultEntityIds,
              ...config.allEntityIds,
              ...catalog.lights
                .filter(
                  (e) =>
                    e.domain === 'light' &&
                    e.areaId === config.areaId &&
                    config.areaId !== null &&
                    e.authorized,
                )
                .map((e) => e.id),
            ],
      ),
    ];
    if (!ids.length)
      return failure(
        'Aucune lampe configurée pour cette demande. Précisez une lampe ou configurez ce satellite.',
      );
    const allowed = new Set(catalog.lights.filter((e) => e.authorized).map((e) => e.id));
    if (ids.length > 100 || ids.some((id) => !allowed.has(id)))
      return failure(
        'Une lampe configurée n’est plus autorisée. Actualisez les réglages du satellite ; aucune commande envoyée.',
      );
    const results: { entityId: string; status: string; confirmed: boolean }[] = [];
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
    for (let start = 0; start < ids.length; start += 4) {
      if (!current() || bounded.aborted) break;
      const batch = await Promise.all(
        ids.slice(start, start + 4).map(async (entityId) => {
          if (!current()) return { entityId, status: 'cancelled', confirmed: false };
          try {
            const recognized = this.controller.snapshot().state.activeProfile !== null;
            const result = await this.home.run(
              { entityId, action: args.action, brightnessPct: null },
              bounded,
              'home_assistant__control',
              recognized,
            );
            return {
              entityId,
              status: result.status,
              confirmed: result.result?.confirmed === true,
            };
          } catch {
            return { entityId, status: 'failed', confirmed: false };
          }
        }),
      );
      results.push(...batch);
    }
    const confirmed =
      current() && results.length === ids.length && results.every((r) => r.confirmed);
    const summary = confirmed
      ? `${ids.length} lampe(s) ${args.action === 'turn_on' ? 'allumée(s)' : 'éteinte(s)'} : ${target.name}.`
      : `Commande partielle ou non confirmée : ${results.filter((r) => r.confirmed).length}/${ids.length} lampe(s), ${target.name}. Ne pas annoncer que tout a réussi et ne pas réessayer automatiquement.`;
    return {
      schemaVersion: 1,
      status: confirmed ? 'succeeded' : 'unknown',
      summary,
      result: { room: target.name, requested: ids.length, confirmed, entities: results },
      snapshotId: null,
      actionRunId: null,
      error: null,
    };
  }
}
