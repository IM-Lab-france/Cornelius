import { useEffect, useState } from 'react';
import type { SatelliteView, SatelliteLighting, SatelliteRoom } from '../../../shared/satellites';
import type { LightingCatalog } from '../../../shared/home-assistant';
import { api } from '../../api';
import { Button } from '../ui/button';
import type { RunAction } from './types';

const empty: SatelliteLighting = { areaId: null, defaultEntityIds: [], allEntityIds: [] };

export function SatelliteLightingSettings({
  satellite,
  run,
  onChanged,
}: {
  satellite: SatelliteView;
  run: RunAction;
  onChanged: () => void;
}) {
  const [catalog, setCatalog] = useState<LightingCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<SatelliteLighting>({
    ...(satellite.lighting ?? empty),
    areaId: satellite.room ? satellite.room.areaId : (satellite.lighting?.areaId ?? null),
  });
  const [room, setRoom] = useState<SatelliteRoom>(
    satellite.room ?? {
      areaId: satellite.lighting?.areaId ?? null,
      description: '',
      temperatureEntityId: null,
      humidityEntityId: null,
      coverEntityId: null,
    },
  );
  const id = 'lighting-' + satellite.id;
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setCatalog(await api.satelliteLightingCatalog());
    } catch {
      setError('Liste Home Assistant indisponible. Vérifiez sa connexion puis actualisez.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const configured = [...config.defaultEntityIds, ...config.allEntityIds];
  const options = catalog?.lights.filter((e) => e.authorized || configured.includes(e.id)) ?? [];
  const toggle = (key: 'defaultEntityIds' | 'allEntityIds', value: string) =>
    setConfig((c) => ({
      ...c,
      [key]: c[key].includes(value) ? c[key].filter((v) => v !== value) : [...c[key], value],
    }));
  const auto =
    catalog?.lights.filter(
      (e) =>
        e.domain === 'light' &&
        e.areaId === config.areaId &&
        config.areaId !== null &&
        e.authorized,
    ) ?? [];
  const save = async () => {
    const ok = await run('Contexte de la pièce enregistré.', () =>
      api.updateSatellite(satellite.id, { lighting: config, room }),
    );
    if (ok) onChanged();
  };
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">Contexte de la pièce</summary>
      <div className="mt-4 space-y-4">
        <p>
          Température, humidité et volet sans nom utilisent cette pièce. Une autre pièce nommée
          explicitement reste prioritaire.
        </p>
        <p>
          Sans pièce précisée, « allume la lumière » utilise les lampes par défaut ci-dessous. «
          Toutes les lampes » vise cette pièce uniquement. Une autre pièce nommée explicitement
          reste prioritaire.
        </p>
        <div className="space-y-2">
          <label htmlFor={id + '-area'} className="block font-medium">
            Pièce Home Assistant (facultative)
          </label>
          <select
            id={id + '-area'}
            className="w-full rounded-md border bg-background p-2"
            value={room.areaId ?? ''}
            onChange={(e) => {
              const areaId = e.target.value || null;
              setConfig((c) => ({ ...c, areaId }));
              setRoom((r) => ({
                ...r,
                areaId,
                temperatureEntityId: null,
                humidityEntityId: null,
                coverEntityId: null,
              }));
            }}
          >
            <option value="">Groupe manuel uniquement</option>
            {config.areaId && !catalog?.areas.some((a) => a.id === config.areaId) && (
              <option value={config.areaId}>Pièce enregistrée actuellement indisponible</option>
            )}
            {catalog?.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground">
            Pour « toutes », les lumières autorisées du domaine light de cette pièce sont relues
            depuis Home Assistant à chaque commande. Les prises reliées à des lampes se cochent dans
            le groupe manuel.
          </p>
          {catalog && !catalog.areasAvailable && (
            <p role="status">
              Les pièces Home Assistant ne sont pas disponibles. Vous pouvez utiliser le groupe
              manuel.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor={id + '-description'} className="block font-medium">
            Informations sur la pièce
          </label>
          <textarea
            id={id + '-description'}
            className="w-full rounded-md border bg-background p-2"
            maxLength={500}
            value={room.description}
            placeholder="Ex. Bureau à l’étage, utilisé pour travailler."
            onChange={(e) => setRoom((r) => ({ ...r, description: e.target.value }))}
          />
          <p className="text-muted-foreground">
            Décrivez l’usage ou l’emplacement. Les mesures sont relues à la demande.
          </p>
        </div>
        {(['temperature', 'humidity', 'cover'] as const).map((kind) => {
          const key =
            kind === 'temperature'
              ? 'temperatureEntityId'
              : kind === 'humidity'
                ? 'humidityEntityId'
                : 'coverEntityId';
          const label =
            kind === 'temperature'
              ? 'Capteur de température'
              : kind === 'humidity'
                ? 'Capteur d’humidité'
                : 'Volet ou store';
          const entities =
            catalog?.entities?.filter(
              (e) =>
                e.authorized &&
                (kind === 'cover'
                  ? e.domain === 'cover' &&
                    ['shutter', 'blind', 'shade', 'curtain'].includes(e.deviceClass ?? '')
                  : e.domain === 'sensor' && e.deviceClass === kind),
            ) ?? [];
          return (
            <div key={kind} className="space-y-2">
              <label htmlFor={id + '-' + kind} className="block font-medium">
                {label} par défaut
              </label>
              <select
                id={id + '-' + kind}
                className="w-full rounded-md border bg-background p-2"
                value={room[key] ?? ''}
                onChange={(e) => setRoom((r) => ({ ...r, [key]: e.target.value || null }))}
              >
                <option value="">Automatique si un seul équipement autorisé dans la pièce</option>
                {room[key] && !entities.some((e) => e.id === room[key]) && (
                  <option value={room[key]!}>
                    Équipement enregistré indisponible ou non autorisé
                  </option>
                )}
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.areaId === room.areaId && room.areaId
                      ? ' — dans cette pièce'
                      : ' — autre pièce ou sans pièce'}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        <p className="text-muted-foreground">
          Sans équipement par défaut, Cornelius utilise l’unique capteur ou volet autorisé de la
          pièce. S’il y en a plusieurs, il demande de préciser. Les volets sélectionnés peuvent être
          ouverts, fermés ou arrêtés ; portes et portails restent exclus.
        </p>
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Lecture des pièces et équipements…</p>}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Actualiser les pièces et équipements
        </Button>
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">Lampes par défaut</legend>
          <p className="text-muted-foreground">
            Une ou plusieurs lampes pour « allume/éteins la lumière ». Choisissez uniquement les
            interrupteurs qui commandent réellement un éclairage.
          </p>
          {options.map((e) => (
            <label key={e.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.defaultEntityIds.includes(e.id)}
                onChange={() => toggle('defaultEntityIds', e.id)}
              />
              {e.name}
              {!e.authorized ? ' — autorisation retirée' : ''}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">Autres lampes pour « toutes les lampes »</legend>
          <p className="text-muted-foreground">
            Ajoutez ici un groupe manuel ou des prises d’éclairage. Les lampes par défaut sont
            incluses automatiquement.
          </p>
          {options
            .filter((e) => !config.defaultEntityIds.includes(e.id))
            .map((e) => (
              <label key={e.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.allEntityIds.includes(e.id)}
                  onChange={() => toggle('allEntityIds', e.id)}
                />
                {e.name}
                {!e.authorized ? ' — autorisation retirée' : ''}
              </label>
            ))}
        </fieldset>
        {config.areaId && (
          <p>
            {auto.length} lumière(s) autorisée(s) actuellement trouvée(s) dans cette pièce Home
            Assistant{auto.length ? ' : ' + auto.map((e) => e.name).join(', ') : ''}.
          </p>
        )}
        {options.length === 0 && (
          <p>
            Aucune lampe autorisée disponible. Sélectionnez les appareils accessibles dans le module
            Home Assistant, puis actualisez.
          </p>
        )}
        <p className="text-muted-foreground">
          Ce réglage n’ajoute aucune autorisation Home Assistant. Si aucune lampe n’est configurée,
          Cornelius demandera de préciser au lieu de choisir une autre pièce.
        </p>
        <Button type="button" disabled={loading || !catalog} onClick={() => void save()}>
          Enregistrer le contexte de {satellite.name}
        </Button>
      </div>
    </details>
  );
}
