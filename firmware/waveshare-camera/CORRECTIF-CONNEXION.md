# Reconnexions des satellites — correctif validé

Version installée par OTA sur Bureau et Salon : `0.3.0-fozzy-ota3`.

## Diagnostic

L'anneau orange correspondait à des pertes de la liaison Cornelius. Le serveur a enregistré 13 déconnexions de Bureau sur une fenêtre de dix minutes. Le Wi-Fi restait associé et les cinq pings de contrôle par carte n'ont perdu aucun paquet (2 à 6 ms).

Le premier réglage (ota2 : contrôle WebSocket 12 s au lieu de 2 s pour un envoi audio pouvant durer 10 s) n'a pas suffi. Le compteur de déconnexions ota2 n'était pas incrémenté et certains champs d'erreur étaient lus alors qu'ils n'étaient pas renseignés par la bibliothèque ; ils ont été corrigés. Les journaux serveur et les observations utilisateur priment sur ces anciens compteurs.

En écoute active, Salon tombait autour de 6 Ko de DRAM libre, avec un plus grand bloc libre d'environ 1,4 Ko, tandis que la PSRAM était disponible. La version ota3 place les allocations mbedTLS en PSRAM (`CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC=y`) pour libérer la mémoire interne requise par l'audio et le Wi-Fi. Le chiffrement et l'authentification du serveur sont conservés.

## Résultat

Les deux installations OTA et leur confirmation après reconnexion ont réussi. L'utilisateur a confirmé une réponse vocale sur Salon et Bureau avec la version ota3. Les deux microphones étaient actifs pendant la mesure finale de deux minutes : aucune perte Wi-Fi, aucune reconnexion WebSocket, aucune erreur d'envoi, aucun échantillon hors ligne. Salon a aussi été observé pendant la compilation de Bureau, sans nouvelle coupure après ota3. La mémoire interne libre est remontée autour de 35–41 Ko ; les envois les plus longs sont restés autour de 10–15 ms, contre environ 10 secondes observées avant cette correction.

Ces mesures bornées ne garantissent pas l'absence de problème futur. Une surveillance silencieuse toutes les 30 minutes est active dans ce chat ; elle compare les états et nouveaux journaux et signale uniquement un incident ou son rétablissement. Elle nécessite que le PC et les outils locaux soient disponibles. Elle ne redémarre ni ne reprogramme rien.

## Preuves et reprise

- `.local/ota2-baseline.json` : historique des coupures avant correction.
- `.local/waveshare/ota3-install.log`, `.local/waveshare-salon/ota3-install.log` : preuve OTA.
- `.local/ota3-stability-first.json` : première fenêtre (la transition OTA de Bureau y est attendue ; exploiter la fenêtre Salon).
- `.local/ota3-stability-final.json` : contrôle simultané final.
- `.local/ota3-human-validation.json` et confirmations dans ce chat : essais vocaux.
- `.local/satellite-stability-monitor-state.json` : référence du suivi périodique.
- Automatisation : `stabilit-des-satellites-cornelius`.

Les paquets courants sont propres à chaque carte dans `.local/waveshare/ota3-artifacts` (Bureau) et `.local/waveshare-salon/ota3-artifacts` (Salon). Les versions antérieures sont conservées. Le clone de compilation est réglé pour Bureau ; changer son nom et provisionner la clé de l'autre carte avant toute nouvelle compilation destinée à Salon. Le correctif local est conservé dans `extension.patch` et les fichiers source de ce dossier. La PR publique OTA initiale n'a pas été modifiée dans cette intervention.
