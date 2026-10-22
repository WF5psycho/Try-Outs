#!/usr/bin/env python3
"""Relationship receipts: telt een WhatsApp-export en maakt er een pagina van.

Gebruik:
    python3 receipts.py "WhatsApp-chat met Naam.txt"
    python3 receipts.py chat.zip

Leest instellingen.json uit dezelfde map. Schrijft stats.json (alleen getallen,
geen berichttekst), jubileum.html (voor de telefoon) en poster.html (A3).
Alles gebeurt lokaal; er gaat niets over het internet.
"""

import collections
import datetime as dt
import json
import re
import statistics
import sys
import unicodedata
import zipfile
from pathlib import Path

HIER = Path(__file__).resolve().parent

# --- Herkennen van regels -------------------------------------------------

# Android: "09-12-2025 21:14 - Naam: tekst"   iOS: "[09-12-2025, 21:14:03] Naam: tekst"
# Werkt ook met / of . als scheiding, 2-cijferige jaren en AM/PM.
KOP = re.compile(
    r"^[‎‏﻿]*\[?"
    r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4}),?\s+"
    r"(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?"
    r"\]?\s*(?:[-–]\s*)?(.*)$"
)
AFZENDER = re.compile(r"^([^:]{1,60}?):\s?(.*)$", re.S)

ONZICHTBAAR = "‎‏‪‫‬‭‮﻿⁨⁩"

MEDIA = [
    ("fotos", r"^(afbeelding|image|foto|photo) (weggelaten|omitted)$"),
    ("videos", r"^(video) (weggelaten|omitted)$"),
    ("spraak", r"^(audio|spraakbericht|voice message) (weggelaten|omitted)$"),
    ("stickers", r"^(sticker) (weggelaten|omitted)$"),
    ("gifs", r"^(gif) (weggelaten|omitted)$"),
    ("documenten", r"^(document|.+\.(pdf|docx?|xlsx?)).*(weggelaten|omitted)$"),
    ("overig", r"^(contactkaart|contact card) (weggelaten|omitted)$"),
    ("media", r"^<\s*(media weggelaten|media omitted)\s*>$"),  # Android zegt niet welk soort
]
MEDIA = [(k, re.compile(p, re.I)) for k, p in MEDIA]

VERWIJDERD = re.compile(r"^(dit bericht is verwijderd|je hebt dit bericht verwijderd|"
                        r"this message was deleted|you deleted this message)\.?$", re.I)
BEWERKT = re.compile(r"\s*<\s*(dit bericht is bewerkt|this message was edited)\s*>\s*$", re.I)
SYSTEEM = re.compile(r"end-to-end|beveiligingscode|security code|heeft deze groep|"
                     r"verdwijnende berichten|disappearing messages|je hebt .+ geblokkeerd", re.I)
OPROEP = re.compile(r"^(gemiste )?(spraak|video)(oproep|gesprek)|^missed (voice|video) call|"
                    r"^(voice|video) call", re.I)

# --- Woorden die we tellen (alleen aantallen, nooit de tekst zelf) --------

TELLERS = {
    "hou_van_je": r"\b(?:ik\s+)?hou\w?\s+(?:ook\s+|zo\s*veel\s+|zoveel\s+|zo\s+|echt\s+|heel\s+erg\s+|"
                  r"super\s+veel\s+)*van\s+(?:je|jou|u)\b|\b(?:ik\s+)?hvj+\b|\bihvj+\b|"
                  r"\b(?:i\s+)?love\s+(?:you|u|ya)\b|\bily(?:sm)?\b|\bluv\s+(?:you|u)\b",
    "goedemorgen": r"\bgoeie?de?\s*morgen\b|\bgoedemorgen\b|\bgoeiemorgen\b|\bgm\b|"
                   r"\bgood\s*morning\b|\bmorning\b|\bmogguh\b",
    "welterusten": r"\bwelterusten\b|\bslaap\s+lekker\b|\bslaaplekker\b|\btrusten?\b|\bweltrusten\b|"
                   r"\bgood\s*night\b|\bgn\b|\bnight\s*night\b",
    "haha": r"\b(?:ha){2,}h?\b|\bhihi+\b|\bhehe+\b|\blol\b|\bxd\b",
    "sorry": r"\bsorry\b|\bexcuus\b|\bsry\b",
    "mis_je": r"\bmis\s+(?:je|jou)\b|\bik\s+mis\s+je\b|\bmiss\s+(?:you|u)\b",
    "kusjes": r"\bx{2,}\b|\bkusjes?\b|\bkus\b",
}

# --- Emoji's ---------------------------------------------------------------

def is_emoji_basis(c):
    o = ord(c)
    return (0x1F300 <= o <= 0x1FAFF or 0x2600 <= o <= 0x27BF or 0x1F000 <= o <= 0x1F2FF
            or o in (0x2B50, 0x2B55, 0x2B06, 0x2B07, 0x2B05, 0x2B1B, 0x2B1C, 0x2934, 0x2935,
                     0x3030, 0x303D, 0x3297, 0x3299, 0x203C, 0x2049, 0x2122, 0x2139)
            or 0x2190 <= o <= 0x21FF or 0x2300 <= o <= 0x23FF or 0x25A0 <= o <= 0x25FF)


def is_huidskleur(c):
    return 0x1F3FB <= ord(c) <= 0x1F3FF


def is_regio(c):
    return 0x1F1E6 <= ord(c) <= 0x1F1FF


def emojis(tekst):
    """Splitst tekst in emoji's, inclusief ZWJ-reeksen, huidskleuren en vlaggen."""
    uit, i, n = [], 0, len(tekst)
    while i < n:
        c = tekst[i]
        if is_regio(c) and i + 1 < n and is_regio(tekst[i + 1]):
            uit.append(tekst[i:i + 2]); i += 2; continue
        if c in "0123456789#*" and i + 2 < n and tekst[i + 1] == "️" and tekst[i + 2] == "⃣":
            uit.append(tekst[i:i + 3]); i += 3; continue
        if is_emoji_basis(c) and not is_huidskleur(c):
            j = i + 1
            while j < n:
                if tekst[j] == "️" or is_huidskleur(tekst[j]):
                    j += 1
                elif tekst[j] == "‍" and j + 1 < n and is_emoji_basis(tekst[j + 1]):
                    j += 2
                else:
                    break
            stuk = tekst[i:j]
            # symbolen zoals pijltjes alleen meetellen als ze in emoji-stijl staan
            o = ord(c)
            symbool = (0x2190 <= o <= 0x21FF or 0x2300 <= o <= 0x23FF or 0x25A0 <= o <= 0x25FF
                       or o in (0x2122, 0x2139, 0x203C, 0x2049))
            if not symbool or "️" in stuk or o in (0x231A, 0x231B, 0x23F0, 0x23F3):
                uit.append(normaliseer_emoji(stuk))
            i = j
            continue
        i += 1
    return uit


def normaliseer_emoji(e):
    kaal = e.replace("️", "")
    # enkelvoudige oude symbolen (zoals ❤) altijd als emoji tonen
    if len(kaal) == 1 and ord(kaal) < 0x1F000:
        return kaal + "️"
    return e


# --- Inlezen --------------------------------------------------------------

def lees_export(pad):
    pad = Path(pad)
    if pad.suffix.lower() == ".zip":
        with zipfile.ZipFile(pad) as z:
            txts = [n for n in z.namelist() if n.lower().endswith(".txt")]
            if not txts:
                sys.exit("Geen .txt gevonden in de zip.")
            return z.read(txts[0]).decode("utf-8-sig", errors="replace")
    return pad.read_text(encoding="utf-8-sig", errors="replace")


def bepaal_datumvolgorde(koppen):
    """True = dag eerst (NL). Kijkt welk veld ooit boven de 12 komt."""
    a = max((int(k[0]) for k in koppen), default=0)
    b = max((int(k[1]) for k in koppen), default=0)
    if b > 12 and a <= 12:
        return False
    return True


def parse(tekst):
    regels = tekst.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    koppen = [m.groups() for m in (KOP.match(r) for r in regels) if m]
    dag_eerst = bepaal_datumvolgorde(koppen)

    berichten, systeem, kop_regels = [], 0, 0
    huidig = None
    for regel in regels:
        m = KOP.match(regel)
        if m:
            kop_regels += 1
            d1, d2, jaar, uur, minuut, sec, ampm, rest = m.groups()
            dag, maand = (int(d1), int(d2)) if dag_eerst else (int(d2), int(d1))
            jaar = int(jaar) + (2000 if len(jaar) == 2 else 0)
            uur = int(uur)
            if ampm:
                pm = ampm.lower().startswith("p")
                uur = (uur % 12) + (12 if pm else 0)
            try:
                tijd = dt.datetime(jaar, maand, dag, uur, int(minuut), int(sec or 0))
            except ValueError:
                huidig = None
                continue
            a = AFZENDER.match(rest)
            if not a:
                systeem += 1
                huidig = None
                continue
            naam = a.group(1).strip(ONZICHTBAAR + " ")
            inhoud = a.group(2)
            huidig = {"tijd": tijd, "van": naam, "tekst": inhoud}
            berichten.append(huidig)
        elif huidig is not None:
            huidig["tekst"] += "\n" + regel

    schoon = []
    for b in berichten:
        t = b["tekst"].strip(ONZICHTBAAR + " \n")
        t = BEWERKT.sub("", t).strip(ONZICHTBAAR + " ")
        if SYSTEEM.search(t) and len(t) < 200:
            systeem += 1
            continue
        b["tekst"] = t
        schoon.append(b)
    return schoon, {"kopregels": kop_regels, "systeemregels": systeem, "dag_eerst": dag_eerst}


def soort(tekst):
    for k, p in MEDIA:
        if p.match(tekst):
            return k
    if VERWIJDERD.match(tekst):
        return "verwijderd"
    if OPROEP.match(tekst):
        return "oproep"
    if re.match(r"^(locatie|location):", tekst, re.I):
        return "locatie"
    return "tekst"


# --- Tellen ---------------------------------------------------------------

def tel(berichten, cfg):
    jij, zij = cfg["jij"], cfg["zij"]
    samen = dt.date.fromisoformat(cfg["samen_sinds"])
    tellers = {k: re.compile(p, re.I) for k, p in TELLERS.items()}
    eigen = {w: re.compile(r"\b" + re.escape(w) + r"\b", re.I) for w in cfg.get("woorden_tellen", [])}

    per = {jij: collections.Counter(), zij: collections.Counter()}
    emoji_tel = collections.Counter()
    emoji_per = {jij: 0, zij: 0}
    per_maand = collections.Counter()
    per_dag = collections.Counter()
    raster = [[0] * 24 for _ in range(7)]
    woorden = {jij: 0, zij: 0}
    langste = {jij: 0, zij: 0}
    media = collections.Counter()
    voor = {"berichten": 0, "dagen": set()}

    for b in berichten:
        van, t, tijd = b["van"], b["tekst"], b["tijd"]
        s = soort(t)
        per[van]["berichten"] += 1
        per_maand[tijd.strftime("%Y-%m")] += 1
        per_dag[tijd.date()] += 1
        raster[tijd.weekday()][tijd.hour] += 1
        if tijd.date() < samen:
            voor["berichten"] += 1
            voor["dagen"].add(tijd.date())
        if s != "tekst":
            media[s] += 1
            per[van][s] += 1
            continue
        if t.lower().startswith("http") and " " not in t:
            per[van]["links"] += 1
        w = len(t.split())
        woorden[van] += w
        langste[van] = max(langste[van], w)
        e = emojis(t)
        emoji_tel.update(e)
        emoji_per[van] += len(e)
        for k, p in tellers.items():
            n = len(p.findall(t))
            if n:
                per[van][k] += n
        for woord, p in eigen.items():
            n = len(p.findall(t))
            if n:
                per[van]["woord:" + woord] += n
        if 0 <= tijd.hour < 5:
            per[van]["nacht"] += 1

    # wie begint het gesprek (eerste bericht na 6 uur stilte) en reactietijd
    begint = collections.Counter()
    reactie = {jij: [], zij: []}
    vorige = None
    for b in berichten:
        if vorige is None or (b["tijd"] - vorige["tijd"]).total_seconds() >= 6 * 3600:
            begint[b["van"]] += 1
        elif b["van"] != vorige["van"]:
            minuten = (b["tijd"] - vorige["tijd"]).total_seconds() / 60
            if minuten <= 12 * 60:
                reactie[b["van"]].append(minuten)
        vorige = b

    # langste stilte en langste reeks dagen achter elkaar
    stilte = (0, None, None)
    for a, b in zip(berichten, berichten[1:]):
        gat = (b["tijd"] - a["tijd"]).total_seconds()
        if gat > stilte[0]:
            stilte = (gat, a["tijd"], b["tijd"])
    dagen = sorted(per_dag)
    reeks, beste, beste_eind = 1, 1, dagen[0]
    for a, b in zip(dagen, dagen[1:]):
        reeks = reeks + 1 if (b - a).days == 1 else 1
        if reeks > beste:
            beste, beste_eind = reeks, b
    beste_start = beste_eind - dt.timedelta(days=beste - 1)

    eerste, laatste = berichten[0]["tijd"], berichten[-1]["tijd"]
    totaal = len(berichten)
    drukste_dag, drukste_aantal = per_dag.most_common(1)[0]
    uur_tot = [sum(raster[d][u] for d in range(7)) for u in range(24)]
    dag_tot = [sum(rij) for rij in raster]

    # alle maanden van eerste tot laatste, ook lege
    maanden, m = [], dt.date(eerste.year, eerste.month, 1)
    while m <= laatste.date():
        maanden.append({"maand": m.strftime("%Y-%m"), "aantal": per_maand.get(m.strftime("%Y-%m"), 0)})
        m = dt.date(m.year + (m.month == 12), m.month % 12 + 1, 1)

    def persoon(naam):
        c = per[naam]
        r = reactie[naam]
        return {
            "berichten": c["berichten"],
            "procent": round(100 * c["berichten"] / totaal, 1),
            "woorden": woorden[naam],
            "langste_bericht_woorden": langste[naam],
            "emojis": emoji_per[naam],
            "begint_gesprek": begint[naam],
            "reactie_mediaan_min": round(statistics.median(r), 1) if r else None,
            "nachtberichten": c["nacht"],
            "media": sum(c[k] for k, _ in MEDIA),
            "spraak": c["spraak"],
            "tellers": {k: c[k] for k in TELLERS},
            "eigen_woorden": {w: c["woord:" + w] for w in cfg.get("woorden_tellen", [])},
        }

    fotos = media["fotos"] + media["media"]  # Android: alles staat onder "media"
    return {
        "namen": {"jij": jij, "zij": zij},
        "samen_sinds": cfg["samen_sinds"],
        "jubileum": cfg.get("jubileum", ""),
        "eerste_bericht": eerste.isoformat(),
        "eerste_bericht_van": berichten[0]["van"],
        "laatste_bericht": laatste.isoformat(),
        "totaal_berichten": totaal,
        "dagen_bereik": (laatste.date() - eerste.date()).days + 1,
        "dagen_samen": (laatste.date() - samen).days + 1 if laatste.date() >= samen else 0,
        "actieve_dagen": len(per_dag),
        "gemiddeld_per_dag": round(totaal / len(per_dag), 1),
        "voor_samen": {"berichten": voor["berichten"], "dagen": len(voor["dagen"])},
        "vanaf_samen": {"berichten": totaal - voor["berichten"]},
        "personen": {"jij": persoon(jij), "zij": persoon(zij)},
        "media": {
            "fotos_en_media": fotos, "videos": media["videos"], "spraak": media["spraak"],
            "stickers": media["stickers"], "gifs": media["gifs"], "documenten": media["documenten"],
            "verwijderd": media["verwijderd"], "oproepen": media["oproep"], "locaties": media["locatie"],
            "android_zonder_soort": media["media"] > 0,
        },
        "emojis_totaal": sum(emoji_tel.values()),
        "verschillende_emojis": len(emoji_tel),
        "emoji_top10": [{"emoji": e, "aantal": n} for e, n in emoji_tel.most_common(10)],
        "per_maand": maanden,
        "raster_weekdag_uur": raster,  # maandag = 0
        "drukste_uur": uur_tot.index(max(uur_tot)),
        "drukste_weekdag": dag_tot.index(max(dag_tot)),
        "drukste_dag": {"datum": drukste_dag.isoformat(), "berichten": drukste_aantal},
        "langste_stilte": {"uren": round(stilte[0] / 3600, 1),
                           "van": stilte[1].isoformat() if stilte[1] else None,
                           "tot": stilte[2].isoformat() if stilte[2] else None},
        "langste_reeks_dagen": {"dagen": beste, "van": beste_start.isoformat(), "tot": beste_eind.isoformat()},
        "momenten": [m for m in cfg.get("momenten", []) if not m.get("tekst", "").startswith("Vervang mij")],
    }


# --- Controle -------------------------------------------------------------

def controleer(berichten, info, afzenders, cfg, stats):
    """Tweede telmethode en waarschuwingen, zodat er geen rare getallen op de pagina komen."""
    meldingen = []
    if len(afzenders) > 2:
        meldingen.append(f"Er zijn {len(afzenders)} afzenders gevonden. Is dit een groepschat? "
                         f"Alleen {cfg['jij']} en {cfg['zij']} worden geteld.")
    if info["kopregels"] != len(berichten) + info["systeemregels"]:
        verschil = info["kopregels"] - len(berichten) - info["systeemregels"]
        meldingen.append(f"{verschil} regels met een datum konden niet gelezen worden.")
    eerste = dt.date.fromisoformat(stats["eerste_bericht"][:10])
    samen = dt.date.fromisoformat(cfg["samen_sinds"])
    if eerste >= samen:
        meldingen.append(f"Het eerste bericht ({eerste}) is van ná {samen}. Klopt dat? WhatsApp kapt "
                         "lange chats soms af, of jullie appten eerder via een andere app.")
    som = stats["personen"]["jij"]["berichten"] + stats["personen"]["zij"]["berichten"]
    if som != stats["totaal_berichten"]:
        meldingen.append(f"Optelsom klopt niet: {som} vs {stats['totaal_berichten']}.")
    if stats["personen"]["jij"]["tellers"]["hou_van_je"] + stats["personen"]["zij"]["tellers"]["hou_van_je"] == 0:
        meldingen.append("Nul keer 'hou van je' gevonden. Typen jullie het anders? Voeg het toe aan woorden_tellen.")
    return meldingen


# --- Pagina's maken -------------------------------------------------------

def maak_pagina(stats, cfg, modus):
    sjabloon = (HIER / "sjabloon.html").read_text(encoding="utf-8")
    pagina = {k: cfg.get(k) for k in ("titel_regel", "afsluiter", "persoonlijke_tekst",
                                      "verberg", "jubileum", "link_voor_qr")}
    data = json.dumps({"stats": stats, "pagina": pagina, "modus": modus}, ensure_ascii=False)
    data = data.replace("</", "<\\/")
    return sjabloon.replace("/*__DATA__*/null", data)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cfg_pad = HIER / "instellingen.json"
    cfg = json.loads(cfg_pad.read_text(encoding="utf-8"))

    berichten, info = parse(lees_export(sys.argv[1]))
    if not berichten:
        sys.exit("Geen berichten gevonden. Is dit wel een WhatsApp-export (.txt of .zip)?")
    afzenders = collections.Counter(b["van"] for b in berichten)

    print(f"\nGevonden: {len(berichten)} berichten van {berichten[0]['tijd']:%d-%m-%Y} "
          f"t/m {berichten[-1]['tijd']:%d-%m-%Y}")
    print("Afzenders:")
    for naam, n in afzenders.most_common():
        print(f"  {n:>7}  {naam}")

    namen = [n for n, _ in afzenders.most_common(2)]
    for sleutel in ("jij", "zij"):
        if not cfg.get(sleutel) or cfg[sleutel] not in afzenders:
            if cfg.get(sleutel):
                print(f"\nLet op: '{cfg[sleutel]}' staat niet in de chat.")
            sys.exit("\nVul in instellingen.json bij \"jij\" en \"zij\" de namen in precies "
                     "zoals ze hierboven staan, en draai het script opnieuw.")
    berichten = [b for b in berichten if b["van"] in (cfg["jij"], cfg["zij"])]
    berichten.sort(key=lambda b: b["tijd"])

    stats = tel(berichten, cfg)
    meldingen = controleer(berichten, info, afzenders, cfg, stats)

    (HIER / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    (HIER / "jubileum.html").write_text(maak_pagina(stats, cfg, "telefoon"), encoding="utf-8")
    (HIER / "poster.html").write_text(maak_pagina(stats, cfg, "poster"), encoding="utf-8")

    j, z = stats["personen"]["jij"], stats["personen"]["zij"]
    print("\nDe bonnetjes:")
    print(f"  {stats['totaal_berichten']} berichten op {stats['actieve_dagen']} van de {stats['dagen_bereik']} dagen")
    print(f"  {cfg['jij']} {j['procent']}%  /  {cfg['zij']} {z['procent']}%")
    print(f"  Al {stats['voor_samen']['berichten']} berichten vóór {cfg['samen_sinds']}")
    print(f"  {stats['media']['fotos_en_media']} foto's/media, {stats['media']['spraak']} spraakberichten")
    print(f"  {stats['emojis_totaal']} emoji's, top 3: {' '.join(e['emoji'] for e in stats['emoji_top10'][:3])}")
    print(f"  'Hou van je': {cfg['jij']} {j['tellers']['hou_van_je']}x, {cfg['zij']} {z['tellers']['hou_van_je']}x")
    print(f"  Welterusten: {j['tellers']['welterusten'] + z['tellers']['welterusten']}x, "
          f"goedemorgen: {j['tellers']['goedemorgen'] + z['tellers']['goedemorgen']}x")
    print(f"  Drukste dag: {stats['drukste_dag']['datum']} ({stats['drukste_dag']['berichten']} berichten)")
    print(f"  Langste reeks: {stats['langste_reeks_dagen']['dagen']} dagen achter elkaar")
    print(f"  Langste stilte: {stats['langste_stilte']['uren']} uur")
    if meldingen:
        print("\nControleer dit:")
        for m in meldingen:
            print("  - " + m)
    else:
        print("\nControle: alles klopt.")
    print("\nGeschreven: stats.json, jubileum.html, poster.html")


if __name__ == "__main__":
    main()
