# Plan de Remediation du Depot

## Objectif

Transformer le depot en application plus sure, plus maintenable et plus simple a faire evoluer, sans faire de "big bang".

## Regles de conduite

- Travailler par lots courts et verifiables.
- Traiter d'abord la confidentialite, le rendu HTML et l'integrite des donnees.
- Eviter les grosses refontes sans filet.
- Ajouter un critere de fin clair a chaque etape.

## Phase 0 - Preparation

### Etape 0.1 - Poser le cadre de travail

- But: definir l'ordre des travaux et les zones sensibles avant toute modif.
- Fichiers cibles: `PLAN_REMEDIATION.md`, future `README.md`.
- Critere de fin: le backlog est valide et l'ordre de demarrage est fixe.

### Etape 0.2 - Faire un inventaire technique minimal

- But: lister les dependances, les flux de donnees, les caches et les points d'entree.
- Fichiers cibles: `index.html`, `js/main.js`, `js/supabase.js`, `js/cache.js`, `js/ui/support.js`, `js/export.js`.
- Critere de fin: on sait quelles donnees sont publiques, locales ou Supabase.

## Phase 1 - Securite critique

### Etape 1.1 - Sortir les donnees RH du bundle public

- But: supprimer l'exposition des emails, telephones, managers et NNI depuis le front.
- Fichiers cibles: `data/agents-mails-techniciens-vlg.json`, `data/agents-mails.json`, `js/export.js`.
- Action attendue: remplacer les JSON publics par une source protegee ou une vue fortement reduite.
- Critere de fin: aucune donnee RH sensible n'est servie telle quelle au navigateur.

### Etape 1.2 - Purger les donnees locales a la deconnexion

- But: eviter qu'un utilisateur suivant retrouve les PDF et l'historique local.
- Fichiers cibles: `js/supabase.js`, `js/cache.js`, `js/ui/support.js`, `js/main.js`.
- Action attendue: vider `localStorage`, `IndexedDB` et tout cache metier au logout.
- Critere de fin: apres deconnexion, un rechargement de page ne restaure aucune donnee precedente.

### Etape 1.3 - Bloquer la formula injection CSV

- But: empecher qu'un export ouvert dans Excel execute une formule dangereuse.
- Fichiers cibles: `js/ui/support.js`.
- Action attendue: neutraliser les cellules commencant par `=`, `+`, `-` ou `@`.
- Critere de fin: l'export CSV prefixe les valeurs a risque et reste lisible.

### Etape 1.4 - Verrouiller les champs persistables avant rendu

- But: empecher qu'une donnee stockee dans Supabase ou `localStorage` casse le HTML.
- Fichiers cibles: `js/ui/support.js`, `js/weather.js`, `js/main.js`.
- Action attendue: valider `color`, labels, attributs et remplacer les interpolations dangereuses.
- Critere de fin: aucune valeur metier modifiable par l'utilisateur n'entre brute dans `innerHTML` ou un attribut `style`.

### Etape 1.5 - Remplacer les rendus HTML les plus sensibles par du DOM natif

- But: reduire fortement la surface XSS.
- Fichiers cibles: `js/ui/support.js`, `js/weather.js`, `js/ui/brief.js`.
- Action attendue: migrer en priorite les zones venant de Supabase, du cache local ou des formulaires.
- Critere de fin: les ecrans Support et historique n'utilisent plus `innerHTML` pour des donnees persistables.

### Etape 1.6 - Auditer les politiques Supabase et le mecanisme de verrou

- But: verifier que la securite ne repose pas uniquement sur le client.
- Fichiers cibles: `js/supabase.js`, plus futur dossier infra si ajoute.
- Action attendue: verifier RLS, droits lecture/ecriture, portee des tables et solidite des verrous.
- Critere de fin: les contraintes critiques sont enforcees cote base ou via RPC, pas seulement en JS.

## Phase 2 - Integrite des donnees

### Etape 2.1 - Utiliser `NNI` ou `id` comme cle metier du support

- But: ne plus indexer les journees et l'historique par nom affiche.
- Fichiers cibles: `js/ui/support.js`, `data/technicians.js`, eventuellement les payloads Supabase existants.
- Action attendue: stocker les lignes par identifiant stable et afficher le nom seulement dans l'UI.
- Critere de fin: un changement de nom n'affecte ni l'historique ni la sauvegarde.

### Etape 2.2 - Versionner les payloads metier

- But: eviter la derive silencieuse des schemas `payload`, `_meta`, `_lock`, `activities`, `history`.
- Fichiers cibles: `js/supabase.js`, `js/ui/support.js`, `js/brief-journee.js`, `js/state.js`.
- Action attendue: ajouter une version de schema et un passage de normalisation.
- Critere de fin: chaque chargement passe par une fonction de validation/migration.

### Etape 2.3 - Scoper le cache local par utilisateur

- But: separer les donnees de deux sessions ou utilisateurs differents sur le meme poste.
- Fichiers cibles: `js/cache.js`, `js/ui/support.js`, `js/main.js`, `js/supabase.js`.
- Action attendue: prefixer les cles locales par site et utilisateur, avec expiration si besoin.
- Critere de fin: un utilisateur ne lit jamais le cache d'un autre.

### Etape 2.4 - Nettoyer les donnees legacy

- But: supprimer les doublons et incoherences historiques.
- Fichiers cibles: `js/ui/support.js`, `js/supabase.js`, eventualles donnees de migration.
- Action attendue: normaliser les activites, l'historique et les snapshots de journee.
- Critere de fin: les structures chargees sont homogenes quel que soit leur age.

## Phase 3 - Architecture front

### Etape 3.1 - Supprimer les handlers inline du HTML

- But: decoupler `index.html` de la logique JS et preparer une vraie CSP.
- Fichiers cibles: `index.html`, `js/main.js`, `js/ui/support.js`.
- Action attendue: remplacer `onclick`, `oninput`, `onmouseover`, `onmouseout`, `onchange` par des `addEventListener`.
- Critere de fin: aucun handler inline n'est requis pour l'application principale.

### Etape 3.2 - Passer les scripts en modules ES

- But: reduire la dependance au global `window` et a l'ordre de chargement.
- Fichiers cibles: `index.html`, dossier `js/`.
- Action attendue: introduire un point d'entree unique et des imports explicites.
- Critere de fin: l'app demarre via un point d'entree module et les dependances sont explicites.

### Etape 3.3 - Decouper `support.js`

- But: casser le monolithe principal.
- Fichiers cibles: `js/ui/support.js`.
- Decoupage vise: `support-state`, `support-table`, `support-history`, `support-activities`, `support-weather`, `support-print`.
- Critere de fin: le fichier actuel est remplace par plusieurs modules plus petits avec responsabilites claires.

### Etape 3.4 - Decouper `supabase.js`

- But: separer auth, stores et logique de concurrence.
- Fichiers cibles: `js/supabase.js`.
- Decoupage vise: `auth`, `support-store`, `brief-store`, `settings-store`, `status-store`.
- Critere de fin: la couche Supabase est lisible, testable et moins couplee a l'UI.

### Etape 3.5 - Recentrer `main.js` sur l'orchestration

- But: garder `main.js` comme point d'assemblage et non comme mega-controleur.
- Fichiers cibles: `js/main.js`.
- Action attendue: sortir les helpers UI globaux, les listeners et les flux metier vers des modules dedies.
- Critere de fin: `main.js` ne fait plus que l'initialisation et le branchement des modules.

## Phase 4 - Dependances et hygiene du depot

### Etape 4.1 - Eliminer les dependances CDN inutiles

- But: fiabiliser l'app et reduire le risque supply chain.
- Fichiers cibles: `index.html`, `js/pdf-extractor.js`, `libs/`.
- Action attendue: utiliser les libs locales deja presentes ou ajouter un mecanisme de versioning/SRI.
- Critere de fin: l'application critique fonctionne sans CDN externe non controle.

### Etape 4.2 - Nettoyer les doublons et artefacts

- But: simplifier l'arborescence et eviter les ambiguities.
- Fichiers cibles: `technicians.js`, `data/technicians.js`, `assets/`.
- Action attendue: supprimer les doublons et archiver ou retirer les assets legacy non utilises.
- Critere de fin: une seule source par donnee et un dossier assets plus propre.

### Etape 4.3 - Reduire le poids des assets

- But: alleger le depot et les chargements.
- Fichiers cibles: `assets/logo-home.svg`, `assets/*.png`, `favicon*`.
- Action attendue: compresser, dedoublonner et choisir un format adapte.
- Critere de fin: les assets les plus lourds ont ete revises et justifies.

## Phase 5 - Qualite et documentation

### Etape 5.1 - Ajouter un `README.md` racine

- But: documenter l'architecture, les flux et les prerequis.
- Fichiers cibles: futur `README.md`.
- Critere de fin: un nouveau contributeur comprend en 10 minutes comment lancer et modifier l'app.

### Etape 5.2 - Introduire un outillage minimal

- But: disposer d'un cadre de qualite simple.
- Fichiers cibles: futur `package.json`, future config lint/format.
- Action attendue: ajouter ESLint, Prettier et scripts de verification.
- Critere de fin: on peut lancer une verification standard avant chaque livraison.

### Etape 5.3 - Ajouter des tests cibles

- But: proteger les zones metier les plus fragiles.
- Fichiers cibles: extraction PDF, normalisation de donnees, classification, export.
- Action attendue: tester les fonctions pures en priorite.
- Critere de fin: les regressions critiques sont couvertes par quelques tests utiles.

### Etape 5.4 - Poser des types ou du JSDoc fort

- But: rendre les objets BT, activite, support et journee plus fiables.
- Fichiers cibles: `js/state.js`, `js/brief-journee.js`, `js/supabase.js`, `js/ui/support.js`.
- Critere de fin: les structures principales sont documentees et normalisees.

## Ordre recommande de demarrage

1. Etape 1.1
2. Etape 1.2
3. Etape 1.3
4. Etape 1.4
5. Etape 2.1
6. Etape 3.1
7. Etape 3.3
8. Etape 3.4
9. Etapes 4.x
10. Etapes 5.x

## Premier lot ideal

Le meilleur premier lot pour commencer sans se disperser est:

- sortir les donnees RH du front
- purger les caches au logout
- securiser l'export CSV
- valider les couleurs et supprimer les `innerHTML` les plus dangereux
- remplacer la cle "nom technicien" par `NNI`

## Definition de "pret a commencer"

Le plan est pret quand:

- le lot de depart est accepte
- on choisit la premiere etape
- on la traite seule, de bout en bout

Quand on commence, la meilleure premiere tache est l'etape 1.1.
