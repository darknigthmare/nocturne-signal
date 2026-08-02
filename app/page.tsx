import type { Metadata } from "next";
import { GameApp } from "./GameApp";

export const metadata: Metadata = {
  title: "NOCTURNE SIGNAL — Survival rhythm horror",
  description:
    "Jouez trois transmissions originales, gardez la créature à distance et survivez jusqu'à l'aube.",
};

export default function Home() {
  return <GameApp />;
}
