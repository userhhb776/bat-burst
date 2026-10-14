import { normalizePhone } from "@/lib/crm";

type ImportGroup = { id: string; subject: string; participants: { phone: string; name: string; admin: boolean }[] };

export function prepareGroupContacts(groups: ImportGroup[], selected: Set<string>, skipAdmins: boolean) {
  const contacts = new Map<string, { phone: string; name: string; company: string; source: string; is_admin: boolean; is_valid: boolean; tags: string[] }>();
  for (const group of groups) {
    if (!selected.has(group.id)) continue;
    for (const participant of group.participants) {
      if (skipAdmins && participant.admin) continue;
      const number = normalizePhone(participant.phone);
      if (!number.valid) continue;
      const previous = contacts.get(number.phone);
      if (previous) {
        if (!previous.tags.includes(group.subject)) previous.tags.push(group.subject);
        continue;
      }
      contacts.set(number.phone, { phone: number.phone, name: participant.name, company: group.subject, source: "grupo", is_admin: participant.admin, is_valid: true, tags: ["grupo", group.subject] });
    }
  }
  return [...contacts.values()];
}