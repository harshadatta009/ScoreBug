"use client";

import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Leaderboard } from "./Leaderboard";
import type { LeaderboardKind, LeaderboardRowVM } from "../types";

export interface StatTabsData {
  batting: LeaderboardRowVM[];
  bowling: LeaderboardRowVM[];
  fielding: LeaderboardRowVM[];
  mvp: LeaderboardRowVM[];
}

const TABS: {
  value: LeaderboardKind;
  label: string;
  metricLabel: string;
  emptyTitle: string;
  emptyHint: string;
}[] = [
  {
    value: "batting",
    label: "Batting",
    metricLabel: "Runs",
    emptyTitle: "No batting stats yet",
    emptyHint: "Run scorers appear here once matches have been scored.",
  },
  {
    value: "bowling",
    label: "Bowling",
    metricLabel: "Wkts",
    emptyTitle: "No bowling stats yet",
    emptyHint: "Wicket-takers appear here once matches have been scored.",
  },
  {
    value: "fielding",
    label: "Fielding",
    metricLabel: "Dis.",
    emptyTitle: "No fielding stats yet",
    emptyHint:
      "Catches, stumpings and run-outs are tallied here after matches.",
  },
  {
    value: "mvp",
    label: "MVP",
    metricLabel: "Pts",
    emptyTitle: "No MVP rankings yet",
    emptyHint:
      "The MVP board combines batting, bowling and fielding into one impact score.",
  },
];

/**
 * Client tab switcher for the four leaderboards. The board data is computed on
 * the server and passed in, so switching tabs is instant (no refetch). Kept a
 * Client Component only because Radix Tabs needs interactivity.
 */
export function StatTabs({ data }: { data: StatTabsData }) {
  return (
    <Tabs defaultValue="batting" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          <Leaderboard
            rows={data[t.value]}
            metricLabel={t.metricLabel}
            emptyTitle={t.emptyTitle}
            emptyHint={t.emptyHint}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
