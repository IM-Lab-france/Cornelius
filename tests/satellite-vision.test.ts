import assert from 'node:assert/strict';
import test from 'node:test';
import { SatelliteVision } from '../server/satellite-vision.js';
import type { SatelliteHub } from '../server/satellites.js';
import type { PerceptionBridge, SatelliteSight } from '../server/perception.js';
import type { SessionController } from '../server/controller.js';

function fixture() {
  let captures = 0;
  const scope = { interactionId: 'conversation', profileEpoch: 1, contextVersion: 1 };
  let sight: SatelliteSight = {
    description: 'Une tasse bleue.',
    capturedAt: Date.now(),
  };
  let afterAnalysis = () => {};
  const bridge = new SatelliteVision(
    {
      cameraAvailable: () => true,
      capture: async (id: string) => {
        assert.equal(id, 'bureau');
        captures++;
        return { jpeg: 'picture', capturedAt: Date.now() };
      },
    } as unknown as SatelliteHub,
    {
      analyzeSatelliteImages: async (images: unknown[]) => {
        assert.equal(images.length, 1);
        afterAnalysis();
        return sight;
      },
    } as unknown as PerceptionBridge,
    {
      scope: () => ({ ...scope }),
      sessionState: () => ({
        phase: 'ready',
        interactionId: scope.interactionId,
        satellite: { id: 'bureau', name: 'Bureau' },
      }),
    } as unknown as SessionController,
  );
  return {
    bridge,
    scope,
    captures: () => captures,
    setSight: (value: SatelliteSight) => {
      sight = value;
    },
    afterAnalysis: (callback: () => void) => {
      afterAnalysis = callback;
    },
  };
}

test('vision satellite : une image de sa pièce, description sans identité', async () => {
  const f = fixture();
  const tool = await f.bridge.look(
    { profileId: 'person', interactionId: 'conversation', signal: new AbortController().signal },
    { question: 'Que vois-tu ?' },
  );
  assert.equal(f.captures(), 1);
  assert.equal(tool.status, 'succeeded');
  assert.equal(tool.result?.source, 'Bureau');
  assert.equal(tool.result?.recognizedPeople, undefined);
});

test('vision satellite : changement de conversation pendant l’analyse et annulation', async () => {
  const f = fixture();
  f.afterAnalysis(() => {
    f.scope.contextVersion++;
  });
  await assert.rejects(
    f.bridge.look(
      { profileId: null, interactionId: 'conversation', signal: new AbortController().signal },
      { question: 'Que vois-tu ?' },
    ),
    /périmée/,
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    f.bridge.look(
      { profileId: null, interactionId: 'conversation', signal: abort.signal },
      { question: 'Que vois-tu ?' },
    ),
    /annulée/,
  );
});
