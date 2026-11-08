# Bezetting abdomenradiologie (Amsterdam UMC)

Een MT-overzicht en twee dashboards over de FTE-bezetting van stafleden en fellows in de groep Abdomen,
op basis van het Medspace-rooster (week 1 2023 t/m week 44 2026).

- **[MT-overzicht](index.html)**: in één scherm hoe de sectie ervoor staat: kerncijfers, signalen en trend.
- **[Bezetting abdomenradiologie](bezetting.html)**: interactief overzicht van FTE per taak per periode.
- **[Analyse verslag – retrospectief](analyse.html)**: analyse van de tijd voor abdomen verslag 2023–2026, met vergelijking van jaren of zelfgekozen periodes, spoeddekking en afwezigheid.
- **[Analyse verslag – prospectief](vooruitblik.html)**: geplande verslagcapaciteit nov–dec 2026 t.o.v. eerdere jaren en sep–okt 2026 (planning, stand 8 november 2026).

Online via GitHub Pages: https://jwk-md-rad.github.io/AbdAUMC/

## Wachtwoord

De inhoud van de pagina's en de data staan **versleuteld** in deze repo (AES-256-GCM,
sleutel afgeleid van het wachtwoord met PBKDF2-SHA256, 600.000 rondes). Zonder
wachtwoord zijn de cijfers, teksten en de CSV niet leesbaar, ook niet in de broncode
op GitHub. Na het inloggen ontsleutelt de browser alles lokaal.

- Het wachtwoord geldt per tabblad; met *Onthouden op dit apparaat* blijft het bewaard.
  *Uitloggen* (bovenaan de pagina) wist het weer.
- De beveiliging is zo sterk als het wachtwoord: kies een lange zin, niet een kort woord.
- Wachtwoord wijzigen = opnieuw bouwen (zie hieronder) met het nieuwe wachtwoord.
  Wie het oude wachtwoord kent, kan oude versies uit de git-geschiedenis nog openen.

## Structuur

| Pad | Inhoud |
| --- | --- |
| `index.html`, `bezetting.html`, `analyse.html`, `vooruitblik.html` | Wachtwoordscherm; de inhoud staat versleuteld in `data/` |
| `data/*.enc.js` | Versleutelde pagina-inhoud en data (rooster 2023–okt 2026 en de planning nov–dec 2026) |
| `src.enc` | Versleutelde kopie van de leesbare bronnen (`src/`) |
| `assets/gate.js` | Ontsleutelt na het inloggen |
| `assets/dash.js` | Kleine data-laag die de CSV inleest en de grafieken tekent |
| `assets/theme.css` | Kleuren en opmaak (licht en donker) |
| `assets/d3.v7.9.0.min.js` | d3 v7.9.0 (ISC-licentie), voor de grafieken |
| `tools/build.mjs` | Bouwt en versleutelt de site (Node 18+, geen extra pakketten) |

## Bijwerken

De leesbare bronnen staan in `src/`, dat **niet** in git staat (zie `.gitignore`).

```sh
# 1. Bronnen terugzetten uit src.enc (vraagt om het wachtwoord)
node tools/build.mjs --unpack

# 2. Pas src/index.html, src/bezetting.html, src/analyse.html, src/vooruitblik.html, src/bezetting-abdomen-2023-2026.csv
#    of src/vooruitblik-nov-dec-2026.csv (geplande weken; niet in de hoofd-CSV zetten) aan

# 3. Opnieuw versleutelen en de pagina's bouwen (vraagt om het wachtwoord)
node tools/build.mjs

# 4. Committen en pushen (src/ blijft buiten git)
```

Lokaal bekijken: start een webserver in de repo (bijv. `python3 -m http.server`)
en open http://localhost:8000.

## Werkwijze in het kort

Eén dagdeel (ochtend of middag op een werkdag) telt als 0,1 FTE; een dagdeel met twee taken telt half voor elk.
Avond-, nacht- en weekenddiensten staan apart, in dagdelen. Het rooster is planning, geen productie.
Zie de secties *Werkwijze* en *Kanttekeningen* op de pagina's.
