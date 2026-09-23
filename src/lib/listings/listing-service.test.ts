import { describe, it, expect, vi, beforeEach } from "vitest";

const generateListingContent = vi.fn();
const generateListingSection = vi.fn();
vi.mock("@/lib/listings/listing-generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/listings/listing-generation-service")>("@/lib/listings/listing-generation-service");
  return { ...actual, generateListingContent, generateListingSection };
});

const { generateListing, regenerateListingSection, updateListing, ListingServiceError } = await import("@/lib/listings/listing-service");
const { ListingGenerationServiceError } = await import("@/lib/listings/listing-generation-service");

type Row = Record<string, unknown>;
type Db = { product_bundles: Row[]; product_listings: Row[] };

let idCounter = 0;
function genId() {
  idCounter += 1;
  return `l_${idCounter}`;
}

function makeFakeSupabase(db: Db) {
  function makeBuilder(op: "select" | "insert" | "update", table: keyof Db, payload?: Row) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "list" | "single" | "maybeSingle" = "list";

    const builder = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      select() {
        return builder;
      },
      single() {
        mode = "single";
        return builder;
      },
      maybeSingle() {
        mode = "maybeSingle";
        return builder;
      },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        execute().then(resolve, reject);
      },
    };

    async function execute() {
      if (op === "select") {
        const matched = db[table].filter((r) => filters.every((f) => f(r)));
        if (mode === "single") {
          if (matched.length === 0) return { data: null, error: { message: "no rows" } };
          return { data: matched[0], error: null };
        }
        if (mode === "maybeSingle") return { data: matched[0] ?? null, error: null };
        return { data: matched, error: null };
      }
      if (op === "insert") {
        const row: Row = { id: genId(), metadata: {}, generation_version: 1, ...payload };
        db[table].push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        const matched = db[table].filter((r) => filters.every((f) => f(r)));
        matched.forEach((r) => Object.assign(r, payload));
        return { data: matched, error: null };
      }
      return { data: null, error: null };
    }

    return builder;
  }

  return {
    from(table: keyof Db) {
      return {
        select: () => makeBuilder("select", table),
        insert: (payload: Row) => makeBuilder("insert", table, payload),
        update: (payload: Row) => makeBuilder("update", table, payload),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

beforeEach(() => {
  generateListingContent.mockReset();
  generateListingSection.mockReset();
});

function baseDb(): Db {
  return {
    product_bundles: [{ id: "b1", user_id: "u1", project_id: "p1" }],
    product_listings: [],
  };
}

const successContent = {
  title: "A Title",
  description: "A description",
  tags: ["tag1", "tag2"],
  seoKeywords: ["keyword1"],
  includedFiles: ["PNG"],
  materials: ["Digital file", "PNG file"],
  providerName: "mock",
};

describe("generateListing", () => {
  it("first-time generation inserts a new row with status=generated", async () => {
    generateListingContent.mockResolvedValue(successContent);
    const db = baseDb();
    const supabase = makeFakeSupabase(db);

    const result = await generateListing({ supabase, userId: "u1" }, "b1", "generic");

    expect(db.product_listings).toHaveLength(1);
    expect(db.product_listings[0].status).toBe("generated");
    expect(db.product_listings[0].title).toBe("A Title");
    expect(result.listingId).toBe(db.product_listings[0].id);
  });

  it("regenerating an unedited existing row updates it in place — no duplicate row", async () => {
    generateListingContent.mockResolvedValue(successContent);
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic", status: "generated", metadata: {}, generation_version: 1 }];
    const supabase = makeFakeSupabase(db);

    await generateListing({ supabase, userId: "u1" }, "b1", "generic");

    expect(db.product_listings).toHaveLength(1);
    expect(db.product_listings[0].id).toBe("existing");
    expect(db.product_listings[0].generation_version).toBe(2);
  });

  it("edit protection: regenerating a row with an edited section requires confirmOverwriteEdits", async () => {
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic", status: "edited", metadata: { titleEdited: true }, title: "Hand-edited title" }];
    const supabase = makeFakeSupabase(db);

    await expect(generateListing({ supabase, userId: "u1" }, "b1", "generic")).rejects.toMatchObject({ code: "edit_protected" });
    expect(generateListingContent).not.toHaveBeenCalled();
    // The hand-edited content must survive the rejected attempt.
    expect(db.product_listings[0].title).toBe("Hand-edited title");
  });

  it("edit protection: confirmOverwriteEdits=true proceeds and clears edited flags", async () => {
    generateListingContent.mockResolvedValue(successContent);
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic", status: "edited", metadata: { titleEdited: true }, title: "Hand-edited title", generation_version: 1 }];
    const supabase = makeFakeSupabase(db);

    await generateListing({ supabase, userId: "u1" }, "b1", "generic", { confirmOverwriteEdits: true });

    expect(db.product_listings[0].title).toBe("A Title");
    expect(db.product_listings[0].status).toBe("generated");
  });

  it("provider failure on first generation inserts a failed row with no content to preserve", async () => {
    generateListingContent.mockRejectedValue(new ListingGenerationServiceError("provider down", "provider_error"));
    const db = baseDb();
    const supabase = makeFakeSupabase(db);

    await expect(generateListing({ supabase, userId: "u1" }, "b1", "generic")).rejects.toMatchObject({ code: "generation_failed" });
    expect(db.product_listings).toHaveLength(1);
    expect(db.product_listings[0].status).toBe("failed");
    expect(db.product_listings[0].error_message).toBe("provider down");
  });

  it("provider failure on a REGENERATION never destroys the previously saved listing content", async () => {
    generateListingContent.mockRejectedValue(new ListingGenerationServiceError("provider down", "provider_error"));
    const db = baseDb();
    db.product_listings = [{
      id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic",
      status: "generated", metadata: {}, title: "Previously good title", description: "Previously good description", tags: ["good-tag"],
    }];
    const supabase = makeFakeSupabase(db);

    await expect(generateListing({ supabase, userId: "u1" }, "b1", "generic")).rejects.toMatchObject({ code: "generation_failed" });

    expect(db.product_listings[0].title).toBe("Previously good title");
    expect(db.product_listings[0].description).toBe("Previously good description");
    expect(db.product_listings[0].status).toBe("failed");
    expect(db.product_listings[0].error_message).toBe("provider down");
  });

  it("throws not_found for a bundle the user does not own", async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);
    await expect(generateListing({ supabase, userId: "someone-else" }, "b1", "generic")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("regenerateListingSection", () => {
  it("regenerates exactly one section, leaving other fields untouched", async () => {
    generateListingSection.mockResolvedValue({ section: "title", title: "New Title" });
    const db = baseDb();
    db.product_listings = [{
      id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic",
      status: "edited", metadata: { descriptionEdited: true }, title: "Old Title", description: "Hand-edited description", tags: ["a"],
    }];
    const supabase = makeFakeSupabase(db);

    await regenerateListingSection({ supabase, userId: "u1" }, "existing", "title");

    expect(db.product_listings[0].title).toBe("New Title");
    expect(db.product_listings[0].description).toBe("Hand-edited description"); // untouched
    expect(db.product_listings[0].tags).toEqual(["a"]); // untouched
    // description is still edited, so overall status stays 'edited', not 'generated'
    expect(db.product_listings[0].status).toBe("edited");
  });

  it("edit protection on the SPECIFIC section requires confirmOverwriteEdits", async () => {
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic", status: "edited", metadata: { titleEdited: true }, title: "Hand-edited" }];
    const supabase = makeFakeSupabase(db);

    await expect(regenerateListingSection({ supabase, userId: "u1" }, "existing", "title")).rejects.toMatchObject({ code: "edit_protected" });
    expect(generateListingSection).not.toHaveBeenCalled();
  });

  it("regenerating an UNEDITED section proceeds without confirmation even if other sections are edited", async () => {
    generateListingSection.mockResolvedValue({ section: "tags", tags: ["new-tag"] });
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic", status: "edited", metadata: { titleEdited: true }, tags: ["old-tag"] }];
    const supabase = makeFakeSupabase(db);

    await regenerateListingSection({ supabase, userId: "u1" }, "existing", "tags");
    expect(db.product_listings[0].tags).toEqual(["new-tag"]);
  });

  it("status becomes 'generated' once the last edited section is regenerated", async () => {
    generateListingSection.mockResolvedValue({ section: "title", title: "New Title" });
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic", status: "edited", metadata: { titleEdited: true }, title: "Old" }];
    const supabase = makeFakeSupabase(db);

    await regenerateListingSection({ supabase, userId: "u1" }, "existing", "title", { confirmOverwriteEdits: true });
    expect(db.product_listings[0].status).toBe("generated");
  });
});

describe("updateListing", () => {
  it("marks only the touched fields as edited", async () => {
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "generic", status: "generated", metadata: {}, title: "Old", tags: ["a"] }];
    const supabase = makeFakeSupabase(db);

    await updateListing({ supabase, userId: "u1" }, "existing", { title: "New title" });

    expect(db.product_listings[0].title).toBe("New title");
    expect(db.product_listings[0].metadata).toMatchObject({ titleEdited: true });
    expect(db.product_listings[0].status).toBe("edited");
  });

  it("normalizes tags on manual edit (dedupe, trim, marketplace cap)", async () => {
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "u1", project_id: "p1", bundle_id: "b1", marketplace: "etsy", status: "generated", metadata: {}, tags: [] }];
    const supabase = makeFakeSupabase(db);

    await updateListing({ supabase, userId: "u1" }, "existing", { tags: ["cute", "cute", " stickers "] });

    expect(db.product_listings[0].tags).toEqual(["cute", "stickers"]);
  });

  it("throws ListingServiceError not_found for someone else's listing", async () => {
    const db = baseDb();
    db.product_listings = [{ id: "existing", user_id: "someone-else", project_id: "p1", bundle_id: "b1", marketplace: "generic" }];
    const supabase = makeFakeSupabase(db);
    await expect(updateListing({ supabase, userId: "u1" }, "existing", { title: "x" })).rejects.toBeInstanceOf(ListingServiceError);
  });
});
