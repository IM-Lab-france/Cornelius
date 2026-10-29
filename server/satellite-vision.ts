import type { SatelliteHub } from './satellites.js';
import type { PerceptionBridge } from './perception.js';
import type { SessionController } from './controller.js';
import type { VisionToolBridge } from './live/transport.js';
import type { ToolResult } from '../shared/addons.js';
import lookSchema from '../schemas/vision-look.schema.json' with { type: 'json' };

/** Images transient in RAM, always scoped to the satellite of this conversation. */
export class SatelliteVision implements VisionToolBridge {
  constructor(
    private hub: SatelliteHub,
    private perception: PerceptionBridge,
    private controller: SessionController,
  ) {}

  async describe(id: string, question: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error('Capture annulée.');
    const image = await this.hub.capture(id, signal);
    return this.perception.analyzeSatelliteImages([image], question, signal);
  }
  tools() {
    const id = this.controller.sessionState().satellite?.id;
    return id && this.hub.cameraAvailable(id)
      ? [
          {
            name: 'vision__look',
            description:
              'Regarder une nouvelle image de la caméra du satellite de cette pièce : décrire la scène, les objets ou lire du texte. Cette caméra ne reconnaît aucune identité ; ne jamais déduire un nom du profil actif. Fournir une question autonome.',
            parameters: lookSchema as Record<string, unknown>,
          },
        ]
      : [];
  }
  handles(name: string) {
    return name === 'vision__look';
  }
  async look(
    input: { profileId: string | null; interactionId: string | null; signal: AbortSignal },
    args: unknown,
  ): Promise<ToolResult> {
    const question = (args as { question?: unknown } | null)?.question;
    if (typeof question !== 'string' || !question.trim() || question.length > 500)
      throw new Error('Question visuelle invalide.');
    const session = this.controller.sessionState();
    const scope = this.controller.scope();
    if (
      !session.satellite ||
      session.interactionId !== input.interactionId ||
      session.phase !== 'ready'
    )
      throw new Error('Conversation périmée.');
    const sight = await this.describe(session.satellite.id, question, input.signal);
    const current = this.controller.scope();
    if (
      input.signal.aborted ||
      current.interactionId !== scope.interactionId ||
      current.profileEpoch !== scope.profileEpoch ||
      current.contextVersion !== scope.contextVersion ||
      this.controller.sessionState().satellite?.id !== session.satellite.id
    )
      throw new Error('Conversation périmée.');
    return {
      schemaVersion: 1,
      status: 'succeeded',
      result: {
        question,
        source: session.satellite.name,
        description: sight.description,
        capturedAt: sight.capturedAt,
        identityNotice:
          'Description visuelle uniquement : aucune identité reconnue. Ne pas attribuer le nom du profil actif à la personne visible.',
      },
      snapshotId: null,
      actionRunId: null,
      summary: sight.description?.slice(0, 500) ?? 'Caméra analysée.',
      error: null,
    };
  }
}
