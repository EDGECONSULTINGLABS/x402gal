"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readLocalAttendee,
  syncAttendee,
  writeLocalAttendee,
  type LocalAttendee,
} from "@/lib/match/attendee";
import { type AssessmentResult } from "@/lib/match/assessment";
import { facilitiesFrom } from "@/lib/match/facilities";
import { haversineMeters, loadCollection } from "@/lib/match/geo";
import { metroById, type MetroId } from "@/lib/match/metros";
import { Assessment } from "./Assessment";
import { Badge } from "./Badge";
import { Gate } from "./Gate";
import { Learn } from "./Learn";
import { MatchApp, type Handoff } from "./MatchApp";

/**
 * The Summit flow, end to end:
 *   gate → instrument (place, neighbors) → assess → map it → learn → badge (code for the team on the floor)
 * The instrument works with the network off. The gate stores locally first and syncs when it can.
 */
type Stage = "gate" | "instrument" | "assess" | "learn" | "badge";

export function SummitApp() {
  const [attendee, setAttendee] = useState<LocalAttendee | null | undefined>(undefined);
  const [stage, setStage] = useState<Stage>("gate");
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [context, setContext] = useState<{ metroName: string; subwatershed: string | null }>({
    metroName: "",
    subwatershed: null,
  });
  const [mapKey, setMapKey] = useState(0);

  // Returning phone: skip the gate.
  useEffect(() => {
    const local = readLocalAttendee();
    setAttendee(local);
    if (local) setStage("instrument");
  }, []);

  // Retry the sync whenever we come back online.
  useEffect(() => {
    if (!attendee || attendee.synced) return;
    const retry = async () => {
      const ok = await syncAttendee(attendee);
      if (ok) {
        const next = { ...attendee, synced: true };
        writeLocalAttendee(next);
        setAttendee(next);
      }
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [attendee]);

  const patch = useCallback(
    (fields: Partial<LocalAttendee>) => {
      setAttendee((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...fields };
        writeLocalAttendee(next);
        void syncAttendee(next).then((ok) => {
          if (ok !== next.synced) {
            const synced = { ...next, synced: ok };
            writeLocalAttendee(synced);
            setAttendee(synced);
          }
        });
        return next;
      });
    },
    []
  );

  const onMetroChosen = useCallback(
    (metroId: MetroId) => {
      if (!attendee || attendee.metro === metroId) return;
      patch({ metro: metroId, metroAt: new Date().toISOString() });
    },
    [attendee, patch]
  );

  /** Representative facility: the listed facility nearest the metro center. Metro center if none. */
  const mapIt = async (r: AssessmentResult) => {
    const metro = metroById(r.metro);
    const line = `About ${r.dailyDisplay} a day, estimated.`;
    let target: Handoff = {
      metroId: metro.id,
      lng: metro.center[0],
      lat: metro.center[1],
      label: `${metro.name} metro center`,
      resultLine: line,
    };
    try {
      const col = await loadCollection(`/match/data/${metro.id}/facilities.geojson`);
      const list = facilitiesFrom(col);
      let best = list[0];
      let bestD = Infinity;
      for (const f of list) {
        const d = haversineMeters(metro.center[0], metro.center[1], f.lng, f.lat);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best) target = { ...target, lng: best.lng, lat: best.lat, label: best.name };
    } catch {
      // offline or no facilities for this metro — the metro center still resolves a watershed
    }
    setHandoff(target);
    setMapKey((k) => k + 1);
    setStage("instrument");
  };

  if (attendee === undefined) {
    return <div className="match-screen" />;
  }

  if (stage === "gate" || !attendee) {
    return (
      <Gate
        onEntered={(rec) => {
          setAttendee(rec);
          setStage("instrument");
        }}
      />
    );
  }

  if (stage === "assess") {
    return (
      <Assessment
        onResult={(r) => {
          setResult(r);
          patch({
            assessmentGallons: Number(r.gallonsPerDay.toPrecision(3)),
            assessmentVersion: r.methodology.version,
            assessedAt: new Date().toISOString(),
          });
        }}
        onMapIt={mapIt}
        onBack={() => setStage("instrument")}
      />
    );
  }

  if (stage === "learn") {
    return (
      <Learn
        inNewYork={(handoff?.metroId ?? attendee.metro) === "nyc"}
        onDone={() => {
          patch({ badgeAt: new Date().toISOString() });
          setStage("badge");
        }}
        onBack={() => setStage("instrument")}
      />
    );
  }

  if (stage === "badge") {
    return (
      <Badge
        attendee={attendee}
        metroName={context.metroName || null}
        subwatershed={context.subwatershed}
        onBackToMap={() => setStage("instrument")}
      />
    );
  }

  return (
    <MatchApp
      key={mapKey}
      handoff={handoff}
      assessed={result !== null}
      onAssess={() => setStage("assess")}
      onLearn={() => setStage("learn")}
      onMetroChosen={onMetroChosen}
      onContext={setContext}
    />
  );
}
