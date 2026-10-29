# Demarrage automatique Cornelius sur ce PC

Tache Windows : Cornelius-Serveur, utilisateur courant, sans elevation ni mot de passe stocke.
Demarrage a l'ouverture de session ; controle toutes les minutes, execution manquee reprise des que possible, alimentation batterie autorisee. Ne reveille pas le PC et ne lance aucun navigateur.
Serveur HTTP indisponible : relance par scripts/start.ps1. Perception absente : demarrage du worker. Perception deconnectee pendant 120 secondes : relance du seul worker de cette installation.

Validation : tache executee avec code 0, /api/health=ok, perception=true, wakeReady=true. Seconde execution conserve les memes PID. Un cycle reel veille/reveil n'a pas ete provoque pour ne pas interrompre le PC ; reprise configuree, a confirmer lors de la prochaine veille.

Limite : la session Windows doit etre ouverte. Le lancement avant connexion necessite une installation avec privileges administrateur.

Desactiver : Disable-ScheduledTask -TaskName Cornelius-Serveur
Reactiver : Enable-ScheduledTask -TaskName Cornelius-Serveur
Retirer : Unregister-ScheduledTask -TaskName Cornelius-Serveur -Confirm:$false
L'arret manuel avec scripts/stop.ps1 ne persiste que si la tache est desactivee (sinon relance au controle suivant).
Export de la tache : data/run/Cornelius-Serveur.xml. Journal : data/run/logs/autostart.log.
