#!/usr/bin/env python3
"""Generate site-map.html and insert a navigation block into every mapped page.

Edit SECTIONS below, then run:  python3 scripts/build_site_map.py
Safe to re-run: the injected block is wrapped in markers and replaced each time.
"""
import os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START, END = "<!-- SITE-NAV:START -->", "<!-- SITE-NAV:END -->"

# (group, hub page, [(section title, [pages])])
GROUPS = [
 ("Biomechanics", "pages/biomechanics-hub.html", [
  ("Level 4 course notes", ["pages/biomechanics-hub.html","pages/biomechanics/index.html"] + [f"pages/biomechanics/{n}.html" for n in
    ["01-intro","02-qualitative","03-neuromuscular","04-palpation","05-planes","06-linear-kinematics",
     "07-angular-kinematics","08-assessment1","09-linear-kinetics","10-force-time","11-work-energy","12-assessment2","level4"]]),
  ("SESC02 · Kinematics", ["planes-axes-levers.html","camera-setup.html","marker-placement.html",
     "sesc02-qualitative-phase-analysis.html","sesc02-phase-analysis.html","sesc02-linear-kinematics.html",
     "sesc02-sprint-kinematics.html","sesc02-video-analysis.html","video-analyser/index.html"]),
  ("SESD52 / SESH52 · Kinetics & kinematics", ["sesd52-kinematics-kinetics.html","kinetics-kinematics-sort.html","mechanism-to-measurement.html"]),
  ("SESD56 · Force, power & training", ["developing-power.html","imtp-analyser.html","vbt.html","coaching-cards.html",
     "force-analyser/index.html","CASES_Jump_Lab.html","screening-protocol-builder.html"]),
  ("Tools & activities", ["tools/biomechanics/projectile.html","tools/projectile.html","paper-ball-challenge.html"]),
 ]),
 ("Physiology", "teaching.html#physiology", [
  ("SESH58 · Nutrition Lab", [f"sesh58-nutrition-lab/{n}.html" for n in
    ["index","fuel-calculator","diet-analyser","feedback-builder","portfolio-checker","quiz","reflection"]]),
  ("SESH54 · Needs analysis", ["sesh54-needs-analysis/index.html"]),
  ("Physiology pages & tools", ["pages/physiology/index.html","tools/physiology/placeholder.html"]),
 ]),
 ("Research, statistics & teaching", "research-projects.html", [
  ("Teaching & research", ["teaching.html","research.html","research-projects.html","project.html","research-philosophy/index.html"]),
  ("MRes Stats Lab", [f"mres-stats-lab/{n}.html" for n in
    ["index","p-values","power","ci-dance","bayes-rule","bayes-factor","priors","mcmc","loo","residuals",
     "equivalence","show-the-data","two-lenses","fix-the-results"]]),
  ("SESD55 · Quantitative deck", ["sesd55-quant-deck/index.html","sesd55-quant-deck/presenter.html"]),
 ]),
]

def title(path):
    t = open(os.path.join(ROOT, path.split("#")[0]), encoding="utf-8", errors="ignore").read()
    m = re.search(r"<title>(.*?)</title>", t, re.S | re.I)
    s = html.unescape(m.group(1)).strip() if m else os.path.basename(path)
    return re.sub(r"\s*[—·|]\s*(Dr\. Tommy Bright|SESD56|SESC02|SESD55|SESH58.*|MRes Stats Lab)\s*$", "", s)

def rel(src, dst):
    return os.path.relpath(dst.split("#")[0], os.path.dirname(src) or ".") + ("#" + dst.split("#")[1] if "#" in dst else "")

def nav_block(page, group, hub, sec, pages):
    i = pages.index(page)
    d = os.path.dirname(page)
    links = [("Home", "index.html"), ("Site map", "site-map.html"), (group, hub)]
    if d and os.path.exists(os.path.join(ROOT, d, "index.html")) and page != d + "/index.html" and "Coming Soon" not in title(d + "/index.html"):
        links.append((title(d + "/index.html"), d + "/index.html"))
    if i > 0: links.append(("← " + title(pages[i-1]), pages[i-1]))
    if i < len(pages) - 1: links.append((title(pages[i+1]) + " →", pages[i+1]))
    a = " · ".join(f'<a href="{html.escape(rel(page, h))}" style="color:inherit">{html.escape(t)}</a>' for t, h in links)
    return (f'{START}\n<nav aria-label="Site navigation" style="font:14px/1.6 system-ui,sans-serif;'
            f'padding:14px 20px;margin-top:32px;border-top:1px solid #8884;text-align:center;opacity:.85">{a}</nav>\n{END}')

def inject(page, block):
    p = os.path.join(ROOT, page)
    t = open(p, encoding="utf-8").read()
    t = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", t, flags=re.S)
    if re.search(r"</body>", t, re.I):
        t = re.sub(r"(</body>)", lambda m: block + "\n" + m.group(1), t, count=1, flags=re.I)
    else:
        t += "\n" + block + "\n"
    open(p, "w", encoding="utf-8").write(t)

def main():
    seen, out = {}, []
    for group, hub, sections in GROUPS:
        out.append(f'<section><h2><a href="{hub}">{html.escape(group)}</a></h2>')
        for sec, pages in sections:
            out.append(f"<h3>{html.escape(sec)}</h3><ul>")
            for pg in pages:
                out.append(f'<li><a href="{pg}">{html.escape(title(pg))}</a></li>')
                if pg != "index.html": inject(pg, nav_block(pg, group, hub, sec, pages)); seen[pg] = 1
            out.append("</ul>")
        out.append("</section>")
    page = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site Map — Dr. Tommy Bright</title>
<style>:root{{color-scheme:light dark}}body{{font:16px/1.6 system-ui,sans-serif;max-width:900px;margin:0 auto;padding:24px 20px}}
h2{{margin-top:2em;border-bottom:2px solid #8886}}h3{{margin-bottom:.2em}}ul{{columns:2;margin-top:.2em}}@media(max-width:600px){{ul{{columns:1}}}}</style>
</head><body><p><a href="index.html">← Home</a></p><h1>Site map</h1>
<p>Every page, grouped by topic. The same links appear at the bottom of each page.</p>
{chr(10).join(out)}
</body></html>"""
    open(os.path.join(ROOT, "site-map.html"), "w", encoding="utf-8").write(page)
    # homepage link to the map
    p = os.path.join(ROOT, "index.html"); t = open(p, encoding="utf-8").read()
    t = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", t, flags=re.S)
    blk = f'{START}\n<nav aria-label="Site map" style="font:14px/1.6 system-ui,sans-serif;padding:14px 20px;text-align:center"><a href="site-map.html" style="color:inherit">Site map: browse all biomechanics, physiology and research pages</a></nav>\n{END}'
    t = re.sub(r"(</body>)", lambda m: blk + "\n" + m.group(1), t, count=1, flags=re.I)
    open(p, "w", encoding="utf-8").write(t)
    missing = [f for f in os.popen(f"cd '{ROOT}' && git ls-files '*.html'").read().split("\n")
               if f and not f.startswith("Matt Examples") and f not in seen and f not in ("index.html","site-map.html")]
    print(f"linked {len(seen)} pages; unmapped: {missing}")

main()
