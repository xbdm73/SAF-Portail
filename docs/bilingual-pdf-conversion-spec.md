# SAF Documents compagnie — conversion PDF bilingue (spécification)

Statut : conception, non déployé.

## Objectif
Importer un PDF anglais et préparer une vue HTML anglais/français, sans jamais réécrire l'anglais. Conserver le PDF binaire original, son empreinte SHA-256 et ses métadonnées d'édition/révision.

## Workflow
1. Importer le PDF dans un espace privé avec permissions existantes. Calculer SHA-256.
2. Extraire blocs de texte avec coordonnées, ordre de lecture, tableaux, images, pages et avertissements d'extraction. Ne jamais demander à l'IA de reconstituer ou de corriger le texte anglais.
3. Associer chaque bloc à un identifiant stable et à sa page source. Traduire seulement vers le français.
4. Produire HTML sûr (échappement du texte, sanitation) et styles séparés. Vues EN, FR et EN+FR. En bilingue, afficher le français sous l'anglais, plus petit et en italique.
5. Comparer automatiquement chaque bloc anglais HTML au texte anglais extrait, de façon stricte (caractère par caractère, sans normalisation silencieuse). Vérifier l'exhaustivité des blocs, l'ordre, les pages, les tableaux, les notes et les légendes.
6. Si extraction ambiguë, PDF scanné, bloc manquant, différence ou contrôle visuel non effectué : statut À vérifier; publication bloquée.
7. Validation humaine du rendu anglais face au PDF et validation séparée de la traduction française. Journaliser validateur, date, empreinte et révision.
8. Publier uniquement après validations. Conserver lien vers PDF original et historique des révisions.

## Statuts
DRAFT, PROCESSING, NEEDS_REVIEW, VERIFIED_EN, APPROVED_FR, PUBLISHED, FAILED.

## Sécurité
Appliquer les droits existants du portail; ne jamais exposer les PDF ni les traductions via un stockage public. Ne jamais placer de clé secrète de traduction dans le navigateur. Examiner le fournisseur de traduction et le traitement des données avant tout envoi de documents compagnie.

## Critères d'acceptation
- Un PDF original peut être téléchargé et sa somme SHA-256 est stable.
- Aucun bloc anglais ne peut être édité via le workflow de traduction.
- Une différence d'un seul caractère bloque la validation automatique.
- Une page scannée ou une extraction incomplète exige une vérification humaine.
- Un document non validé n'est jamais publié.
- L'ancienne révision reste accessible selon les règles de gestion documentaire.
- Les permissions de lecture seule restent respectées.

## Prochaine intégration
Identifier le composant réel « Documents compagnie », le modèle de métadonnées et le stockage du portail; adapter ce workflow à leur architecture avant d'écrire le code applicatif.
