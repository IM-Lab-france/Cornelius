# OTA Bureau — VALIDÉ le 28 octobre 2026

Carte : Waveshare ESP32-S3-AUDIO-Board-EN, MAC `90:70:69:eb:26:20`, nom `cornelius-bureau`, adresse vérifiée `192.168.40.140`.

Firmware installé : `0.3.0-fozzy-ota1`. L'installation initiale USB a conservé NVS, l'accès Wi-Fi et l'association Bureau. Le service OTA local authentifié est disponible sur TCP 8081 depuis ce PC. Aucune modification du routeur, du serveur Cornelius ou du satellite Salon n'a été nécessaire.

## Preuve exécutée

- Compilation ESP-IDF/PlatformIO réussie ; programme d'environ 1,28 Mo pour un emplacement de 3 Mio.
- Sauvegarde complète de la flash antérieure : 16 Mio, conservée dans le dossier local privé avec son SHA256.
- Table décodée et vérifiée : deux emplacements applicatifs, métadonnées OTA, NVS et PHY préservées.
- Bootloader recompilé explicitement avec retour arrière activé ; vérification de son propre sdkconfig généré.
- Tests réseau : signature incorrecte refusée (403), contenu altéré refusé (400), défi réutilisé refusé (403). Reconnexion à Cornelius vérifiée après ces essais.
- Transfert final réel par Wi-Fi : passage de `ota_0` vers `ota_1`, redémarrage automatique, état OTA `VALID` (2), connexion Cornelius confirmée pendant la vérification finale. Code de sortie de l'outil : 0.
- SHA256 de l'image du transfert final : `19ecd02722771591b79de71001c1b92fdf2884903f9edcca45368bba83cc53ff`.

Les deux emplacements contiennent une image utilisable à la fin de l'intervention. Le retour arrière est configuré ; aucune simulation finale de panne de courant n'a été effectuée. L'audio est reconnecté au serveur, mais un nouvel essai vocal humain après cette intervention n'a pas été réalisé.

## Utilisation depuis l'assistant

Demander par exemple : « Compile le firmware Bureau et installe-le par OTA ». L'assistant peut utiliser les outils locaux de cette application et `ota-client.py`. La carte doit être alimentée, joignable sur le réseau et hors conversation. Son câble USB n'est plus nécessaire pour les mises à jour applicatives habituelles.

Procédure, authentification et retour arrière USB : [OTA.md](OTA.md).

Preuves détaillées locales : `.local/waveshare/ota-wifi-verified.log`, `ota-negative-tests.json`, `ota-metadata.json`, `ota-build-final.log`. La clé et les sauvegardes privées ne sont pas copiées dans ce dossier versionnable.
