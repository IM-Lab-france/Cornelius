import { SatelliteLightingBridge } from '../server/satellite-lighting.js';
import type { HomeAssistant } from '../server/home-assistant.js';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test, { type TestContext } from 'node:test';
import type { WebSocket } from 'ws';
import type { SessionConfig } from 'openai/resources/live/live';
import type { ConnectClientEvent, ConnectServerEvent } from 'openai/resources/live/sideband';
import { openDatabase, ProfileRepository, SessionPreferences } from '../server/storage.js';
import { SessionController } from '../server/controller.js';
import { LiveTransport } from '../server/live/transport.js';
import type { LiveGateway, LiveHandlers } from '../server/live/gateway.js';
import { DiagnosticLog } from '../server/logs.js';
import { SatelliteHub } from '../server/satellites.js';
import { SatelliteStore } from '../server/satellites-store.js';
import { WakeArbiter } from '../server/wake-arbiter.js';
import type { PerceptionBridge } from '../server/perception.js';

const bureau = { id: 'sat-bureau', name: 'Bureau' };

/** Contrôleur réel, transport Live réel, passerelle simulée (aucun appel à OpenAI). */
function fixture(t: TestContext) {
  const db = openDatabase(':memory:');
  let now = Date.now();
  const profiles = new ProfileRepository(db);
  const preferences = new SessionPreferences(db);
  const sent: ConnectClientEvent[] = [];
  const audio: Buffer[] = [];
  const sessions: SessionConfig[] = [];
  let handlers!: LiveHandlers;
  const gateway: LiveGateway = {
    async create() {
      throw new Error('WebRTC inattendu pour un satellite.');
    },
    attach() {
      throw new Error('Canal latéral inattendu pour un satellite.');
    },
    connect(session, value) {
      sessions.push(session);
      handlers = value;
      return {
        send: (event) => sent.push(event),
        sendAudio: (pcm) => audio.push(pcm),
        dispose() {},
      };
    },
  };
  const live = new LiveTransport(
    gateway,
    () => preferences.getOpenAIBlocked(),
    new DiagnosticLog(),
    {},
    () => now,
  );
  const controller = new SessionController(profiles, live, () => now, preferences);
  live.attach(controller);
  const played: [string, Buffer][] = [];
  live.attachSatelliteOutput((id, pcm) => played.push([id, pcm]));
  controller.setWakeWordEnabled(true);
  controller.setWakeWordAvailability(true, null);
  t.after(() => {
    live.dispose();
    db.close();
  });
  const emit = (event: unknown) => handlers.event(event as ConnectServerEvent);
  return {
    db,
    profiles,
    controller,
    live,
    sent,
    audio,
    sessions,
    played,
    emit,
    advance(ms: number) {
      now += ms;
      controller.tick();
    },
  };
}

const tone = (amplitude: number, bytes = 3200) => {
  const pcm = Buffer.alloc(bytes);
  for (let offset = 0; offset < bytes; offset += 2)
    pcm.writeInt16LE(offset % 4 ? amplitude : -amplitude, offset);
  return pcm;
};
const delta = (pcm: Buffer) => ({
  type: 'session.output_audio.delta',
  delta: pcm.toString('base64'),
});

test('satellite : le miroir garde le regard et le satellite ouvre à la voix', (t) => {
  const f = fixture(t);
  f.controller.setOpening({ trigger: 'gaze', audience: 'everyone', recognizeVoice: false });
  const opening = f.controller.opening();
  assert.equal(f.controller.isWakeListening(), false);
  assert.equal(f.controller.isSatelliteWakeListening(), true);
  assert.equal(f.controller.wakeDetected(), false);
  assert.equal(f.controller.satelliteWake(bureau), true);
  assert.deepEqual(f.controller.opening(), opening);
  assert.equal(f.controller.isSatelliteWakeListening(), false);
  assert.equal(f.controller.satelliteWake({ id: 'other', name: 'Cuisine' }), false);
  assert.equal(f.sessions.length, 1);
});

test('satellite : aucun déclenchement si le modèle du mot d’appel est indisponible', (t) => {
  const f = fixture(t);
  f.controller.setWakeWordEnabled(false);
  f.controller.setWakeWordAvailability(false, 'Indisponible');
  assert.equal(f.controller.isSatelliteWakeListening(), false);
  assert.equal(f.controller.satelliteWake(bureau), false);
  assert.equal(f.sessions.length, 0);
});

test('satellite : session Live sur WebSocket, voix seule, sans navigateur ni caméra', (t) => {
  const f = fixture(t);
  // Aucun miroir ouvert : le satellite ouvre quand même, en mode caméra par défaut.
  assert.equal(f.controller.satelliteWake(bureau), true);
  const state = f.controller.sessionState();
  assert.equal(state.phase, 'connecting');
  assert.deepEqual(state.satellite, bureau);
  assert.equal(f.controller.wakeDetected(), false);
  assert.equal(f.sessions.length, 1);
  // Un miroir ouvert ne se greffe pas sur la conversation du satellite.
  assert.throws(() => f.live.offer(f.controller.scope(), 'sdp'), /satellite/u);
  const session = f.sessions[0]!;
  assert.deepEqual(session.audio?.format, { type: 'audio/pcm', rate: 16000 });
  assert.equal('client' in session, false);
  assert.match(String(session.instructions), /Satellite audio/u);
  const tools =
    session.delegation?.type === 'responses'
      ? (session.delegation.responses.tools ?? []).map((tool) => ('name' in tool ? tool.name : ''))
      : [];
  assert.equal(tools.includes('ui__show_luna_card'), false);
  assert.equal(
    tools.some((name) => /^(vision|image|memory)__/u.test(name)),
    false,
  );
  f.emit({ type: 'session.started', event_id: 'e1', session: { id: 'live_sat' } });
  assert.equal(f.controller.sessionState().phase, 'ready');
  // Une personne passe devant le miroir : rien ne change pour la conversation du bureau.
  const profile = f.profiles.create('Léa');
  f.controller.heartbeat();
  f.controller.observe({
    schemaVersion: 1,
    producerBootId: 'camera',
    sequence: 1,
    observedAt: Date.now(),
    health: 'ok',
    presence: true,
    engaged: true,
    people: [{ trackId: 'one', profileId: profile.id }],
  });
  assert.equal(f.controller.snapshot().state.activeProfile, null);
  f.advance(6000);
  assert.equal(f.controller.sessionState().phase, 'ready');
});

test('satellite : son relayé, semi-duplex pendant que Cornelius parle', (t) => {
  const f = fixture(t);
  f.controller.satelliteWake(bureau);
  // Avant session.started, le micro ne part pas.
  f.live.satelliteAudio(bureau.id, tone(3000));
  assert.equal(f.audio.length, 0);
  f.emit({ type: 'session.started', event_id: 'e1', session: { id: 'live_sat' } });
  f.live.satelliteAudio('autre', tone(3000));
  assert.equal(f.audio.length, 0);
  f.live.satelliteAudio(bureau.id, tone(3000));
  assert.equal(f.audio.at(-1)!.readInt16LE(0), -3000);
  // Le flux de sortie part vers le satellite, silences compris.
  f.emit(delta(Buffer.alloc(3200)));
  f.live.satelliteAudio(bureau.id, tone(3000));
  assert.equal(f.audio.at(-1)!.readInt16LE(0), -3000);
  f.emit(delta(tone(8000)));
  assert.deepEqual(
    f.played.map(([id, pcm]) => [id, pcm.length]),
    [
      [bureau.id, 3200],
      [bureau.id, 3200],
    ],
  );
  f.live.satelliteAudio(bureau.id, tone(3000));
  assert.equal(
    f.audio.at(-1)!.every((byte) => byte === 0),
    true,
  );
  f.advance(700);
  f.live.satelliteAudio(bureau.id, tone(3000));
  assert.equal(f.audio.at(-1)!.readInt16LE(0), -3000);
});

test('satellite : fin sur silence, clôture confirmée, puis retour à la veille', (t) => {
  const f = fixture(t);
  f.controller.satelliteWake(bureau);
  f.emit({ type: 'session.started', event_id: 'e1', session: { id: 'live_sat' } });
  f.advance(21_000);
  const state = f.controller.sessionState();
  assert.deepEqual([state.phase, state.reason], ['closing', 'Fin de conversation après silence.']);
  assert.equal(f.sent.at(-1)?.type, 'session.close');
  f.emit({ type: 'session.closed', event_id: 'e2', usage: {} });
  assert.deepEqual(
    [f.controller.sessionState().phase, f.controller.sessionState().satellite],
    ['idle', null],
  );
  assert.equal(f.controller.isWakeListening(), true);
});

test('satellite : réservé aux membres, déconnexion pendant la conversation', (t) => {
  const f = fixture(t);
  f.controller.setOpening({ trigger: 'voice', audience: 'members', recognizeVoice: false });
  assert.equal(f.controller.satelliteWake(bureau), false);
  assert.match(String(f.controller.snapshot().state.diagnostic), /Satellite/u);
  f.controller.setOpening({ trigger: 'voice', audience: 'everyone', recognizeVoice: false });
  assert.equal(f.controller.satelliteWake(bureau), true);
  f.controller.satelliteGone('autre');
  assert.equal(f.controller.sessionState().phase, 'connecting');
  f.controller.satelliteGone(bureau.id);
  assert.deepEqual(
    [f.controller.sessionState().phase, f.controller.sessionState().reason],
    ['closing', 'Satellite déconnecté.'],
  );
});

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: (string | Buffer)[] = [];
  send(value: string | Buffer) {
    this.sent.push(value);
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  ping() {}
  terminate() {
    this.close();
  }
  receive(value: unknown) {
    if (Buffer.isBuffer(value)) this.emit('message', value, true);
    else this.emit('message', Buffer.from(JSON.stringify(value)), false);
  }
  messages() {
    return this.sent
      .filter((value): value is string => typeof value === 'string')
      .map((value) => JSON.parse(value));
  }
}

test('concentrateur : son d’avant le mot rejoué, voix vers le satellite, détection de voix', (t) => {
  const f = fixture(t);
  const store = new SatelliteStore(f.db, Date.now);
  const { satellite } = store.create('Bureau');
  let detected: ((score: number) => void) | null = null;
  const vad: number[] = [];
  const streams: string[] = [];
  const ended: string[] = [];
  const perception = {
    startWakeStream: (id: string, callback: (score: number) => void) => {
      streams.push(id);
      detected = callback;
      return true;
    },
    wakeAudio() {},
    endWakeStream: (id: string) => ended.push(id),
    audio: (_interaction: string, pcm: Buffer) => vad.push(pcm.length),
  } as unknown as PerceptionBridge;
  const relayed: Buffer[] = [];
  const hub = new SatelliteHub({
    store,
    perception,
    arbiter: new WakeArbiter(() => 1),
    controller: f.controller,
    logs: new DiagnosticLog(),
    live: {
      satelliteAudio: (id, pcm) => {
        f.live.satelliteAudio(id, pcm);
        relayed.push(pcm);
      },
    },
    heartbeat: false,
  });
  f.live.attachSatelliteOutput((id, pcm) => hub.play(id, pcm));
  t.after(() => hub.dispose());
  const socket = new FakeSocket();
  hub.connect(socket as unknown as WebSocket, satellite);
  socket.receive({ type: 'hello', protocol: 1, firmware: '0.1.0' });
  const frame = (value: number) => Buffer.alloc(2560, value);
  for (let index = 1; index <= 8; index++) socket.receive(frame(index));
  detected!(0.9);
  assert.deepEqual(
    socket.messages().map((message) => message.type),
    ['welcome', 'settings', 'listen', 'wake', 'session'],
  );
  // La veille repart d’un flux neuf : l’ancien gardait le « Cornelius » qui vient d’être dit.
  assert.equal(streams.length, 2);
  assert.deepEqual(ended, [streams[0]]);
  socket.receive(frame(20));
  assert.equal(relayed.length, 0);
  f.emit({ type: 'session.started', event_id: 'e1', session: { id: 'live_sat' } });
  // Six trames d’avant la détection, puis celle reçue pendant l’ouverture.
  assert.deepEqual(
    relayed.map((pcm) => pcm[0]),
    [3, 4, 5, 6, 7, 8, 20],
  );
  assert.deepEqual(
    f.audio.map((pcm) => pcm[0]),
    [3, 4, 5, 6, 7, 8, 20],
  );
  assert.equal(vad.length, Math.floor((7 * 2560) / 1024));
  assert.equal(
    vad.every((length) => length === 1024),
    true,
  );
  f.emit(delta(tone(8000)));
  assert.equal(socket.sent.filter(Buffer.isBuffer).length, 1);
  // Un autre satellite ne reçoit rien et n’envoie plus de son tant que la conversation dure.
  const other = new FakeSocket();
  hub.connect(other as unknown as WebSocket, store.create('Cuisine').satellite);
  other.receive({ type: 'hello', protocol: 1, firmware: '0.1.0' });
  assert.deepEqual(other.messages().at(-1), { type: 'listen', enabled: false });
  socket.close();
  assert.equal(f.controller.sessionState().reason, 'Satellite déconnecté.');
});

test('satellite rattaché : au nom du profil, même réservé aux membres, puis anonyme', (t) => {
  const f = fixture(t);
  const lea = f.profiles.create('Léa');
  f.controller.setOpening({ trigger: 'voice', audience: 'members', recognizeVoice: false });
  assert.equal(f.controller.satelliteWake({ ...bureau, profileId: lea.id }), true);
  assert.equal(f.controller.snapshot().state.activeProfile?.id, lea.id);
  assert.equal(f.controller.memoryProfileId(), lea.id);
  f.emit({ type: 'session.started', event_id: 'e1', session: { id: 'live_sat' } });
  // Le prénom rejoint la session comme une donnée, sans salutation.
  const identity = f.sent.find(
    (event) =>
      event.type === 'session.instructions.append' && event.content.includes('Conversation au nom'),
  );
  assert.ok(identity);
  f.controller.close('Fin de test.');
  f.emit({ type: 'session.closed', event_id: 'e2', usage: {} });
  assert.equal(f.controller.snapshot().state.activeProfile, null);
  assert.equal(f.controller.memoryProfileId(), null);
});

test('satellite avec annulation d’écho : le micro reste ouvert pendant que Cornelius parle', (t) => {
  const f = fixture(t);
  f.controller.satelliteWake(bureau);
  f.emit({ type: 'session.started', event_id: 'e1', session: { id: 'live_sat' } });
  f.emit(delta(tone(8000)));
  f.live.satelliteAudio(bureau.id, tone(3000), true);
  assert.equal(f.audio.at(-1)!.readInt16LE(0), -3000);
});

test('caméra satellite : captures liées à la connexion, annulation et profil fixe sans capture à l’ouverture', async (t) => {
  const f = fixture(t);
  const store = new SatelliteStore(f.db, Date.now);
  const fixed = f.profiles.create('Profil fixe');
  const created = store.create('Caméra');
  const satellite = store.update(created.satellite.id, { profileId: fixed.id })!;
  let detected!: (score: number) => void;
  const hub = new SatelliteHub({
    store,
    controller: f.controller,
    logs: new DiagnosticLog(),
    heartbeat: false,
    live: null,
    arbiter: new WakeArbiter(() => 1),
    perception: {
      startWakeStream: (_id: string, cb: (score: number) => void) => {
        detected = cb;
        return true;
      },
      endWakeStream() {},
      wakeAudio() {},
    } as unknown as PerceptionBridge,
  });
  t.after(() => hub.dispose());
  const socket = new FakeSocket();
  hub.connect(socket as unknown as WebSocket, satellite);
  socket.receive({ type: 'hello', protocol: 1, firmware: 'camera', camera: true });
  const detectedCamera = detected;
  const other = new FakeSocket();
  hub.connect(other as unknown as WebSocket, store.create('Autre').satellite);
  other.receive({ type: 'hello', protocol: 1, firmware: 'camera', camera: true });
  const capture = hub.capture(satellite.id);
  const request = socket.messages().find((m) => m.type === 'camera_capture');
  const jpeg = Buffer.from([255, 216, 1, 255, 217]);
  const frame = Buffer.concat([Buffer.from([0x4a]), Buffer.from(request.requestId), jpeg]);
  other.receive(frame);
  socket.receive(frame);
  assert.equal((await capture).jpeg, jpeg.toString('base64'));
  const abort = new AbortController();
  const cancelled = hub.capture(satellite.id, abort.signal);
  abort.abort();
  await assert.rejects(cancelled, /annulée/);
  detectedCamera(0.9);
  assert.equal(f.controller.snapshot().state.activeProfile?.id, fixed.id);
  assert.equal(socket.messages().filter((m) => m.type === 'camera_capture').length, 2);
});

test('transport satellite : outil de pièce exposé et appel transmis au résolveur local', async (t) => {
  const f = fixture(t);
  const store = new SatelliteStore(f.db, Date.now);
  const sat = store.create('Bureau').satellite;
  const profile = f.profiles.create('Cédric');
  store.update(sat.id, {
    lighting: { areaId: null, defaultEntityIds: ['switch.office_lamp'], allEntityIds: [] },
  });
  const commands: string[] = [];
  const home = {
    tools: () => [{ name: 'home_assistant__control' }],
    lightingCatalog: async () => ({
      areasAvailable: false,
      areas: [],
      lights: [
        {
          id: 'switch.office_lamp',
          name: 'Lampe',
          domain: 'switch',
          areaId: null,
          authorized: true,
        },
      ],
    }),
    run: async (args: { entityId: string }) => {
      commands.push(args.entityId);
      return { status: 'succeeded', result: { confirmed: true } };
    },
  } as unknown as HomeAssistant;
  f.live.attachRoomLighting(new SatelliteLightingBridge(store, home, f.controller));
  f.controller.satelliteWake({ id: sat.id, name: 'Bureau', profileId: profile.id });
  const session = f.sessions[0]!;
  assert.equal(session.delegation?.type, 'responses');
  if (session.delegation?.type === 'responses')
    assert.ok(
      session.delegation.responses.tools?.some(
        (tool) => 'name' in tool && tool.name === 'home_assistant__room_lights',
      ),
    );
  f.emit({ type: 'session.started', event_id: 'e1', session: { id: 'live_lighting' } });
  f.emit({
    type: 'response.event',
    delegation_id: 'lights',
    event: {
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: 'room-call',
        name: 'home_assistant__room_lights',
        arguments: JSON.stringify({ room: null, scope: 'default', action: 'turn_on' }),
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(commands, ['switch.office_lamp']);
  const output = f.sent.find(
    (e) =>
      e.type === 'response.item.create' && 'item' in e && e.item.type === 'function_call_output',
  );
  assert.ok(output);
});
