import { expect, test } from '@playwright/test';
import { fakeHomeAssistant, haState } from '../helpers/home-assistant';
import { origin, screenshots } from './env';

test('contexte de pièce : choix des équipements, enregistrement et relecture', async ({ page }) => {
  const fake = await fakeHomeAssistant();
  const errors: string[] = [];
  let satelliteId: string | null = null;
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    fake.areas.push({ area_id: 'office', name: 'Bureau' });
    for (const [id, kind] of [
      ['sensor.office_temperature', 'temperature'],
      ['sensor.office_humidity', 'humidity'],
      ['cover.office', 'shutter'],
    ] as const) {
      fake.states.set(id, {
        ...haState(id),
        attributes: {
          ...haState(id).attributes,
          ...{ device_class: kind, supported_features: 11 },
        },
      });
      fake.registry.push({ entity_id: id, area_id: 'office' });
    }
    await page.goto('/admin');
    await page
      .getByLabel('Mot de passe administrateur')
      .fill('admin-browser-test-only-credentials-1234');
    await page.getByRole('button', { name: 'Ouvrir cet espace' }).click();
    const headers = { origin };
    const current = await (await page.request.get('/api/admin/home-assistant')).json();
    const connected = await page.request.put('/api/admin/home-assistant', {
      headers,
      data: { url: fake.url, token: fake.token, revision: current.revision },
    });
    expect(connected.ok()).toBeTruthy();
    const selected = await page.request.put('/api/admin/home-assistant/selection', {
      headers,
      data: {
        selected: ['sensor.office_temperature', 'sensor.office_humidity', 'cover.office'],
        revision: (await connected.json()).revision,
      },
    });
    expect(selected.ok()).toBeTruthy();
    const created = await page.request.post('/api/admin/satellites', {
      headers,
      data: { name: 'Bureau' },
    });
    expect(created.ok()).toBeTruthy();
    const satellite = (await created.json()).satellite;
    satelliteId = satellite.id;
    await page.getByRole('button', { name: 'Satellites audio', exact: true }).click();
    await page.getByText('Contexte de la pièce', { exact: true }).click();
    await page.getByLabel('Pièce Home Assistant (facultative)').selectOption('office');
    await page.getByLabel('Informations sur la pièce').fill('Bureau à l’étage, pièce de travail.');
    await page
      .getByLabel('Capteur de température par défaut')
      .selectOption('sensor.office_temperature');
    await page.getByLabel('Capteur d’humidité par défaut').selectOption('sensor.office_humidity');
    await page.getByLabel('Volet ou store par défaut').selectOption('cover.office');
    await page.getByRole('button', { name: 'Enregistrer le contexte de Bureau' }).click();
    await expect(page.locator('.admin-toast')).toContainText('Contexte de la pièce enregistré.');
    const saved = (await (await page.request.get('/api/admin/satellites')).json()).satellites.find(
      (s: { id: string }) => s.id === satellite.id,
    );
    expect(saved.room).toEqual({
      areaId: 'office',
      description: 'Bureau à l’étage, pièce de travail.',
      temperatureEntityId: 'sensor.office_temperature',
      humidityEntityId: 'sensor.office_humidity',
      coverEntityId: 'cover.office',
    });
    await page.screenshot({ path: screenshots + '/satellite-room-desktop.png', fullPage: true });
    await page.reload();
    await page.getByText('Contexte de la pièce', { exact: true }).click();
    await expect(page.getByLabel('Capteur de température par défaut')).toHaveValue(
      'sensor.office_temperature',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('button', { name: 'Enregistrer le contexte de Bureau' }),
    ).toBeVisible();
    await page.screenshot({ path: screenshots + '/satellite-room-mobile.png', fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    expect(errors).toEqual([]);
  } finally {
    if (satelliteId)
      await page.request.delete('/api/admin/satellites/' + satelliteId, { headers: { origin } });
    const view = await (await page.request.get('/api/admin/home-assistant')).json();
    if (typeof view.revision === 'number')
      await page.request.delete('/api/admin/home-assistant', {
        headers: { origin },
        data: { revision: view.revision },
      });
    await fake.close();
  }
});
