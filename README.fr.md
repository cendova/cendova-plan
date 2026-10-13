# CendovaPlan

[Deutsch](README.md) · [Français](README.fr.md) · [English](README.en.md)

Application de planification de prothèses de hanche, de genou et d'épaule à
partir d'images DICOM. Les images sont traitées localement dans le navigateur.
Projet d'apprentissage et de recherche, sans certification CE et non destiné
à l'utilisation clinique : voir [DISCLAIMER.md](DISCLAIMER.md).

## Développement local

Après avoir cloné ce dépôt, ouvrez un terminal dans son dossier. Node.js et npm
doivent être installés.

```sh
npm ci
npm run dev
```

Ouvrez l'adresse indiquée par le serveur, généralement
<http://localhost:5173/>. Pour vérifier le code, les tests et la compilation :

```sh
npm run verify
```

## Langues

Choisissez **Français**, **English** ou **Deutsch** dans la barre supérieure.
Le choix est mémorisé dans ce navigateur. Le paramètre d'URL `?lang=fr`,
`?lang=en` ou `?lang=de` permet de choisir directement une langue. Au démarrage,
l'application consulte ce paramètre, la préférence mémorisée, les langues du
navigateur, puis utilise l'allemand.

L'interface, les instructions de mesure, les messages et les exports PDF sont
localisés. Les noms, notes, données saisies, références de produits et valeurs
enregistrées dans les plans sont conservés. Les calculs ne dépendent pas de la
langue. Les calques de fabricants doivent être importés séparément dans un
paquet local ; voir [docs/schablonen-pakete.md](docs/schablonen-pakete.md).

## Ajouter une langue

Créez un dossier dans `src/i18n/locales/` contenant un fichier `meta.json` et
des catalogues JSON traduits. Les dossiers de langue sont découverts
automatiquement. L'allemand reste la langue source et les paramètres des
messages doivent être conservés. Consultez le
[guide de localisation](docs/localisation.md) pour le format, les règles de
repli et les vérifications.

La police standard du PDF couvre les accents français et les caractères
Latin-1 ; `œ` est transcrit `oe`. Une langue utilisant une autre écriture
nécessite aussi une police Unicode intégrée au PDF.

Source : [cendova/cendova-plan](https://github.com/cendova/cendova-plan).
Licence Apache-2.0 ; attribution originale conservée dans [NOTICE](NOTICE).
