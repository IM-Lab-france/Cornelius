# Extension caméra pour Waveshare Bureau

Base : https://github.com/lfpoulain/cornelius-satellite, commit cf9f77a302bcfc58f436b535f78df21a71d36a13.

Ce dossier conserve le correctif complet de cette installation : audio réglé, anneau de veille fluide, connexion locale fixe si le portail ne fournit pas d’adresse, caméra OV2640 à la demande. Ce n’est pas une fonctionnalité upstream.

Reconstruction dans un clone séparé de la base :

1. Appliquer `extension.patch` avec `git apply`.
2. Copier `main/camera.c`, `main/camera.h`, `main/ota.c`, `main/ota.h`, `platformio.ini` et `partitions.csv` dans ce clone. Préparer la clé propre à cette carte avec `provision-ota-key.py`, comme indiqué dans `OTA.md`.
3. Vérifier l’adresse du serveur dans `sdkconfig.defaults` et adapter `upload_port` au port série réel de la Waveshare. Ne jamais remplacer le port d’un autre équipement.
4. Utiliser PlatformIO et lancer `pio run --disable-auto-clean`. Sur un ancien build, vérifier aussi `CONFIG_CAMERA_PSRAM_DMA=y` dans le sdkconfig actif. L’audio et la caméra partagent l’I2C mais la caméra ne possède pas ce bus ; elle ne le supprime pas.
5. Après sauvegarde complète du firmware existant, suivre la première installation USB décrite dans `OTA.md` : bootloader, table, application et métadonnées OTA. Préserver NVS. Les mises à jour suivantes utilisent `ota-client.py`.

La carte réserve ses buffers JPEG en PSRAM avec DMA direct. Images VGA JPEG, une capture sur demande, un seul travail caméra, au plus 80 Ko par image ; pas de fichier photo ni de flux vidéo permanent. Capteur alimenté uniquement pendant la capture. BOOT interdit aussi les captures lorsque le micro est coupé. La qualité de description dépend de l’éclairage et du cadrage. Aucune reconnaissance de profil par cette caméra.

Logiciel serveur correspondant : `server/satellite-vision.ts`, `server/satellites.ts`, `server/perception.ts` et `perception/satellite_camera.py`. Sans le serveur modifié, le firmware reste un satellite audio. Sans capacité caméra annoncée, le serveur garde le fonctionnement audio et le profil fixe.

Mises à jour par Wi-Fi et migration initiale USB : voir [OTA.md](OTA.md). Après migration OTA, le retour arrière USB exige une sauvegarde cohérente du bootloader, de la table et du programme ; ne pas appliquer l'ancienne restauration du seul programme. Les secrets Wi-Fi et le jeton ne font pas partie de ce dossier. Sauvegarder séparément `.env`, `data/` et la NVS avant une migration ; ne jamais les publier.


## Nom DHCP et mDNS par pièce

Le paramètre Kconfig `SATELLITE_HOSTNAME` définit le même nom DHCP et mDNS, par exemple `cornelius-salon` ou `cornelius-bureau`. Le nom est fixé sur l’interface STA avant le démarrage Wi-Fi, afin que le client DHCP annonce ce nom plutôt que `espressif`. Vide : nom unique `cornelius-satellite-<MAC>`.

Pour une compilation existante PlatformIO, régler `CONFIG_SATELLITE_HOSTNAME="cornelius-salon"` dans le sdkconfig de l’environnement actif, puis recompiler. Ne pas flasher un firmware portant ce nom sur deux cartes : chaque pièce doit garder son nom. La carte du bureau déjà en service n’est pas modifiée par la compilation du salon.

## Stabilité de la liaison audio (versions locales ota2 et ota3)

Le verrou d'envoi des messages WebSocket de contrôle attend désormais 12 secondes, au lieu de 2 : la tâche audio autorise déjà jusqu'à 10 secondes pour un envoi réseau. L'ancien délai pouvait provoquer un échec de réponse PONG pendant un envoi audio lent et une reconnexion, signalée en orange. La fréquence des contrôles et l'indication des vraies pertes de connexion sont conservées.

L'état OTA fournit aussi des compteurs numériques de pertes Wi-Fi, de reconnexions WebSocket et d'envois lents, le RSSI et le temps depuis le démarrage. Ces diagnostics ne contiennent aucun enregistrement audio. Les réglages et clés des deux cartes restent séparés ; les paquets de cette version sont conservés dans les dossiers locaux `ota2-artifacts` de chaque carte.

Le seul ajustement du délai en ota2 n'a pas suffi en écoute active : les allocations TLS, l'annulation d'écho et les services locaux laissaient très peu de mémoire interne libre. La version ota3 utilise `CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC=y` pour réserver les allocations TLS en PSRAM et préserver la DRAM du Wi-Fi/audio. La signature serveur et le chiffrement de la liaison restent actifs. Les compteurs de déconnexion et le traitement des codes d'erreur sont également corrigés ; l'ancien compteur ota2 ne doit pas servir à conclure à l'absence de coupures. Les paquets actuels sont dans les dossiers privés `ota3-artifacts`.
