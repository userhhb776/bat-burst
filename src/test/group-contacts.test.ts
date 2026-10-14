import { describe, expect, it } from "vitest";
import { prepareGroupContacts } from "@/lib/group-contacts";

const groups = [
  { id: "a", subject: "Clientes A", participants: [
    { phone: "5511999998888", name: "Ana", admin: false },
    { phone: "5511988887777", name: "Admin", admin: true },
    { phone: "123", name: "Inválido", admin: false },
  ] },
  { id: "b", subject: "Clientes B", participants: [{ phone: "5511999998888", name: "Ana", admin: false }] },
];

describe("Group contact extraction", () => {
  it("imports only selected groups and excludes invalid numbers and admins by default", () => {
    const rows = prepareGroupContacts(groups, new Set(["a"]), true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Ana", source: "grupo", company: "Clientes A", is_valid: true });
  });
  it("deduplicates shared members while keeping their group tags", () => {
    const rows = prepareGroupContacts(groups, new Set(["a", "b"]), true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tags).toEqual(["grupo", "Clientes A", "Clientes B"]);
  });
  it("allows administrators when explicitly selected", () => {
    expect(prepareGroupContacts(groups, new Set(["a"]), false)).toHaveLength(2);
  });
  it("never imports from unselected groups", () => {
    expect(prepareGroupContacts(groups, new Set(), false)).toEqual([]);
  });
});