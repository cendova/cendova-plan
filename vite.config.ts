import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import os from 'node:os'
import path from 'node:path'
import { lokaleSicherung } from './vite-lokale-sicherung'

export default defineConfig({
  plugins: [react(), tailwindcss(), lokaleSicherung()],
  // Relative Asset-Pfade: Das Build läuft unverändert standalone UND unter
  // einem Prefix (CendovaView liefert es als /plan/ mit aus — Weg B der
  // Integration). Absolute '/assets/…'-URLs würden dort ins Leere zeigen.
  base: './',
  resolve: {
    // Cornerstone3D v5 (dicom-image-loader) zieht `xmlbuilder2`, dessen
    // Streaming-Builder `class … extends EventEmitter` aus dem Node-Builtin
    // `events` ableitet. Vite externalisiert `events` im Browser → EventEmitter
    // ist undefined → App crasht beim Mount ("Class extends value undefined").
    // Auf den Browser-Shim `events` umbiegen, damit EventEmitter real existiert.
    alias: {
      events: 'events',
    },
  },
  // Vite-Cache (vorab gebündelte Abhängigkeiten) auf LOKALE Platte legen statt
  // ins Google-Drive-gespiegelte node_modules/.vite. Cornerstone3D ist ein
  // riesiger Modulbaum; diese Chunks bei jedem Browser-Laden vom Drive-Mirror
  // zu lesen kostet Minuten — von lokaler SSD sind sie sofort da. Nach dieser
  // Änderung re-optimiert der ERSTE Start einmal (dann dauerhaft schnell).
  cacheDir: path.join(os.tmpdir(), 'vite-cendova-plan-cache'),
  // Häufig importierte eigene Module beim Serverstart vorwärmen, damit der
  // Browser sie nicht erst beim ersten Request transformieren muss.
  server: {
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/lib/cornerstone/viewer.ts',
      ],
    },
    port: 5173,
    // NIE still auf einen anderen Port ausweichen: localhost:5174 wäre für
    // den Browser eine ANDERE Herkunft mit leerem Speicher — importiertes
    // Paket/Profil schienen dann „verschwunden" (klinischer Befund). Die
    // Launcher erkennen eine laufende Instanz und öffnen nur den Browser.
    strictPort: true,
    // KEIN host-Override: Vites Default 'localhost' bindet ohnehin nur an
    // die Loopback-Schnittstelle (nie im Netz erreichbar), und `--open`
    // öffnet dann auch http://localhost:5173 — die Browser-Origin, unter
    // der IndexedDB/localStorage (Schablonen-Paket, Profil) liegen.
    // Lehrstück: host '127.0.0.1' ließ --open http://127.0.0.1:5173 öffnen
    // → FREMDE Origin mit leerem Speicher, „Paket verschwunden". Der
    // Security-Gewinn kam vom Entfernen von allowedHosts:true (Zeile oben,
    // DNS-Rebinding-Schutz wieder aktiv) — der bleibt.
    watch: {
      // Quell-Assets (Hersteller-PDFs, Referenz-Screenshots) liegen in
      // „Templates Knee/" und sind NICHT Teil des Builds. Wenn der Google-
      // Drive-Spiegel-Prozess dort eine Datei sperrt, stürzt Vites File-
      // Watcher mit EBUSY ab. Diesen Ordner (und große Quell-Verzeichnisse)
      // vom Watch ausschließen — sie werden ohnehin nie importiert.
      ignored: [
        '**/Templates Knee/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/memory/**',
      ],
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Der DICOM-Loader bringt eigene Web-Worker mit und wird nicht vorab
    // gebündelt. Seine WASM-Codecs sind aber CommonJS-Module und brauchen
    // die ESM-Interop von esbuild — daher explizit einschließen.
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: [
      'dicom-parser',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
    ],
  },
  assetsInclude: ['**/*.wasm'],
})
