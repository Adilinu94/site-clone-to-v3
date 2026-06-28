# V4 Atomic Element Format – Kritische Regeln

## Gelernt: 2026-06 (V3→V4 Live-Konvertierung test4.nick-webdesign.de)

---

## Container vs. Leaf Widget elType

### Container (kann Kinder haben):
```json
{
  "id": "mycontainer",
  "elType": "e-flexbox",
  "settings": {
    "classes": {"$$type":"classes","value":["gc-FLEXBASE","mycontainer"]},
    "tag": {"$$type":"string","value":"div"}
  },
  "styles": { "mycontainer": { ... } },
  "elements": [...],
  "isInner": false,
  "interactions": [],
  "editor_settings": [],
  "version": "4.2.0-beta1"
}
```

**KEIN `widgetType` für Container!**

### Leaf Widget:
```json
{
  "id": "myheading",
  "elType": "widget",
  "widgetType": "e-heading",
  "settings": { ... },
  "styles": { ... },
  "elements": [],
  "isInner": false,
  "interactions": [],
  "editor_settings": [],
  "version": "4.2.0-beta1"
}
```

---

## Häufigster Bug beim JSON-Generieren

```bash
# BUG: $$ in bash -e "..." wird zu Prozess-ID!
node -e "const x = {'$$type': 'string'}"  # → {"556type":"string"} FALSCH!

# FIX: Immer .js Datei nutzen
cat > gen.js << 'JSEOF'
const x = {"$$type":"string","value":"foo"}
JSEOF
node gen.js
```

---

## V4 Render-Verifizierung

```php
$html = wp_remote_retrieve_body(wp_remote_get(get_permalink($post_id)));
$ok = preg_match('/class="[^"]*s-[a-z]/', $html); // s-* = V4 atomic CSS
// $ok === 1 → V4 rendert korrekt
```

---

## PHP Inject (>50KB JSON Trees)

```php
// Grosse JSONs via GitHub herunterladen + direkt in DB schreiben
$json_raw = file_get_contents($github_raw_url);
update_post_meta($post_id, '_elementor_edit_mode', 'builder');
update_post_meta($post_id, '_elementor_data', wp_slash($json_raw));
\Elementor\Plugin::$instance->files_manager->clear_cache();
```

---

## Unsupported V3→V4 Widgets

Diese Widgets haben keinen V4-Equivalent und bleiben V3-Fallback:
- `counter` → e-heading mit statischem Wert
- `rating` → e-heading mit Stern-Emoji
- `icon-list` → manuell: e-flexbox + e-paragraph pro Item
- `icon-box`, `elementskit-icon-box` → e-flexbox + e-heading + e-paragraph
- `elementskit-video` → e-youtube (manuell mappen)
- `elementskit-accordion` → HTML `<details>/<summary>`
- `testimonial` → manuelles e-flexbox Grid
