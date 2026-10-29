# Mises à jour Wi-Fi depuis le PC Windows

Le firmware ajoute un service OTA local sur TCP 8081. Il conserve les échanges audio et caméra avec Cornelius sur leur connexion habituelle. Aucun service cloud ni abonnement supplémentaire n'est nécessaire. L'assistant peut compiler puis exécuter `ota-client.py` depuis ce PC ; la session d'administration du navigateur n'est pas nécessaire.

## Authentification

Chaque carte possède une clé aléatoire de 32 octets, incluse dans son firmware via un fichier local `main/ota_key.h`, exclu de Git. La copie PC est protégée par Windows DPAPI dans `.local/waveshare/ota-private/bureau.dpapi`. Ne jamais publier l'en-tête, la copie privée, les firmwares compilés ou les sauvegardes de flash. Restreindre leurs droits au compte Windows et SYSTEM. La clé compilée a les mêmes limites de protection physique que les identifiants Wi-Fi de cette carte ; la flash n'est pas chiffrée.

Le service délivre un défi aléatoire de 60 secondes, puis exige un HMAC-SHA256 couvrant le défi, le SHA256 et la taille de l'image. Un défi valide ne sert qu'une fois. Le contenu reçu est vérifié avant de sélectionner la nouvelle partition de démarrage. Le transport HTTP ne chiffre pas l'image, mais la clé ne traverse jamais le réseau et une image modifiée est rejetée. L'outil vérifie aussi l'adresse MAC attendue avant l'envoi.

## Première installation USB

Sauvegarder toute la flash et vérifier la MAC physique avant d'écrire. La table conserve NVS à `0x9000` et PHY à `0xf000`, et remplace l'application unique par deux slots de 3 Mio à `0x10000` et `0x310000`. Les métadonnées OTA sont à `0x610000` (8 Kio). Préparer cette zone avec des octets `0xff` lors de la migration. Ne pas effacer toute la flash : cela supprimerait l'association et le Wi-Fi.

Dans un clone reconstruit avec `extension.patch`, copier les fichiers `main/camera.*`, `main/ota.*`, `platformio.ini` et `partitions.csv` de ce dossier. Générer la clé avec `provision-ota-key.py --key-file <fichier DPAPI local> --firmware-dir <clone>`, puis compiler. Vérifier `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y` dans le sdkconfig actif. Écrire le bootloader, la table et l'application aux adresses du fichier `flash_args` du build, ainsi que la zone OTA vierge. Le nom DHCP doit correspondre à la carte programmée.

Vérifier également que le fichier généré `.pio/build/waveshare/bootloader/config/sdkconfig.h` définit `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE` : un ancien cache de bootloader peut ignorer la modification du sdkconfig principal. Dans ce cas, reconfigurer et reconstruire explicitement le sous-projet bootloader avant l'installation initiale. Utiliser les binaires PlatformIO effectifs `bootloader.bin`, `partitions.bin`, `firmware.bin`, `ota_data_initial.bin`, avec les offsets contrôlés dans la table décodée.

## Mise à jour suivante

Depuis `D:\Cornelius`, satellite au repos :

```powershell
C:\Python312\python.exe firmware/waveshare-camera/ota-client.py --host 192.168.40.140 --mac 90:70:69:eb:26:20 --key-file .local/waveshare/ota-private/bureau.dpapi --image .local/waveshare/ota-artifacts/firmware.bin --expected-version 0.3.0-fozzy-ota1
```

Adapter la version attendue et l'image au nouveau build. Conserver la même clé pour cette carte. Sans `--image`, la commande lit seulement l'état. Le nom DHCP `cornelius-bureau` peut remplacer l'adresse IP si sa résolution est disponible.

Les images Bureau et Salon sont distinctes (nom et clé). Après chaque compilation, utiliser `package-ota.py --build-dir <build> --output-dir <dossier de cette carte> --key-file <clé DPAPI de cette carte> --mac <MAC> --version <version>`. Il vérifie la présence de la bonne clé dans le binaire et écrit un manifeste `firmware.bin.ota.json`. L'outil d'envoi exige ce manifeste et vérifie destination, clé, empreinte et version avant tout transfert. Ne pas envoyer directement un binaire provenant du dossier de compilation partagé.

Salon utilise `.local/waveshare-salon/ota-artifacts/firmware.bin`, la clé `.local/waveshare-salon/ota-private/salon.dpapi`, la MAC `90:70:69:eb:15:b0` et l'adresse vérifiée lors de l'installation `192.168.40.101`.

Les conversations actives empêchent une mise à jour. Pendant l'écriture, l'anneau pulse en orange et le firmware suspend l'envoi micro et les captures caméra. Le choix de mute enregistré n'est pas modifié. La carte redémarre après validation, puis exige dix secondes de connexion stable à Cornelius avant d'accepter définitivement le firmware. Un échec de reconnexion provoque le retour arrière ; un crash avant validation entraîne aussi un retour arrière au démarrage suivant. L'outil ne déclare le succès qu'après contrôle de la nouvelle partition, de la version, de la connexion et de l'état OTA validé.

Ne pas ouvrir de moniteur série pendant cette première validation : certains outils modifient DTR/RTS à l'ouverture, ce qui peut provoquer un reset et donc un retour arrière pendant l'état provisoire. L'outil OTA vérifie tout par le réseau.

Un accès PC → satellite TCP 8081 est nécessaire. Aucun port WAN ne doit être ouvert. L'outil échoue sans modifier le routeur si cet accès est indisponible.

## Retour arrière de la migration USB

La sauvegarde complète antérieure contient l'ancienne table et le bootloader. Pour annuler la migration, restaurer cet ensemble cohérent par USB après vérification de la MAC. L'ancienne procédure de restauration du seul programme ne suffit plus après changement de table. Les sauvegardes intégrales contiennent des secrets et restent dans le dossier privé local.
