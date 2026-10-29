# OTA Salon — VALIDÉ le 28 octobre 2026

Carte Waveshare ESP32-S3-AUDIO-Board-EN identifiée sur COM10 : MAC `90:70:69:eb:15:b0`, nom conservé `cornelius-salon`, adresse vérifiée `192.168.40.101`.

Firmware installé : `0.3.0-fozzy-ota1`, avec les mêmes fonctions audio, caméra et LED que la version Bureau. La clé OTA est propre au Salon. Le Wi-Fi et l'association Cornelius ont été conservés ; aucune modification du routeur ni redémarrage du serveur Cornelius n'a été nécessaire.

Vérifications exécutées :

- Sauvegarde complète de 16 Mio avant modification, taille et SHA256 enregistrés localement ; dossier privé restreint au compte Windows et SYSTEM.
- Compilation réussie ; nom Salon et clé dédiée contrôlés dans le binaire.
- Bootloader avec retour arrière activé, table à deux emplacements, NVS préservée. Écriture initiale USB vérifiée par esptool.
- Le Salon refuse une requête authentifiée avec la clé Bureau (HTTP 403) et reste connecté.
- Le client refuse un paquet Bureau destiné au Salon ; le préparateur refuse un binaire compilé avec une autre clé.
- Mise à jour réelle envoyée par Wi-Fi : passage de `ota_0` à `ota_1`, redémarrage et validation automatique du firmware (`ota_state=2`), connexion à Cornelius vérifiée par le client avec code de sortie 0.
- Santé HTTP du serveur Cornelius : 200 après intervention.

Aucun nouvel essai vocal humain n'a été réalisé. Le retour arrière est configuré ; aucune panne électrique n'a été simulée.

## Prochaine mise à jour depuis l'assistant

```powershell
C:\Python312\python.exe firmware/waveshare-camera/ota-client.py --host 192.168.40.101 --mac 90:70:69:eb:15:b0 --key-file .local/waveshare-salon/ota-private/salon.dpapi --image .local/waveshare-salon/ota-artifacts/firmware.bin --expected-version 0.3.0-fozzy-ota1
```

Pour une nouvelle version, compiler avec le nom Salon et sa clé existante, puis préparer son paquet avec `package-ota.py`. Le manifeste est obligatoire et lie l'image à la carte, à la clé et à la version. Le clone de compilation partagé est actuellement réglé pour Salon ; les paquets Bureau restent séparés dans `.local/waveshare/ota-artifacts/`.

Procédure complète : [OTA.md](OTA.md). Preuves privées : `.local/waveshare-salon/ota-wifi-verified.log`, `ota-current-status.json`, `ota-auth-test.json`, `ota-metadata.json`, `ota-build.log`. La sauvegarde intégrale et les clés ne doivent pas être publiées.
