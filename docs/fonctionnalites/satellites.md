# Les satellites audio

Cette page explique comment installer un satellite audio dans une autre pièce, le régler et s’en servir. Elle s’adresse à la personne qui installe et règle Cornelius. Le dialogue technique entre Cornelius et un satellite est décrit dans [le protocole des satellites](../developpement/satellites-protocole.md).

## Ce qu’est un satellite

Un satellite est un petit boîtier avec un micro, un haut-parleur et un anneau lumineux, posé dans une autre pièce. On lui parle comme au miroir : « Cornelius, quelle heure est-il ? », et Cornelius répond par son haut-parleur.

- La conversation est **en voix seule** : sans carte ni écran. Avec l’extension caméra locale décrite ci-dessous, une caméra peut fournir des images au serveur.
- **Une seule conversation à la fois** dans la maison : sur le miroir ou sur un satellite. Un satellite qui entend « Cornelius » pendant ce temps clignote en ambre.
- Quand le miroir et un satellite entendent le même « Cornelius », l’appareil qui l’a le mieux entendu répond.
- Pendant la conversation d’un satellite, le miroir reste au repos et affiche « Conversation en cours : » suivi du nom de la pièce.
- La conversation se termine après un silence (réglage **Fin de parole** de **Quand il écoute**, 20 secondes par défaut).

Matériel pris en charge : la carte **Waveshare ESP32-S3-AUDIO-Board**, avec le firmware **cornelius-satellite** (dépôt séparé, à compiler et flasher une fois avec ESP-IDF ; voir son README).

## Avant de commencer

- Le modèle du mot d’appel « Cornelius » doit être prêt. Chaque satellite associé écoute ce mot indépendamment du déclenchement choisi pour le miroir : celui-ci peut rester réglé sur le regard ou la présence.
- L’accès depuis le réseau local doit être activé (il l’est par défaut, voir [Accès depuis le réseau local](../utilisation/reseau-local.md)).
- Le satellite rejoint un Wi-Fi en **2,4 GHz**, sur le même réseau que l’ordinateur de Cornelius.
- Le pare-feu de l’ordinateur doit laisser entrer le port `3443` (TCP) et l’annonce du réseau local (mDNS, port `5353` en UDP) pour Node.js.

## Installer un satellite

1. **Branchez le satellite.** Neuf, son anneau respire en bleu : il ouvre un réseau Wi-Fi « **Cornelius-Satellite-XXXX** ».
2. **Choisissez votre Wi-Fi.** Connectez un téléphone à ce réseau. La page de configuration s’ouvre seule (sinon, allez sur `http://192.168.4.1`). Choisissez le Wi-Fi de la maison, saisissez son mot de passe, puis **Enregistrer**. Le satellite redémarre.
3. **Il trouve Cornelius.** Le satellite rejoint votre Wi-Fi et trouve Cornelius tout seul sur le réseau. Son anneau respire en blanc : il attend d’être associé.
4. **Associez-le.** Remettez le téléphone sur votre Wi-Fi habituel. Dans l’administration, **Satellites audio**, la carte « **Nouveaux satellites** » le présente (son nom commence par `cornelius-satellite-`). **Faire clignoter** allume son anneau pour le reconnaître parmi plusieurs. Donnez-lui une pièce, puis **Associer**.

Le satellite reçoit alors sa clé d’accès, redémarre et se connecte : il est prêt. Rien n’est accordé à un satellite tant que personne n’a cliqué sur **Associer**.

Le satellite retient l’identité de Cornelius au moment de l’association, et ne se connecte ensuite qu’à lui. Associez-le donc sur votre propre réseau, quand Cornelius tourne normalement.

## Les réglages d’un satellite

Chaque satellite a sa fiche dans **Administration → Satellites audio**, avec son état (en ligne ou non, version du firmware, micro coupé).

| Réglage | Effet |
|---|---|
| **Pièce** | Le nom affiché sur le miroir pendant sa conversation. |
| **Conversations au nom de** | **Le foyer** par défaut : conversation sans mémoire personnelle. Choisir une personne donne à la conversation sa mémoire et ses outils, quelle que soit la personne qui parle dans la pièce. Un satellite rattaché à une personne peut ouvrir même quand l’ouverture est réservée aux membres du foyer ; les autres ne le peuvent pas, puisqu’ils ne voient personne. |
| **Volume** | De 0 à 10, appliqué aussitôt. |
| **Couleur de l’anneau** | La couleur de l’écoute, de l’ouverture et de la conversation. Les alertes gardent la leur. |
| **Luminosité** | De 0 à 10. À 0, l’anneau ne s’allume plus que pour les alertes. |
| **Veilleuse** | En veille, une lueur faible de la couleur choisie montre que le satellite est prêt. |
| **Écoute attentive** | Le micro reste ouvert pendant que Cornelius parle : on peut lui couper la parole (« attends, plutôt la météo »). Possible seulement avec un satellite qui annule l’écho de son haut-parleur, ce que la fiche indique. Sans elle, le micro est coupé pendant que Cornelius parle. |

**Nouveau jeton** remplace la clé d’accès du satellite : il faudra le réassocier. **Retirer** le déconnecte et oublie son accès.

## L’anneau lumineux

| Anneau | Sens |
|---|---|
| bleu qui respire | réseau de configuration ouvert : choisissez le Wi-Fi |
| bleu qui tourne | recherche du Wi-Fi |
| blanc qui respire | en attente d’association dans l’administration |
| blanc qui clignote | **Faire clignoter** a été demandé |
| orange qui respire | Cornelius injoignable |
| éteint, ou veilleuse | veille |
| couleur choisie, bref | « Cornelius » entendu |
| couleur choisie qui tourne | la conversation s’ouvre |
| couleur choisie, plus vive quand il parle | conversation en cours |
| ambre qui clignote | occupé : une conversation se tient ailleurs |
| rouge | micro coupé |
| rouge qui clignote | remise à zéro |

## Le bouton BOOT

- **Appui bref** : coupe ou rouvre le micro. Micro coupé, le satellite n’envoie plus aucun son, même après un redémarrage. Appuyez de nouveau pour le rouvrir.
- **Tenu 5 secondes** : remise à zéro. Le satellite oublie le Wi-Fi, son accès et ses réglages, puis repart de l’étape 1 de l’installation.

N’appuyez pas sur **RST** en tenant **BOOT** : la carte passerait en mode de programmation (un appui sur **RST** seul la fait repartir).

## Où va le son

- **En veille**, le satellite envoie le son de son micro à l’ordinateur de Cornelius, par le réseau local et chiffré, seulement quand Cornelius écoute « Cornelius ». C’est l’ordinateur qui cherche le mot, avec le même modèle que pour le miroir. Rien ne part sur Internet.
- **Pendant la conversation**, le son passe par l’ordinateur de Cornelius, qui le transmet à OpenAI, comme pour le miroir. La voix de Cornelius revient par le même chemin.
- **Micro coupé** (bouton BOOT), le satellite n’envoie rien.

Voir aussi [Confidentialité](../reference/confidentialite.md).

## Quand il ne répond pas

| Ce qu’on voit | Que faire |
|---|---|
| Anneau bleu qui tourne longtemps | Le Wi-Fi ne répond pas. Après quelques essais, le satellite rouvre son réseau de configuration : vérifiez le mot de passe, et que le réseau est en 2,4 GHz. |
| Anneau orange | Cornelius est éteint, injoignable, ou l’accès depuis le réseau local est désactivé. Vérifiez que Cornelius tourne, et le pare-feu (port `3443`). Le satellite le recherche de lui-même toutes les 30 secondes. |
| Il n’apparaît pas dans « Nouveaux satellites » | Le satellite ne trouve pas Cornelius : vérifiez le pare-feu (mDNS, port `5353` en UDP) et que l’ordinateur est sur le même réseau. |
| « Cornelius » n’ouvre rien | Le modèle du mot d’appel doit être prêt et le micro du satellite ouvert. Si l’ouverture est réservée aux membres du foyer, rattachez le satellite à une personne. |
| Cornelius s’interrompt tout seul | L’écoute attentive est active alors que l’écho n’est pas annulé : désactivez-la dans la fiche du satellite. |

Le journal de Cornelius (rubrique **Journal**) note la connexion de chaque satellite, le mot d’appel entendu et, pendant que Cornelius parle, les mesures d’écho envoyées par le satellite (« Journal du satellite »).

## Voir aussi

- [Le protocole des satellites](../developpement/satellites-protocole.md)
- [Le mot d’appel](mot-d-appel.md)
- [Ouverture et présence](ouverture-et-presence.md)
- [Accès depuis le réseau local](../utilisation/reseau-local.md)
- [Confidentialité](../reference/confidentialite.md)


## Extension caméra Waveshare (locale)

Le firmware upstream est audio. L’extension de cette installation ajoute une caméra OV2640 sur le connecteur de la Waveshare. Les sources reproductibles sont dans `firmware/waveshare-camera/`.

La caméra sert uniquement à décrire la scène. Elle ne reconnaît aucune personne et ne change jamais le profil de conversation : Bureau conserve son profil Cédric configuré dans **Conversations au nom de**. Aucune photo n’est prise au mot d’appel.

Dites « Cornelius », attendez le signal de disponibilité, puis « Que vois-tu ? », « Que tient la personne devant toi ? » ou une question sur un objet. Une seule nouvelle photo du satellite est analysée localement. La caméra du miroir n’est pas utilisée et aucun nom n’est déduit de l’image.

Dans **Satellites audio**, **Décrire la scène** teste l’analyse sans conversation ; **Voir le cadrage** montre une capture ponctuelle pendant 20 secondes. Les JPEG restent en mémoire, sans enregistrement sur disque ni flux vidéo continu. L’image est analysée localement ; la description rejoint le contexte conversationnel OpenAI si la demande est vocale. BOOT coupe le micro et interdit aussi les captures.


## Éclairage propre à chaque satellite

Dans **Satellites audio**, ouvrez **Éclairage de cette pièce** sur la fiche du satellite.

1. Cochez une ou plusieurs **Lampes par défaut** : elles répondent à « allume la lumière » ou « éteins les lampes » sans précision.
2. Pour **toutes les lampes**, choisissez une **pièce Home Assistant**. À chaque demande explicite de toutes les lampes, Cornelius relit ses registres et utilise uniquement les entités du domaine `light` autorisées dans cette pièce. Une affectation de pièce propre à l’entité prime sur celle de son appareil.
3. Les lampes exposées comme prises/interrupteurs (`switch`) s’ajoutent dans **Autres lampes pour toutes les lampes**. Ce groupe manuel peut aussi remplacer la pièce HA. Les lampes par défaut sont toujours incluses. N’y ajoutez pas l’alimentation d’une imprimante ou d’un autre appareil.
4. Cliquez **Enregistrer l’éclairage de…**. Une conversation en cours est refermée pour reprendre avec le nouveau contexte.

Sans pièce précisée, la pièce du satellite actif est utilisée, même si plusieurs satellites partagent le même profil Cédric. Une pièce explicitement nommée reste prioritaire ; « toutes les lampes de la cuisine » peut aussi viser une pièce HA sans satellite. Sans groupe par défaut défini, Cornelius demande de préciser une lampe : il ne doit pas choisir le salon par défaut depuis le bureau.

Seuls les appareils sélectionnés et autorisés dans le module Home Assistant sont proposés et commandés. Choisir une pièce n’élargit pas ces autorisations. Les interrupteurs ne sont jamais traités automatiquement comme des lampes : cochez ceux qui commandent un éclairage. Si les registres de pièces sont indisponibles, les groupes entièrement manuels restent utilisables. Une pièce HA configurée mais devenue indisponible bloque la commande « toutes » au lieu de produire une liste incomplète.

Le serveur résout la liste des entités, supprime les doublons et appelle les commandes individuelles existantes ; aucune commande globale à toute la maison n’est envoyée. Un résultat partiel ou non confirmé est signalé sans réessai automatique. Ce réglage concerne l’allumage/extinction ; pour une commande particulière ou un autre appareil, précisez son nom.
