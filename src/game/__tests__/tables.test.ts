import { describe, expect, it } from "vitest";
import { TABLES, findTable, tableName } from "../tables";

describe("tables", () => {
  it("keeps Table 1 on the id the single table always had", () => {
    expect(TABLES.map((t) => t.id)).toEqual(["TABLE", "TABLE2", "TABLE3"]);
    expect(findTable("TABLE")?.name).toBe("Table 1");
  });

  it("accepts TABLE1 and any case", () => {
    expect(findTable("TABLE1")?.id).toBe("TABLE");
    expect(findTable("table1")?.id).toBe("TABLE");
    expect(findTable("Table3")?.id).toBe("TABLE3");
  });

  it("knows no fourth table", () => {
    expect(findTable("TABLE4")).toBeNull();
    expect(findTable("TABLE0")).toBeNull();
    expect(findTable("")).toBeNull();
  });

  it("names a table for showing, and leaves an unknown id as it is", () => {
    expect(tableName("TABLE2")).toBe("Table 2");
    expect(tableName("XYZW")).toBe("XYZW");
  });
});
