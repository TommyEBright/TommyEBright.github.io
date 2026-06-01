# Dr Tommy Bright — Sport & Exercise Science Website

A personal academic website covering research, a student research project hub, and an interactive biomechanics teaching resource.

## Site Structure

```
site/
├── index.html          → Homepage
├── research.html       → Publications & collaborators
├── project.html        → Student research project hub
├── teaching.html       → Biomechanics teaching resource (L4–7)
├── css/
│   └── style.css       → Shared styles across all pages
└── tools/
    ├── projectile.html → Projectile motion simulator
    └── (more tools added here as built)
```

## How to Deploy

### Option A — Netlify (Recommended, easiest)
1. Go to netlify.com and sign up free
2. Drag and drop this entire folder onto the Netlify dashboard
3. Site goes live instantly at a netlify.app URL
4. Optional: connect a custom domain (e.g. tombright.com)

### Option B — GitHub Pages
1. Create a GitHub account at github.com
2. Create a new repository named `yourusername.github.io`
3. Upload all files in this folder to that repository
4. Go to Settings → Pages → set source to main branch
5. Site goes live at `yourusername.github.io`

## How to Update Content

### Adding a new publication
Open `research.html`, find the publication list section, and copy/paste a `pub-item` block:

```html
<div class="pub-item">
  <div class="pub-year">2026</div>
  <div>
    <div class="pub-title">Your paper title here</div>
    <div class="pub-meta">Author list · <span class="pub-journal">Journal Name</span></div>
  </div>
  <a href="https://doi.org/YOURLINK" class="pub-link">DOI</a>
</div>
```

### Adding a student contributor
Open `project.html`, find the contributor grid, and add a contributor card:

```html
<div class="contributor-card">
  <div class="contributor-initial">AB</div>
  <div class="contributor-name">Alex Bloggs</div>
  <div class="contributor-role">CMJ Data Collection</div>
</div>
```

### Adding a new interactive tool
1. Build the tool as a self-contained HTML file
2. Drop it into the `tools/` folder
3. Add a card for it in both `teaching.html` and `index.html`

## Adding a New Tool Card (teaching.html)

```html
<a href="tools/yourtool.html" class="tool-card">
  <div class="tool-icon">📐</div>
  <div class="tool-name">Tool Name</div>
  <div class="tool-level">Level 5 · 6</div>
  <div style="font-size:12px; color:rgba(255,255,255,0.5); margin-top:8px; font-weight:300;">
    Short description of what the tool does.
  </div>
</a>
```

## Personalisation Checklist

- [ ] Replace `[your.email@marjon.ac.uk]` in project.html with your actual email
- [ ] Add your ORCID and ResearchGate profile URLs in research.html
- [ ] Add real DOI links to publications
- [ ] Add student contributor names as they join
- [ ] Update publication list as new papers are accepted
- [ ] Give the student project a name when ready

## Built with
Pure HTML + CSS — no frameworks, no dependencies, no build step required.
All interactive tools are self-contained HTML files.
