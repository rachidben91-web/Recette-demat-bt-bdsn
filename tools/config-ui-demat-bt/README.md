# Config UI DEMAT-BT (appli autonome)

Application web locale séparée du site DEMAT-BT.

## But
- Préparer des ajustements visuels (thème/tokens) **sans intégrer** l'éditeur dans le site principal.
- Générer des artefacts exploitables manuellement dans le repo recette.

## Lancer
- Ouvrir `tools/config-ui-demat-bt/index.html` directement.
- Ou via serveur statique:
  - `python3 -m http.server 4180` puis `http://localhost:4180/tools/config-ui-demat-bt/`

## Sorties générées
- `ui-demat-bt.generated.json`
- `config-ui-demat-bt.override.generated.css`
- `integration-notes.generated.md`

## Réutilisation manuelle (recommandée)
1. Revoir le CSS généré.
2. Copier le JSON et le CSS vers le repo recette (ou dossier de travail local).
3. Si besoin, faire une intégration minimale volontaire côté DEMAT-BT (hors périmètre de cette appli autonome).

## Périmètre V1
- Couleurs, fonds, cartes, bordures, rayons, ombres.
- Espacements, densité, typo de base.
- Tailles de grilles/cartes Référent via sélecteurs existants.
