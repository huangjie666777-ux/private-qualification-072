import type { EventPolicy } from "./types.js";

export const EVENTS: EventPolicy[] = [
  { eventId: 1001, name: "精英训练营（门槛 60）", threshold: 60 },
  { eventId: 1002, name: "大师班（门槛 85）", threshold: 85 },
];

export function findEvent(eventId: number): EventPolicy | undefined {
  return EVENTS.find((event) => event.eventId === eventId);
}
