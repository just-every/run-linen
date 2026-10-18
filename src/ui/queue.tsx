import { createContext, useContext, type ReactNode } from "react";
import { useRemote } from "./state";
import type { WorkRecord } from "./work";

type Queue = ReturnType<typeof useRemote<{ items: WorkRecord[] }>>;
const QueueContext = createContext<Queue | null>(null);

/** One read of the request queue, shared by the rail's badge and the Requests workbench. */
export function QueueProvider({ children }: { children: ReactNode }) {
  const queue = useRemote<{ items: WorkRecord[] }>("/work", 30000);
  return <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>;
}
export function useQueue() {
  const value = useContext(QueueContext);
  if (!value) throw new Error("Queue context required");
  return value;
}
/** Open work: everything not yet closed or cancelled. */
export const isOpen = (item: WorkRecord) => !["closed", "cancelled"].includes(item.state);
