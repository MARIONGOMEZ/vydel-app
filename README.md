# Vydel — appli d’essai (app.vydel.fr)

Copie publique de l’appli Vydel pour l’essai gratuit de 14 jours, servie sur https://app.vydel.fr/ (GitHub Pages, branche `main`, racine).

- Accueil : « Tester Vydel 14 jours » crée un cabinet (PIN de 6 chiffres) et démarre un essai de 14 jours daté de la création. Statut et date de fin dans le menu. Rien n’est bloqué à la fin de l’essai pour l’instant.
- « Rejoindre le cabinet » : collègue d’un cabinet existant, avec le PIN (et le lien d’invitation si reçu).
- Notifications (1.99.4) : menu → « Activer les notifications » ; « Nouvelle transmission dans ton cabinet » / « Nouveau message dans ton cabinet », sans nom ni texte. Serveur d’envoi : https://vydel-push.vydel-push.workers.dev (Cloudflare Worker). iPhone : iOS 16.4+, appli ajoutée à l’écran d’accueil.
- Photos de documents (1.99.6) : une copie chiffrée sur le téléphone (clé du cabinet) est gardée en ligne (Cloudflare Worker https://vydel-photos.vydel-push.workers.dev, KV) ; le serveur ne reçoit que des blocs illisibles sous un nom HMAC non devinable, effacés à la suppression ou à leur date d’effacement.
- 1.99.7 : fenêtre « Autoriser les notifications » au lancement (Autoriser / Refuser ; aussi si la permission était déjà accordée sans abonnement) ; rejoindre avec une invitation : tous les relais lus en parallèle, état chiffré copié sur chaque relais, messages d’erreur précis ; Transmissions / Planning / Messages : date du jour seule, sans flèches.
- Vydel est une checklist de passages pour IDEL, pas un dossier médical : pas de notes cliniques.

Version : 1.99.7-app. © 2026 Orva Labs.
