# Test OTA des deux satellites — VALIDÉ

Test effectué le 2026-10-28T15:48:21.961586+00:00. Réinstallation réelle par Wi-Fi du firmware `0.3.0-fozzy-ota1`, sans programmation USB.

| Satellite | Avant | Après | Résultat |
|---|---|---|---|
| Bureau | ota_1 | ota_0 | Redémarrage, état OTA VALID et connexion Cornelius vérifiés |
| Salon | ota_1 | ota_0 | Redémarrage, état OTA VALID et connexion Cornelius vérifiés |

Les deux outils se sont terminés avec le code 0. Santé HTTP de Cornelius : 200. Le test conserve la même version et la configuration ; il vérifie le transfert, le changement de partition, le redémarrage et la validation après reconnexion. Aucun nouvel essai vocal humain ni simulation de coupure électrique.

Preuves locales : `.local/ota-two-satellites-test.json`, `.local/waveshare/ota-test-two-bureau.log`, `.local/waveshare-salon/ota-test-two-salon.log`.
