import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/storage.js';
import { SatelliteStore } from '../server/satellites-store.js';
import { SatelliteLightingBridge } from '../server/satellite-lighting.js';
import type { HomeAssistant } from '../server/home-assistant.js';
import type { SessionController } from '../server/controller.js';
import type { LightingCatalog } from '../shared/home-assistant.js';

function fixture(t: import('node:test').TestContext) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const store = new SatelliteStore(db, Date.now);
  const bureau = store.create('Bureau').satellite;
  const salon = store.create('Salon').satellite;
  store.update(bureau.id, {
    lighting: {
      areaId: 'office',
      defaultEntityIds: ['switch.lamp'],
      allEntityIds: ['switch.printer_lamp'],
    },
  });
  store.update(salon.id, {
    lighting: { areaId: 'living', defaultEntityIds: ['light.salon'], allEntityIds: [] },
  });
  let source = bureau.id;
  let epoch = 0;
  let permission = true;
  const calls: string[] = [];
  let catalog: LightingCatalog = {
    areasAvailable: true,
    areas: [
      { id: 'office', name: 'Bureau' },
      { id: 'living', name: 'Salon' },
    ],
    lights: [
      { id: 'switch.lamp', name: 'Lampe', domain: 'switch', areaId: 'office', authorized: true },
      {
        id: 'switch.printer_lamp',
        name: 'Lampe imprimante',
        domain: 'switch',
        areaId: null,
        authorized: true,
      },
      {
        id: 'switch.printer_power',
        name: 'Alimentation imprimante',
        domain: 'switch',
        areaId: 'office',
        authorized: true,
      },
      { id: 'light.ceiling', name: 'Plafond', domain: 'light', areaId: 'office', authorized: true },
      {
        id: 'light.forbidden',
        name: 'Privée',
        domain: 'light',
        areaId: 'office',
        authorized: false,
      },
      { id: 'light.salon', name: 'Salon', domain: 'light', areaId: 'living', authorized: true },
    ],
  };
  let afterCatalog = () => {};
  let confirm = true;
  const home = {
    tools: () => (permission ? [{ name: 'home_assistant__control' }] : []),
    lightingCatalog: async () => {
      afterCatalog();
      return catalog;
    },
    run: async (args: { entityId: string }) => {
      calls.push(args.entityId);
      return { status: 'succeeded', result: { confirmed: confirm } };
    },
  } as unknown as HomeAssistant;
  const controller = {
    sessionState: () => ({
      satellite: { id: source, name: source === bureau.id ? 'Bureau' : 'Salon' },
      phase: 'ready',
    }),
    scope: () => ({ interactionId: 'conversation', profileEpoch: epoch, contextVersion: 1 }),
    snapshot: () => ({ state: { activeProfile: { id: 'cedric' } } }),
  } as unknown as SessionController;
  const bridge = new SatelliteLightingBridge(store, home, controller);
  return {
    db,
    store,
    bureau,
    salon,
    bridge,
    calls,
    get catalog() {
      return catalog;
    },
    set catalog(value) {
      catalog = value;
    },
    set source(id: string) {
      source = id;
    },
    revoke: () => {
      permission = false;
    },
    changeDuringLookup: () => {
      afterCatalog = () => epoch++;
    },
    unconfirmed: () => {
      confirm = false;
    },
  };
}
const command = (scope = 'default', room: string | null = null) => ({
  scope,
  room,
  action: 'turn_on',
});
const signal = () => new AbortController().signal;

test('pièce du satellite : défaut distinct, pièce explicitement demandée prioritaire', async (t) => {
  const f = fixture(t);
  assert.equal((await f.bridge.run(command(), signal())).status, 'succeeded');
  assert.deepEqual(f.calls, ['switch.lamp']);
  f.calls.length = 0;
  await f.bridge.run(command('default', f.salon.id), signal());
  assert.deepEqual(f.calls, ['light.salon']);
  f.calls.length = 0;
  f.source = f.salon.id;
  await f.bridge.run(command(), signal());
  assert.deepEqual(f.calls, ['light.salon']);
});
test('toutes : pièces HA relues, groupes manuels, aucune prise non déclarée ni lampe interdite', async (t) => {
  const f = fixture(t);
  await f.bridge.run(command('all'), signal());
  assert.deepEqual([...f.calls].sort(), ['light.ceiling', 'switch.lamp', 'switch.printer_lamp']);
  f.calls.length = 0;
  f.catalog.lights.push({
    id: 'light.new',
    name: 'Nouvelle lampe',
    domain: 'light',
    areaId: 'office',
    authorized: true,
  });
  await f.bridge.run(command('all'), signal());
  assert.ok(f.calls.includes('light.new'));
});
test('défaut absent, droit retiré ou pièce indisponible : aucune commande de repli', async (t) => {
  const f = fixture(t);
  f.store.update(f.bureau.id, {
    lighting: { areaId: null, defaultEntityIds: [], allEntityIds: [] },
  });
  assert.equal((await f.bridge.run(command(), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
  f.store.update(f.bureau.id, {
    lighting: { areaId: 'office', defaultEntityIds: ['switch.lamp'], allEntityIds: [] },
  });
  f.catalog.areasAvailable = false;
  assert.equal((await f.bridge.run(command('all'), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
  f.catalog.areasAvailable = true;
  f.catalog.lights[0]!.authorized = false;
  assert.equal((await f.bridge.run(command(), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
});
test('conversation périmée ou accès HA refusé : aucune action', async (t) => {
  const f = fixture(t);
  f.changeDuringLookup();
  assert.equal((await f.bridge.run(command(), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
  f.revoke();
  assert.equal((await f.bridge.run(command(), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
});
test('résultat non confirmé : aucune affirmation de réussite totale', async (t) => {
  const f = fixture(t);
  f.unconfirmed();
  const result = await f.bridge.run(command(), signal());
  assert.equal(result.status, 'unknown');
  assert.equal(result.result?.confirmed, false);
  assert.equal(f.calls.length, 1);
});
test('réglage conservé par le magasin et effacé avec le satellite', (t) => {
  const f = fixture(t);
  const restored = new SatelliteStore(f.db, Date.now);
  assert.deepEqual(restored.get(f.bureau.id)?.lighting, {
    areaId: 'office',
    defaultEntityIds: ['switch.lamp'],
    allEntityIds: ['switch.printer_lamp'],
  });
  f.store.remove(f.bureau.id);
  assert.equal(restored.get(f.bureau.id), null);
});

test('toutes les lampes d’une pièce HA sans satellite, nom explicite et aucune prise implicite', async (t) => {
  const f = fixture(t);
  f.catalog.areas.push({ id: 'kitchen', name: 'Cuisine' });
  f.catalog.lights.push({
    id: 'light.kitchen',
    name: 'Cuisine',
    domain: 'light',
    areaId: 'kitchen',
    authorized: true,
  });
  await f.bridge.run(command('all', 'Cuisine'), signal());
  assert.deepEqual(f.calls, ['light.kitchen']);
  f.calls.length = 0;
  assert.equal((await f.bridge.run(command('default', 'Cuisine'), signal())).status, 'failed');
  assert.equal(f.calls.length, 0);
});
