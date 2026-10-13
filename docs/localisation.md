# Ajouter et maintenir les traductions

## Structure

`src/i18n/index.ts` découvre les fichiers `src/i18n/locales/*/meta.json`
et les catalogues JSON de chaque dossier. L'allemand reste la langue source.
Les clés sont les textes allemands ; les valeurs sont leurs traductions.
`ui.json` contient l'interface, `measurements.json` les mesures et
`runtime.json` les messages et exports. `common.json` complète les textes communs.
Ne définissez pas la même clé avec deux traductions différentes.

Pour ajouter l'espagnol, par exemple, créez `src/i18n/locales/es/meta.json` :

```json
{ "code": "es", "name": "Español", "locale": "es-ES" }
```

Copiez les catalogues anglais dans ce dossier et traduisez leurs valeurs,
sans modifier les clés. Tous les fichiers JSON de ce dossier, sauf `meta.json`,
sont regroupés automatiquement. Redémarrez le serveur après avoir ajouté un
nouveau dossier. Le sélecteur affichera alors la nouvelle langue.
Pour une écriture de droite à gauche, ajoutez `"direction": "rtl"` aux métadonnées.

## Textes et paramètres

```json
{
  "Hüfte": "Cadera",
  "Krankenhaus: {0}": "Hospital: {0}"
}
```

Gardez tous les paramètres (`{0}`, `{1}` ou les noms tels que `{count}`) présents
dans la clé. Leur ordre peut changer, mais aucun ne doit être supprimé ou ajouté.
Les espaces successifs des clés sont normalisés en un espace.

Pour un nouveau texte dans un composant React :

```tsx
import { t, translate } from '../i18n'
const label = translate('Hüfte')
const description = t('Krankenhaus: {0}', { 0: hospitalName })
```

`t` insère les paramètres tels quels : utilisez-le pour les noms et valeurs
libres. `translateText` traite aussi les anciennes phrases assemblées et leurs
paramètres, uniquement à la frontière d'affichage. Ne traduisez jamais les
discriminants, identifiants, clés de stockage, valeurs sérialisées ou entrées
utilisées dans un calcul/comparaison. Ne traduisez pas les notes ou données
saisies par l'utilisateur.

L'abonnement à la langue est dans `App` ; son changement actualise les composants
sans réinitialiser les mesures. Les libellés des recettes restent en allemand
en mémoire et sont traduits lorsqu'ils sont affichés. Pour un composant monté
hors de `App`, utilisez `useLanguage()` pour suivre les changements.

## Choix de langue et repli

Ordre de sélection au démarrage : `?lang=...`, préférence mémorisée, langues du
navigateur, allemand. `fr-FR` et `en-US` sont reconnus via leur code principal.
Le changement est enregistré sous `cendova-plan-language` dans `localStorage`.
Si le stockage est bloqué, l'application continue de fonctionner.

Un texte absent du catalogue sélectionné utilise l'anglais s'il existe,
puis son texte allemand original. L'interface demeure donc lisible pendant
la préparation d'une nouvelle traduction. Aucun service de traduction distant
n'est utilisé.

## Nombres, dates et PDF

`src/lib/zahlFormat.ts` choisit le séparateur décimal selon la langue sans
changer les nombres ou les règles d'arrondi. `getLocale()`, `formatDate()` et
`formatDisplayDate()` servent aux dates affichées. Les dates enregistrées
restent compatibles avec les plans existants.

Le PDF traduit ses libellés avant la mise en page et le retour à la ligne.
Sa police standard couvre les accents français et les caractères Latin-1.
Les ligatures `œ` sont transcrites `oe`. Une langue utilisant une autre écriture
nécessite aussi une police Unicode intégrée au PDF et des tests de glyphes ;
le navigateur n'a pas cette restriction.

## Vérification

```sh
node scripts/i18n-inventory.mjs
npm run verify
```

L'inventaire fournit des candidats dans `.test-artifacts/i18n/source-*.json`.
Certains sont des identifiants techniques à exclure ; ce n'est pas une liste
à traduire aveuglément. Les tests vérifient les paramètres, la cohérence des
catalogues et la préservation des valeurs enregistrées.

Après ajout d'une langue, les tests `index.test.ts` limités à `fr` et `en`
continuent de vérifier ces deux catalogues. Les paramètres de toutes les langues
sont vérifiés ; ajoutez les contrôles de couverture de votre nouvelle langue.
Vérifiez aussi les trois modules, les dialogues, les aides, un changement de
langue pendant une mesure, le rechargement et les exports PDF avec les images
d'exemple. Utilisez uniquement des données synthétiques pour les tests.
