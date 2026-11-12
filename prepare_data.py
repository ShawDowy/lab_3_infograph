# -*- coding: utf-8 -*-
"""Подготовка агрегатов для интерактивного дашборда по видеоиграм."""

import csv
import json
import os
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(BASE, "..", "vgsales_clean.csv")
OUT = os.path.join(BASE, "assets", "js", "data.js")

GENRES = {
    "Action": ("Экшен", "#e86545"),
    "Sports": ("Спорт", "#2f5bea"),
    "Shooter": ("Шутер", "#7b5cd6"),
    "Role-Playing": ("RPG", "#1f8a78"),
    "Platform": ("Платформер", "#c9972f"),
    "Misc": ("Смешанные", "#64748b"),
    "Racing": ("Гонки", "#d95f8a"),
    "Fighting": ("Файтинг", "#84a93b"),
    "Simulation": ("Симулятор", "#8a6a4a"),
    "Puzzle": ("Головоломка", "#5a9bb5"),
    "Adventure": ("Приключения", "#b56b9b"),
    "Strategy": ("Стратегия", "#7d8f3e"),
}
TOP_GENRES = ["Action", "Sports", "Shooter", "Role-Playing",
              "Platform", "Misc", "Racing", "Fighting"]
OTHER_COLOR = "#d8cfc0"

REGIONS = [
    ("global", "Весь мир", "мировые"),
    ("na", "Северная Америка", "северная_америка"),
    ("eu", "Европа", "европа"),
    ("jp", "Япония", "япония"),
    ("other", "Остальной мир", "остальной_мир"),
]

PERIODS = [
    ("all", "1980–2015", 1980, 2015),
    ("1980s", "1980-е", 1980, 1989),
    ("1990s", "1990-е", 1990, 1999),
    ("2000s", "2000-е", 2000, 2009),
    ("2010s", "2010–2015", 2010, 2015),
]

PLATFORM_NAMES = {
    "2600": "Atari 2600", "3DO": "3DO", "3DS": "Nintendo 3DS",
    "DC": "Dreamcast", "DS": "Nintendo DS", "GB": "Game Boy",
    "GBA": "Game Boy Advance", "GC": "GameCube", "GEN": "Sega Genesis",
    "GG": "Game Gear", "N64": "Nintendo 64", "NES": "NES",
    "NG": "Neo Geo", "PC": "PC", "PCFX": "PC-FX", "PS": "PlayStation",
    "PS2": "PlayStation 2", "PS3": "PlayStation 3", "PS4": "PlayStation 4",
    "PSP": "PSP", "PSV": "PS Vita", "SAT": "Sega Saturn",
    "SCD": "Sega CD", "SNES": "SNES", "TG16": "TurboGrafx-16",
    "WS": "WonderSwan", "Wii": "Wii", "WiiU": "Wii U",
    "X360": "Xbox 360", "XB": "Xbox", "XOne": "Xbox One",
}

PLATFORM_MIN_YEAR = {
    "NES": 1983, "SNES": 1990, "GB": 1989, "GBA": 2001, "DS": 2004,
    "3DS": 2011, "N64": 1996, "GC": 2001, "Wii": 2006, "WiiU": 2012,
    "PS": 1994, "PS2": 2000, "PS3": 2006, "PS4": 2013, "PSP": 2004,
    "PSV": 2011, "XB": 2001, "X360": 2005, "XOne": 2013, "GEN": 1988,
    "SAT": 1994, "DC": 1998, "SCD": 1992, "GG": 1990, "2600": 1977,
    "PC": 1980,
}

PLAYSTATION = {"PS", "PS2", "PS3", "PS4", "PSP", "PSV"}
NINTENDO = {"NES", "SNES", "GB", "GBA", "DS", "3DS", "N64", "GC", "Wii", "WiiU"}
XBOX = {"XB", "X360", "XOne"}
SEGA = {"GEN", "SAT", "DC", "SCD", "GG"}

FAMILIES = [
    ("Nintendo", "Nintendo", "#d94b4b"),
    ("PlayStation", "PlayStation", "#2f5bea"),
    ("Xbox", "Xbox", "#2f8f4e"),
    ("Sega", "Sega", "#e08a2e"),
    ("Atari", "Atari", "#8a5cd6"),
    ("PC", "PC", "#5b6470"),
    ("Other", "Другие", "#a7a196"),
]


def family(platform):
    if platform in PLAYSTATION:
        return "PlayStation"
    if platform in NINTENDO:
        return "Nintendo"
    if platform in XBOX:
        return "Xbox"
    if platform in SEGA:
        return "Sega"
    if platform == "2600":
        return "Atari"
    if platform == "PC":
        return "PC"
    return "Other"


def load_rows():
    rows = []
    with open(SOURCE, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            year = int(r["год_релиза"])
            platform = r["платформа"]
            if (1980 <= year <= 2015
                    and year >= PLATFORM_MIN_YEAR.get(platform, 0)):
                r["year"] = year
                for key in ("северная_америка", "европа", "япония",
                            "остальной_мир", "мировые"):
                    r[key] = float(r[key])
                rows.append(r)
    return rows


def fmt_platform(p):
    return PLATFORM_NAMES.get(p, p)


def build(rows, region_key, period):
    col = next(c for key, _, c in REGIONS if key == region_key)
    start, end = period[2], period[3]
    data = [r for r in rows if start <= r["year"] <= end]
    total = sum(r[col] for r in data) or 0.0

    # --- статистика выбранного среза -------------------------------
    stats = {
        "releases": len(data),
        "titles": len({r["имя"] for r in data}),
        "sales": round(total, 3),
        "genres": len({r["жанр"] for r in data if r[col] > 0}),
        "platforms": len({r["платформа"] for r in data}),
        "yearMin": start if period[0] != "all" else 1980,
        "yearMax": end,
    }

    # --- жанры и платформы -----------------------------------------
    genre_sales = defaultdict(float)
    genre_rows = defaultdict(list)
    for r in data:
        genre_sales[r["жанр"]] += r[col]
        genre_rows[r["жанр"]].append(r)

    order = [g for g in TOP_GENRES if g in genre_sales]
    rest = [g for g in genre_sales if g not in order]
    groups = []
    for g in order:
        groups.append({
            "id": g,
            "name": GENRES[g][0],
            "color": GENRES[g][1],
            "value": round(genre_sales[g], 3),
            "platforms": platform_split(genre_rows[g], col),
            "families": family_split(genre_rows[g], col),
        })
    if rest:
        other_rows = [r for g in rest for r in genre_rows[g]]
        groups.append({
            "id": "Other",
            "name": "Остальные жанры",
            "color": OTHER_COLOR,
            "value": round(sum(genre_sales[g] for g in rest), 3),
            "platforms": platform_split(other_rows, col),
            "families": family_split(other_rows, col),
        })
    groups.sort(key=lambda x: -x["value"])

    # --- поток жанров по годам -------------------------------------
    years = list(range(start, end + 1))
    series = []
    for grp in groups:
        ids = {grp["id"]} if grp["id"] != "Other" else set(rest)
        vals = []
        for y in years:
            vals.append(round(sum(r[col] for r in data
                                  if r["year"] == y and r["жанр"] in ids), 3))
        series.append({
            "id": grp["id"],
            "name": grp["name"],
            "color": grp["color"],
            "values": vals,
        })
    totals = [round(sum(s["values"][i] for s in series), 3)
              for i in range(len(years))]

    # --- платформы --------------------------------------------------
    platform_rows = defaultdict(list)
    for r in data:
        platform_rows[r["платформа"]].append(r)
    platforms = []
    for p, sub in platform_rows.items():
        sales = sum(r[col] for r in sub)
        releases = len(sub)
        top_g = max(
            ((g, sum(r[col] for r in sub if r["жанр"] == g))
             for g in {r["жанр"] for r in sub}),
            key=lambda x: x[1],
        )[0] if releases else ""
        platforms.append({
            "id": p,
            "short": p,
            "name": fmt_platform(p),
            "family": family(p),
            "releases": releases,
            "sales": round(sales, 3),
            "avg": round(sales / releases, 3) if releases else 0,
            "topGenre": GENRES.get(top_g, (top_g,))[0],
        })
    platforms.sort(key=lambda x: -x["sales"])

    # --- топ-10 игр --------------------------------------------------
    top_rows = sorted(data, key=lambda r: (-r[col], -r["мировые"]))[:10]
    top_games = [{
        "title": r["имя"],
        "platform": r["платформа"],
        "platformName": fmt_platform(r["платформа"]),
        "year": r["year"],
        "genre": GENRES.get(r["жанр"], (r["жанр"],))[0],
        "publisher": r["издатель"],
        "sales": round(r[col], 3),
        "global": round(r["мировые"], 3),
    } for r in top_rows]

    heatmap_rows = []
    for p in platforms[:12]:
        vals = []
        for y in years:
            vals.append(round(sum(r[col] for r in data
                                  if r["платформа"] == p["id"] and r["year"] == y), 3))
        peak_i = max(range(len(vals)), key=lambda i: vals[i]) if vals else 0
        heatmap_rows.append({
            "id": p["id"],
            "short": p["short"],
            "name": p["name"],
            "family": p["family"],
            "values": vals,
            "peakYear": years[peak_i] if vals else start,
            "peakValue": vals[peak_i] if vals else 0,
        })

    return {
        "stats": stats,
        "hierarchy": groups,
        "stream": {"years": years, "series": series, "totals": totals},
        "platforms": platforms,
        "topGames": top_games,
        "heatmap": {"years": years, "platforms": heatmap_rows},
    }


def platform_split(rows, col):
    totals = defaultdict(float)
    for r in rows:
        totals[r["платформа"]] += r[col]
    ranked = sorted(totals.items(), key=lambda x: -x[1])
    top = ranked[:2]
    rest = sum(v for _, v in ranked[2:])
    result = [{"name": p, "value": round(v, 3)} for p, v in top]
    if rest > 0.0001:
        result.append({"name": "Другие", "value": round(rest, 3)})
    return result


def family_split(rows, col):
    totals = defaultdict(float)
    for r in rows:
        totals[family(r["платформа"])] += r[col]
    return [{"name": k, "value": round(v, 3)}
            for k, v in sorted(totals.items(), key=lambda x: -x[1]) if v > 0]


def main():
    rows = load_rows()
    print("rows 1980–2015:", len(rows))
    combos = {}
    for region_key, _, _ in REGIONS:
        for period in PERIODS:
            key = f"{region_key}|{period[0]}"
            combos[key] = build(rows, region_key, period)

    payload = {
        "meta": {
            "source": "Video Game Sales (Kaggle), очищенная версия vgsales_clean.csv",
            "sourceUrl": "https://www.kaggle.com/datasets/gregorut/videogamesales",
            "rows": len(rows),
            "years": "1980–2015",
            "excluded": "2016 год исключён как неполный",
            "unit": "млн копий",
        },
        "regions": [{"id": i, "name": n} for i, n, _ in REGIONS],
        "periods": [{"id": i, "name": n, "start": s, "end": e}
                    for i, n, s, e in PERIODS],
        "genres": [{"id": g, "name": v[0], "color": v[1]}
                   for g, v in GENRES.items()],
        "families": [{"id": i, "name": n, "color": c} for i, n, c in FAMILIES],
        "combos": combos,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.LAB_DATA = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("saved", OUT, os.path.getsize(OUT) // 1024, "KB")
    for key in ("global|all", "jp|all", "global|1980s", "global|2010s"):
        st = combos[key]["stats"]
        print(key, st, "top genre", combos[key]["hierarchy"][0]["name"])


if __name__ == "__main__":
    main()
