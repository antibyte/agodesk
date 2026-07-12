import fs from "node:fs";
import path from "node:path";

const dir = "src/lib/i18n/messages";
const de = {
  "activityTimeline.activeCount": "{count} aktiv",
  "activityTimeline.collapse": "Einklappen",
  "activityTimeline.dismiss": "Ausblenden",
  "activityTimeline.dismiss.ariaLabel": "Aktivitätsleiste ausblenden",
  "activityTimeline.expand": "Ausklappen",
  "activityTimeline.phase.cancelled": "Abgebrochen",
  "activityTimeline.phase.completed": "Abgeschlossen",
  "activityTimeline.phase.failed": "Fehlgeschlagen",
  "activityTimeline.phase.progress": "Läuft",
  "activityTimeline.phase.queued": "Warteschlange",
  "activityTimeline.phase.started": "Gestartet",
  "activityTimeline.phase.waitingApproval": "Wartet auf Freigabe",
  "activityTimeline.stop": "Stoppen",
  "activityTimeline.title": "Aktivität",
};
const en = {
  "activityTimeline.activeCount": "{count} active",
  "activityTimeline.collapse": "Collapse",
  "activityTimeline.dismiss": "Dismiss",
  "activityTimeline.dismiss.ariaLabel": "Dismiss activity timeline",
  "activityTimeline.expand": "Expand",
  "activityTimeline.phase.cancelled": "Cancelled",
  "activityTimeline.phase.completed": "Completed",
  "activityTimeline.phase.failed": "Failed",
  "activityTimeline.phase.progress": "In progress",
  "activityTimeline.phase.queued": "Queued",
  "activityTimeline.phase.started": "Started",
  "activityTimeline.phase.waitingApproval": "Waiting for approval",
  "activityTimeline.stop": "Stop",
  "activityTimeline.title": "Activity",
};

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const locale = f.replace(".json", "");
  const keys = locale === "de" ? de : en;
  const p = path.join(dir, f);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [k, v] of Object.entries(keys)) {
    j[k] = v;
  }
  const sorted = Object.fromEntries(
    Object.keys(j)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => [k, j[k]]),
  );
  fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n");
  console.log("updated", f);
}
