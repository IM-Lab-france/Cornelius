import { matchesRoomKind } from './satellite-room.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { compile } from '../shared/validation.js';
import type { ProfileRepository } from './storage.js';
import { SATELLITE_LED_COLOR_PATTERN } from '../shared/satellites.js';
import {
  SATELLITE_NAME_MAX,
  type Satellite,
  type SatelliteChanges,
  type SatelliteStore,
} from './satellites-store.js';
import type { SatelliteHub } from './satellites.js';
import type { SatellitePairing } from './satellites-pairing.js';
import type { LightingCatalog } from '../shared/home-assistant.js';

const name = { type: 'string', minLength: 1, maxLength: SATELLITE_NAME_MAX, pattern: '\\S' };
const createSchema = compile<{ name: string }>({
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: { name },
});
const updateSchema = compile<SatelliteChanges>({
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name,
    profileId: { type: ['string', 'null'], minLength: 1, maxLength: 128 },
    volume: { type: 'integer', minimum: 0, maximum: 100 },
    ledColor: { type: 'string', pattern: SATELLITE_LED_COLOR_PATTERN },
    ledBrightness: { type: 'integer', minimum: 0, maximum: 10 },
    nightLight: { type: 'boolean' },
    attentive: { type: 'boolean' },
    room: {
      type: 'object',
      additionalProperties: false,
      required: [
        'areaId',
        'description',
        'temperatureEntityId',
        'humidityEntityId',
        'coverEntityId',
      ],
      properties: {
        areaId: { type: ['string', 'null'], minLength: 1, maxLength: 255 },
        description: { type: 'string', maxLength: 500 },
        temperatureEntityId: {
          type: ['string', 'null'],
          pattern: '^sensor\\.[a-z0-9_]+$',
          maxLength: 255,
        },
        humidityEntityId: {
          type: ['string', 'null'],
          pattern: '^sensor\\.[a-z0-9_]+$',
          maxLength: 255,
        },
        coverEntityId: {
          type: ['string', 'null'],
          pattern: '^cover\\.[a-z0-9_]+$',
          maxLength: 255,
        },
      },
    },
    lighting: {
      type: 'object',
      additionalProperties: false,
      required: ['areaId', 'defaultEntityIds', 'allEntityIds'],
      properties: {
        areaId: { type: ['string', 'null'], minLength: 1, maxLength: 255 },
        defaultEntityIds: {
          type: 'array',
          maxItems: 50,
          uniqueItems: true,
          items: { type: 'string', pattern: '^(light|switch)\\.[a-z0-9_]+$', maxLength: 255 },
        },
        allEntityIds: {
          type: 'array',
          maxItems: 100,
          uniqueItems: true,
          items: { type: 'string', pattern: '^(light|switch)\\.[a-z0-9_]+$', maxLength: 255 },
        },
      },
    },
  },
});

/** Jeton présenté par un satellite : `Authorization: Bearer <jeton>`. */
function bearer(request: FastifyRequest): string {
  const header = String(request.headers.authorization ?? '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export function registerSatellites(
  app: FastifyInstance,
  services: {
    store: SatelliteStore;
    hub: SatelliteHub;
    pairing: SatellitePairing;
    profiles: ProfileRepository;
    checkCamera?(id: string): Promise<unknown>;
    lightingCatalog?(): Promise<LightingCatalog>;
    lightingChanged?(): void;
    requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  },
) {
  const { store, hub, pairing, profiles, requireAdmin } = services;
  const view = (satellite: Satellite) => ({ ...satellite, ...hub.status(satellite.id) });
  app.get(
    '/api/admin/satellites/lighting-catalog',
    { preHandler: requireAdmin },
    async () => services.lightingCatalog?.() ?? { areasAvailable: false, areas: [], lights: [] },
  );

  app.get(
    '/satellite',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        if (!store.authenticate(bearer(request)))
          return reply.code(403).send({ error: 'Satellite non autorisé.' });
      },
    },
    (socket, request) => {
      // Révoqué entre la vérification et l’ouverture : refusé quand même.
      const satellite = store.authenticate(bearer(request));
      if (!satellite) return socket.close(1008, 'Satellite non autorisé.');
      hub.connect(socket, satellite);
    },
  );

  // Satellite neuf, sans jeton : il attend qu’on l’associe dans l’administration. Réseau
  // local seulement (contrôle commun à toutes les requêtes), aucun droit avant ce clic.
  app.get('/satellite/pair', { websocket: true }, (socket, request) =>
    pairing.connect(socket, request.raw.socket?.remoteAddress ?? null),
  );

  app.get('/api/admin/satellites', { preHandler: requireAdmin }, async () => ({
    satellites: store.list().map(view),
    pending: pairing.list(),
  }));
  app.post<{ Params: { id: string } }>(
    '/api/admin/satellites/:id/camera/preview',
    { preHandler: requireAdmin, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        const image = await hub.capture(request.params.id);
        return reply.header('Cache-Control', 'no-store').send(image);
      } catch {
        return reply.code(503).send({ error: 'Caméra indisponible.' });
      }
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/admin/satellites/:id/camera/check',
    { preHandler: requireAdmin, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!store.get(request.params.id))
        return reply.code(404).send({ error: 'Satellite introuvable.' });
      if (!services.checkCamera || !hub.cameraAvailable(request.params.id))
        return reply.code(409).send({ error: 'Caméra indisponible.' });
      try {
        return await services.checkCamera(request.params.id);
      } catch {
        return reply.code(503).send({ error: 'Capture ou reconnaissance indisponible.' });
      }
    },
  );
  app.post<{ Params: { device: string } }>(
    '/api/admin/satellites/pending/:device/accept',
    { preHandler: requireAdmin },
    async (request, reply) => {
      if (!createSchema(request.body)) return reply.code(400).send({ error: 'Nom invalide.' });
      if (!pairing.list().some((entry) => entry.device === request.params.device))
        return reply.code(404).send({ error: 'Ce satellite n’attend plus : rebranchez-le.' });
      const { satellite, token } = store.create(request.body.name.trim());
      if (!pairing.accept(request.params.device, { name: satellite.name, token })) {
        store.remove(satellite.id);
        return reply.code(409).send({ error: 'Ce satellite vient de se déconnecter : réessayez.' });
      }
      return { satellite: view(satellite) };
    },
  );
  app.post<{ Params: { device: string } }>(
    '/api/admin/satellites/pending/:device/identify',
    { preHandler: requireAdmin },
    async (request, reply) =>
      pairing.identify(request.params.device)
        ? { ok: true }
        : reply.code(404).send({ error: 'Ce satellite n’attend plus.' }),
  );
  app.delete<{ Params: { device: string } }>(
    '/api/admin/satellites/pending/:device',
    { preHandler: requireAdmin },
    async (request, reply) =>
      pairing.reject(request.params.device)
        ? { ok: true }
        : reply.code(404).send({ error: 'Ce satellite n’attend plus.' }),
  );
  app.post('/api/admin/satellites', { preHandler: requireAdmin }, async (request, reply) => {
    if (!createSchema(request.body)) return reply.code(400).send({ error: 'Nom invalide.' });
    const { satellite, token } = store.create(request.body.name.trim());
    return { satellite: view(satellite), token };
  });
  app.patch<{ Params: { id: string } }>(
    '/api/admin/satellites/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const body = request.body;
      if (!updateSchema(body)) return reply.code(400).send({ error: 'Réglages invalides.' });
      if (body.profileId && !profiles.get(body.profileId))
        return reply.code(400).send({ error: 'Profil introuvable.' });
      if (body.room) {
        const catalog = await services.lightingCatalog?.();
        if (body.room.areaId && !catalog?.areas.some((a) => a.id === body.room!.areaId))
          return reply
            .code(400)
            .send({ error: 'Pièce Home Assistant indisponible : actualisez la liste.' });
        for (const kind of ['temperature', 'humidity', 'cover'] as const) {
          const id =
            body.room[
              kind === 'temperature'
                ? 'temperatureEntityId'
                : kind === 'humidity'
                  ? 'humidityEntityId'
                  : 'coverEntityId'
            ];
          if (
            id &&
            !catalog?.entities?.some((e) => e.id === id && e.authorized && matchesRoomKind(e, kind))
          )
            return reply.code(400).send({
              error: 'Choisissez un équipement autorisé du type attendu dans Home Assistant.',
            });
        }
      }
      if (body.lighting) {
        const catalog = await services.lightingCatalog?.();
        const allowed = new Set(catalog?.lights.filter((e) => e.authorized).map((e) => e.id));
        if (
          [...body.lighting.defaultEntityIds, ...body.lighting.allEntityIds].some(
            (id) => !allowed.has(id),
          )
        )
          return reply.code(400).send({
            error:
              'Choisissez uniquement des lampes ou interrupteurs autorisés dans Home Assistant.',
          });
        if (body.lighting.areaId && !catalog?.areas.some((a) => a.id === body.lighting!.areaId))
          return reply.code(400).send({
            error:
              'Pièce Home Assistant indisponible : actualisez la liste ou utilisez un groupe manuel.',
          });
      }
      const satellite = store.update(request.params.id, {
        ...body,
        ...(body.name === undefined ? {} : { name: body.name.trim() }),
      });
      if (!satellite) return reply.code(404).send({ error: 'Satellite introuvable.' });
      hub.refresh(satellite);
      if (body.lighting || body.room || body.name !== undefined) services.lightingChanged?.();
      return { satellite: view(satellite) };
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/admin/satellites/:id/token',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const token = store.renewToken(request.params.id);
      if (!token) return reply.code(404).send({ error: 'Satellite introuvable.' });
      hub.disconnect(request.params.id, 'Jeton renouvelé.');
      return { token };
    },
  );
  app.delete<{ Params: { id: string } }>(
    '/api/admin/satellites/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      if (!store.remove(request.params.id))
        return reply.code(404).send({ error: 'Satellite introuvable.' });
      hub.disconnect(request.params.id, 'Satellite retiré.');
      return { ok: true };
    },
  );
}
