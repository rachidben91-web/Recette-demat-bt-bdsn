# Support Journée (VLG) — Persistance des données

## Ce qui est sauvegardé dans Supabase

L'application enregistre une ligne par **jour + site** dans la table `support_journee`.

Champs persistés :
- `jour`
- `site`
- `payload` (JSON complet de la journée)
- `updated_at`
- `updated_by`
- `locked` (utilisé pour bloquer les modifications)

Le `payload` contient :
- les données du tableau **Brief / Débrief** (`act`, `obs`, `briefA`, `briefD`, `debriefA`, `debriefD`, `Grv`),
- l'observation globale (`__GLOBAL_OBS`),
- les **Param Activités** (`__PARAM_ACTIVITIES`).

Les paramètres activités sont sauvegardés dans une **ligne dédiée** de `support_journee` :
- `site = VLG`
- `jour = __PARAM_ACTIVITIES__`
- `payload = { __PARAM_ACTIVITIES: [...] }`

## Données & Historique

L'onglet historique est reconstruit à partir des lignes `support_journee` de Supabase (site VLG), puis remis en cache local.

## Opérations côté Supabase

Aucune table supplémentaire n'est nécessaire pour cette version :
- tout passe par la table existante `support_journee` (champ `payload`),
- il faut simplement être connecté pour que la synchro cloud fonctionne,
- et disposer des droits RLS de lecture/écriture sur `support_journee` pour les utilisateurs concernés.
