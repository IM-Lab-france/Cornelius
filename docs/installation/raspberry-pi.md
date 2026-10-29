# Installer Cornelius sur Raspberry Pi

Cette page explique ce qui change quand Cornelius tourne sur un Raspberry Pi 4 ou 5, et comment l’installer. Elle complète [Installer sous Linux](linux.md), dont elle reprend le script. Elle s’adresse à la personne qui prépare le miroir.

## Ce qui change sur un Raspberry Pi

Un Raspberry Pi fait tourner la conversation, la reconnaissance des visages, le mot d’appel et le miroir. Il est trop juste pour les modèles d’image locaux. Cornelius le reconnaît seul au démarrage (nom de la carte lu dans `/proc/device-tree/model`) et s’adapte :

| | Sur un PC | Sur un Raspberry Pi |
|---|---|---|
| Conversation, mémoire, modules | oui | oui |
| Mot d’appel « Cornelius » | oui | oui |
| Reconnaissance des visages | image entière | visages cherchés sur une image réduite à 640 pixels de large, puis reconnus sur l’image entière |
| [Vision locale](../fonctionnalites/vision-locale.md) (description de la scène) | au choix | retirée : le module **Vision** n’apparaît pas dans l’administration |
| [Génération d’images](../fonctionnalites/generation-d-images.md) | sur ce PC ou avec OpenAI | avec OpenAI seulement |

La réduction de l’image ne touche que la recherche des visages, la partie la plus coûteuse. La reconnaissance garde l’image de la caméra en entier : un visage reconnu à deux mètres sur un PC l’est aussi sur le Pi. En contrepartie, un visage très petit, loin de la caméra, peut ne pas être trouvé.

Les réglages enregistrés ne sont pas effacés : la même base de données, recopiée sur un PC, y retrouve sa vision et son générateur d’images. Dans l’autre sens, une base venue d’un PC où les images étaient créées sur ce PC arrive avec la création d’images désactivée : rien ne part chez OpenAI, ni n’est facturé, avant que vous la réactiviez dans **Modules → Génération d’image**.

D’autres générateurs d’images en ligne peuvent s’ajouter par un [module](../modules/README.md).

## Ce qu’il faut

- Un Raspberry Pi 5 (conseillé) ou 4, avec 4 Go de mémoire au moins ; 8 Go laissent de la marge au navigateur.
- **Raspberry Pi OS 64 bits** (Bookworm ou plus récent). La version 32 bits ne convient pas : ONNX Runtime et OpenCV n’y sont pas publiés.
- Un refroidissement actif (ventilateur ou boîtier ventilé) : la caméra est analysée en continu et le Pi ralentit quand il chauffe.
- De préférence un SSD (port NVMe du Pi 5 ou disque USB) plutôt qu’une carte microSD, plus fragile face aux écritures de la base.
- Une **webcam USB**. Les modules caméra officiels (connecteur CSI, pilotés par libcamera) ne sont pas lus par la perception.
- Un micro USB, ou mieux un haut-parleur de conférence USB qui supprime l’écho : le Pi n’a pas de micro.
- Un écran Full HD de préférence : en 4K, l’orbe animée demande beaucoup au processeur graphique du Pi.
- Une clé OpenAI d’un compte payant, comme sur un PC.

## Installer

Préparez Node.js 24 avec fnm, puis lancez le script d’installation, comme décrit dans [Installer sous Linux](linux.md) :

```sh
sudo apt install git curl unzip
git clone https://github.com/lfpoulain/Cornelius.git
cd Cornelius
curl -fsSL https://fnm.vercel.app/install | bash
```

Ouvrez un nouveau terminal, revenez dans le dossier `Cornelius`, puis :

```sh
scripts/install-linux.sh --system-deps --wake --systemd
```

Le script affiche le processeur et la carte, puis « Petite machine : sans vision locale ni génération d’images locale ». Il installe Python 3.12 à part (Raspberry Pi OS fournit une autre version), la perception sur le processeur, et seulement les modèles des visages, de la parole et du mot d’appel : le modèle de vision n’est pas téléchargé. L’option `--gpu` n’accepte que `auto` ou `cpu` en ARM64.

## Ouvrir le miroir au démarrage

Cornelius ne lance pas le navigateur lui-même. Pour que le miroir s’affiche seul au démarrage du Pi :

1. Ouvrez une fois `http://127.0.0.1:3000/` dans Chromium.
2. Autorisez durablement le micro et le son pour ce site (cadenas à gauche de l’adresse, « Paramètres du site », **Microphone** et **Son** sur « Autoriser »). Sans cela, il faut toucher **Activer la voix** à chaque démarrage (voir le [dépannage](../utilisation/depannage.md)).
3. Ajoutez Chromium en plein écran au démarrage de la session graphique, par exemple avec la commande `chromium --kiosk http://127.0.0.1:3000/` (`chromium-browser` sur Raspberry Pi OS Bookworm) dans les applications lancées au démarrage du bureau.

Gardez toujours la même adresse : `127.0.0.1` et `localhost` sont deux sites différents pour le navigateur.

## Forcer ou désactiver le mode petite machine

La variable `CORNELIUS_SMALL_MACHINE` du fichier `.env` remplace la détection, pour le serveur comme pour le script d’installation :

- `CORNELIUS_SMALL_MACHINE=0` : un Raspberry Pi garde la vision locale et le choix du générateur d’images, à vos risques (descriptions lentes, analyses abandonnées après 10 s).
- `CORNELIUS_SMALL_MACHINE=1` : un autre ordinateur modeste (mini-PC, carte ARM) se comporte comme un Raspberry Pi.

Redémarrez Cornelius après un changement. Voir [Configuration](../reference/configuration.md).

## Alléger encore

Si le Pi peine (orbe saccadée, reconnaissance lente) :

- **Caméra et reconnaissance** : choisissez 640 × 480 à 15 images par seconde.
- **Quand il écoute** : ouvrez la conversation au mot « Cornelius » pour tout le monde. La caméra reste alors éteinte en veille.
- Ajoutez `--force-prefers-reduced-motion` à la commande qui lance Chromium : l’orbe ne se redessine plus que quatre fois par seconde.

Pour un Pi 4 très sollicité, une autre solution est de faire tourner Cornelius sur un autre ordinateur de la maison et de garder le Pi comme écran, avec la [caméra du navigateur](../fonctionnalites/camera-navigateur.md) : les images partent alors vers le serveur, qui fait l’analyse.
