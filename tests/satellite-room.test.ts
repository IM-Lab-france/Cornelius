import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/storage.js';
import { SatelliteStore } from '../server/satellites-store.js';
import { SatelliteRoomBridge } from '../server/satellite-room.js';
import type { SessionController } from '../server/controller.js';
import type { HomeAssistant } from '../server/home-assistant.js';
import type { LightingCatalog, HomeAssistantEntity } from '../shared/home-assistant.js';

function fixture(t: import('node:test').TestContext) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const store = new SatelliteStore(db, Date.now);
  const bureau = store.create('Bureau').satellite;
  store.update(bureau.id, {
    lighting: { areaId: 'office', defaultEntityIds: [], allEntityIds: [] },
  });
  const catalog: LightingCatalog = {
    areasAvailable: true,
    areas: [
      { id: 'office', name: 'Bureau' },
      { id: 'living', name: 'Salon' },
    ],
    lights: [],
    entities: [],
  };
  const add = (id: string, kind: string, areaId = 'office', authorized = true) => {
    catalog.entities!.push({
      id,
      name: id,
      aliases: [],
      domain: id.split('.')[0] as HomeAssistantEntity['domain'],
      state: '20',
      brightness: false,
      brightnessPct: null,
      observedAt: null,
      deviceClass: kind,
      areaId,
      authorized,
    });
  };
  add('sensor.office_temp', 'temperature');
  add('sensor.office_humidity', 'humidity');
  add('cover.office', 'shutter');
  add('sensor.living_temp', 'temperature', 'living');
  let epoch = 1;
  let permission = true;
  let afterLookup = () => {};
  const calls: { args: unknown; name: string }[] = [];
  const home = {
    tools: () =>
      permission ? [{ name: 'home_assistant__read' }, { name: 'home_assistant__cover' }] : [],
    lightingCatalog: async () => {
      afterLookup();
      return catalog;
    },
    run: async (args: unknown, _signal: AbortSignal, name: string) => {
      calls.push({ args, name });
      return { schemaVersion: 1, status: 'succeeded', result: { confirmed: true } };
    },
  } as unknown as HomeAssistant;
  const controller = {
    sessionState: () => ({ satellite: bureau, phase: 'ready' }),
    scope: () => ({ interactionId: 'conversation', profileEpoch: epoch, contextVersion: 1 }),
    snapshot: () => ({ state: { activeProfile: null } }),
  } as unknown as SessionController;
  const bridge = new SatelliteRoomBridge(store, home, controller);
  return {
    db,
    store,
    bureau,
    catalog,
    add,
    calls,
    bridge,
    revoke: () => {
      permission = false;
    },
    expire: () => {
      afterLookup = () => {
        epoch++;
      };
    },
  };
}
const signal = () => new AbortController().signal;
const request = (kind = 'temperature', room: string | null = null, action = 'read') => ({
  room,
  kind,
  action,
});

test('pièce courante et pièce explicitement nommée : lecture individuelle à chaque demande', async (t) => {
  const f = fixture(t);
  await f.bridge.run(request(), signal());
  await f.bridge.run(request(), signal());
  await f.bridge.run(request('temperature', 'Salon'), signal());
  await f.bridge.run(request('humidity'), signal());
  await f.bridge.run(request('cover', null, 'close_cover'), signal());
  assert.deepEqual(f.calls, [
    { args: { entityId: 'sensor.office_temp' }, name: 'home_assistant__read' },
    { args: { entityId: 'sensor.office_temp' }, name: 'home_assistant__read' },
    { args: { entityId: 'sensor.living_temp' }, name: 'home_assistant__read' },
    { args: { entityId: 'sensor.office_humidity' }, name: 'home_assistant__read' },
    {
      args: { entityId: 'cover.office', action: 'close_cover', brightnessPct: null },
      name: 'home_assistant__cover',
    },
  ]);
});

test('ambiguïté, équipement absent et registres indisponibles : aucun repli ailleurs', async (t) => {
  const f = fixture(t);
  f.add('sensor.second', 'temperature');
  assert.equal((await f.bridge.run(request(), signal())).status, 'failed');
  f.catalog.entities = f.catalog.entities!.filter((e) => e.areaId !== 'office');
  assert.equal((await f.bridge.run(request(), signal())).status, 'failed');
  f.catalog.areasAvailable = false;
  assert.equal((await f.bridge.run(request('temperature', 'Salon'), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
});

test('pièce manuelle explicite et noms dupliqués : aucune déduction depuis l’ancien éclairage', async (t) => {
  const f = fixture(t);
  f.store.update(f.bureau.id, {
    room: {
      areaId: null,
      description: '',
      temperatureEntityId: null,
      humidityEntityId: null,
      coverEntityId: null,
    },
  });
  assert.equal((await f.bridge.run(request(), signal())).status, 'failed');
  f.store.create('Bureau');
  assert.equal((await f.bridge.run(request('temperature', 'Bureau'), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
});

test('défaut manuel persistant, sans registres, mais jamais après révocation', async (t) => {
  const f = fixture(t);
  const room = {
    areaId: null,
    description: 'Pièce de travail',
    temperatureEntityId: 'sensor.office_temp',
    humidityEntityId: null,
    coverEntityId: null,
  };
  f.store.update(f.bureau.id, { room });
  assert.deepEqual(new SatelliteStore(f.db, Date.now).get(f.bureau.id)?.room, room);
  f.catalog.areasAvailable = false;
  assert.equal((await f.bridge.run(request(), signal())).status, 'succeeded');
  f.catalog.entities!.find((e) => e.id === 'sensor.office_temp')!.authorized = false;
  assert.equal((await f.bridge.run(request(), signal())).status, 'failed');
  assert.equal(f.calls.length, 1);
  f.store.remove(f.bureau.id);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM satellite_room').get()!.n, 0);
});

test('accès refusé, session périmée, mauvais type et garage : aucune commande', async (t) => {
  const f = fixture(t);
  assert.equal(
    (await f.bridge.run(request('temperature', null, 'close_cover'), signal())).status,
    'failed',
  );
  f.catalog.entities = [];
  f.add('cover.garage', 'garage');
  assert.equal(
    (await f.bridge.run(request('cover', null, 'open_cover'), signal())).status,
    'failed',
  );
  f.add('cover.office', 'shutter');
  f.expire();
  assert.equal(
    (await f.bridge.run(request('cover', null, 'open_cover'), signal())).status,
    'failed',
  );
  f.revoke();
  assert.equal(f.bridge.tools(null).length, 0);
  assert.equal((await f.bridge.run(request(), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
});
