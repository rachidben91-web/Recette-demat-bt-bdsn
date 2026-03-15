# Donnees sensibles

Les fichiers d'annuaire RH ne doivent plus etre versionnes ni servis par le front.

Fichiers interdits dans ce depot public/app front:

- `agents-mails.json`
- `agents-mails-techniciens-vlg.json`

Motif:

- ils exposent des donnees personnelles et organisationnelles
- toute ressource chargee par le navigateur doit etre consideree comme publique

Le flux "Generer PDF + preparer mail" ouvre maintenant un brouillon sans destinataire pre-rempli.
Le destinataire doit etre ajoute manuellement depuis un annuaire protege ou depuis Outlook.
