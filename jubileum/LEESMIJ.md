# Eén jaar, geteld — Floris & Sofia, 9 december

Een script dat je WhatsApp-chat telt en er een pagina (telefoon) en een A3-poster van maakt.
Alles draait **op je eigen computer**. Er gaat niets het internet op, en er komt geen enkel bericht op de pagina, alleen getallen.

## Wat er in deze map zit

| Bestand | Wat |
|---|---|
| `receipts.py` | Het script: leest de export, telt, controleert en maakt de pagina's |
| `sjabloon.html` | Het ontwerp (crème papier, serif, één tan accentkleur) |
| `instellingen.json` | Namen, datums, jullie momenten, je eigen tekst |
| `.gitignore` | Zorgt dat je chat en de uitkomsten nooit per ongeluk op GitHub komen |

## Stap 1 — Chat exporteren (telefoon)

1. Open de chat met Sofia → tik op haar naam → **Chat exporteren** → **Zonder media**.
2. Stuur het bestand naar jezelf (AirDrop of mail naar jezelf) en zet de `.txt` of `.zip` in deze map.

**Zonder media** is goed: foto's, video's en spraakberichten worden toch geteld.

## Stap 2 — Instellingen invullen

Open `instellingen.json`:

- `jij` / `zij`: jullie namen **precies zoals ze in de export staan**. Weet je het niet? Laat leeg en draai het script. Het laat dan de namen zien.
- `momenten`: 3 tot 5 dingen die ertoe doen, met datum. Die komen als genummerde bolletjes in de grafiek per maand. **Hier maak je het persoonlijk.** Voorbeeld:
  ```json
  "momenten": [
    { "datum": "2025-12-09", "tekst": "Officieel samen" },
    { "datum": "2026-02-14", "tekst": "Eerste Valentijn" },
    { "datum": "2026-07-20", "tekst": "Samen naar Parijs" }
  ]
  ```
- `persoonlijke_tekst`: een korte brief aan Sofia (gebruik `\n` voor een nieuwe regel). Hij komt in handschrift onder de getallen. Leeg = verborgen. **Schrijf deze zelf, niet met AI.** Dat merkt ze.
- `woorden_tellen`: jullie bijnamen of inside jokes, bijvoorbeeld `["schat", "babe"]`. Elk woord krijgt een eigen tegel.
- `verberg`: onderdelen weglaten, bijvoorbeeld `["wie"]` als de verdeling wie-appt-meer pijnlijk scheef is. Mogelijk: `voor`, `wie`, `vorm`, `week`, `emoji`, `records`, `brief`.
- `link_voor_qr`: pas invullen als de site online staat (stap 5). Dan komt de QR-code op de poster.

## Stap 3 — Draaien

Open deze map in Terminal en typ:

```
python3 receipts.py "WhatsApp-chat met Sofia.txt"
```

Of laat Claude Code het doen. Open deze map, typ `claude` en plak:

> Draai `python3 receipts.py` op het WhatsApp-exportbestand in deze map. Lees het bestand alleen, upload niets. Als de namen in instellingen.json niet kloppen, vul ze in zoals het script ze toont en draai opnieuw. Laat me daarna de samenvatting en eventuele waarschuwingen zien, en controleer het totaal en de verdeling met een tweede, eigen telmethode. Zet nooit berichttekst in stats.json.

Je krijgt:
- `stats.json`: alleen getallen
- `jubileum.html`: de pagina voor op haar telefoon (open hem gewoon in je browser)
- `poster.html`: de A3-poster

**Lees de waarschuwingen.** Het script controleert zelf of het eerste bericht verdacht laat is (WhatsApp kapt lange chats soms af), of er meer dan 2 afzenders zijn, en of er nul keer "hou van je" is gevonden (dan typen jullie het anders → zet het in `woorden_tellen`).

Iets aanpassen? Wijzig `instellingen.json` en draai opnieuw. Dat duurt een paar seconden.

## Stap 4 — Online zetten (voor de QR-code)

1. Maak een nieuwe map met daarin alleen `jubileum.html`, hernoemd naar `index.html`.
2. Sleep die map naar **app.netlify.com/drop** (gratis account) → je krijgt een link → hernoem de link in Site settings naar iets als `floris-en-sofia`.
3. Zet de link in `link_voor_qr` en draai het script nog één keer → de poster heeft nu een QR-code.

Op de pagina staan alleen getallen en jullie voornamen. Iedereen met de link kan hem zien, maar hij wordt niet in Google opgenomen (`noindex`).

## Stap 5 — Poster afdrukken

Open `poster.html` in **Chrome** → Afdrukken → **Opslaan als PDF**, papierformaat **A3**, marges **Geen**, en vink **Achtergrondafbeeldingen** aan. Laat die PDF afdrukken bij een drukkerij (mat of licht gestructureerd papier oogt het mooist) en zet hem in een lijst.

## Planning tot 9 december

| Wanneer | Wat |
|---|---|
| Nu – 15 nov | Exporteren, draaien, getallen checken |
| Tot 25 nov | Momenten + brief schrijven, finetunen |
| Uiterlijk 1 dec | Online zetten, QR erin, PDF naar de drukker |
| 9 dec | Poster in lijst, link op haar telefoon |

**Exporteer nog een keer op 8 december** en draai het script opnieuw, zodat de laatste weken ook meetellen. Je instellingen blijven bewaard. De poster moet dan wel al gedrukt zijn, dus die bevat de stand van eind november. De online versie kun je op 8 december nog vervangen.
