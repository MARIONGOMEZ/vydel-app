# Vydel — appli d’essai (app.vydel.fr)

Copie publique de l’appli Vydel pour l’essai gratuit de 14 jours, servie sur https://app.vydel.fr/ (GitHub Pages, branche `main`, racine).

- Accueil : « Tester Vydel 14 jours » crée un cabinet (PIN de 6 chiffres) et démarre un essai de 14 jours daté de la création. Statut et date de fin dans le menu. Rien n’est bloqué à la fin de l’essai pour l’instant.
- « Rejoindre le cabinet » : collègue d’un cabinet existant, avec le PIN (et le lien d’invitation si reçu).
- Notifications (1.99.4) : menu → « Activer les notifications » ; « Nouvelle transmission dans ton cabinet » / « Nouveau message dans ton cabinet », sans nom ni texte. Serveur d’envoi : https://vydel-push.vydel-push.workers.dev (Cloudflare Worker). iPhone : iOS 16.4+, appli ajoutée à l’écran d’accueil.
- Photos de documents (1.99.6) : une copie chiffrée sur le téléphone (clé du cabinet) est gardée en ligne (Cloudflare Worker https://vydel-photos.vydel-push.workers.dev, KV) ; le serveur ne reçoit que des blocs illisibles sous un nom HMAC non devinable, effacés à la suppression ou à leur date d’effacement.
- 1.99.14 (branche associe, non publiée) : l’administrateur est l’associé qui a créé le cabinet, son abonnement est celui du cabinet ; les autres associés profitent de l’essai du cabinet, puis 14,99 €/mois ; « Payer pour cet associé » dans Personnes (l’administrateur peut payer pour l’associé, et l’associé peut payer aussi, de son côté, indépendamment) ; pas de second paiement d’un abonnement déjà payé.
- 1.99.13 (branche associe, non publiée) : à l’arrivée dans un cabinet, chacun indique « Associé(e) », « Remplaçant(e) » ou « Déjà membre ». Remplaçant : en attente (tournée cachée) jusqu’à la validation par l’administrateur (Personnes du cabinet → Arrivées), 2 au plus. Associé : son propre abonnement Stripe de 14,99 €/mois (place d’associé sur le Worker vydel-essai, client_reference_id m_<mid>), accès ouvert par le webhook ; l’administrateur peut passer un remplaçant associé ; invitation « Associé(e) » (hors limite des remplaçants) ; CGU 11.
- 1.99.12 : menu admin, entrée et titre de la fenêtre : retour au libellé « Proposer l’essai 14 jours ».
- 1.99.11 : adresse de contact contact@vydel.fr (CGU, fin d’essai, abonnement, messages d’erreur de l’essai et du paiement).
- 1.99.10 : essai de 14 jours émis par le serveur (Worker vydel-essai) à la création du cabinet, un par téléphone ; lien d’essai unique https://app.vydel.fr/essai (« Copier le lien d’essai », « Partager ») ; menu admin : « Démarrer l’essai de 14 jours » et « Inviter un remplaçant » (2 au plus) ; « Gérer / résilier mon abonnement » (vydel.fr/resilier.html) ; bandeau + notification J-2 ; à J+14 sans abonnement, appli bloquée (Exporter mes données pendant 30 jours, Souscrire) ; écran Souscrire 14,99 € par mois (Stripe Payment Link), débloqué dès le paiement ; CGU 10 « Essai gratuit et abonnement ».
- 1.99.9 : plusieurs cabinets sur le même téléphone : rejoindre un autre cabinet (lien d’invitation) l’ajoute sans écraser le cabinet déjà présent ; dès 2 cabinets, l’appli s’ouvre sur « Vos cabinets » ; un PIN par cabinet ; « Changer de cabinet ». Avec un seul cabinet, rien ne change.
- 1.99.7 : fenêtre « Autoriser les notifications » au lancement (Autoriser / Refuser ; aussi si la permission était déjà accordée sans abonnement) ; rejoindre avec une invitation : tous les relais lus en parallèle, état chiffré copié sur chaque relais, messages d’erreur précis ; Transmissions / Planning / Messages : date du jour seule, sans flèches.
- Vydel est une checklist de passages pour IDEL, pas un dossier médical : pas de notes cliniques.

Contact : contact@vydel.fr

Version : 1.99.14-app (branche associe, non publiée). © 2026 Orva Labs.
