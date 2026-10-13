import { useRemote, useSession } from "./state";
import { text, type RecordValue } from "./api";
export function usePeopleLabels() {
  const { session } = useSession(),
    members = useRemote<RecordValue[]>(
      session.principal.roles.some((r) =>
        ["owner", "operator", "hr", "auditor"].includes(r),
      )
        ? "/members"
        : null,
    );
  return (id: unknown) =>
    id === session.user.id
      ? session.user.name
      : text(
          members.data?.find((m) => m.id === id)?.name,
          id ? String(id) : "Not assigned yet",
        );
}
