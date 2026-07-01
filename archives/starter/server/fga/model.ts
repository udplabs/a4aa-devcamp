// =============================================================
// LAB 03: Define the FGA Authorization Model
// See: lab-guide/03-fine-grained-authorization.md
//
// RetailZero Z-Merchant wholesale account graph:
//   user -> owns    -> account
//   user -> manages -> team
//   team -> owns    -> account
//   user -> reads   -> catalog
//
// can_read_account  = owns OR (manages team AND team owns account)
// can_commit_quote  = owns account OR manages owning team
// =============================================================

// TODO(lab-03): fill in the type_definitions to encode the graph above.
// The finished model matches solution/server/fga/model.ts and includes
// union relations for can_read and can_commit on the `account` type.
export const FGA_MODEL = {
  type_definitions: [] as any[],
};

// Pre-built: the demo account + catalog data. Do not modify.
export const ACCOUNTS: Record<
  string,
  { name: string; tier: "tier-1" | "tier-2" | "tier-3"; segment: string }
> = {
  acme: { name: "Acme Corp", tier: "tier-2", segment: "Industrial" },
  globex: { name: "Globex Wholesale", tier: "tier-2", segment: "Retail" },
  initech: { name: "Initech Supply", tier: "tier-3", segment: "SMB" },
  stark: { name: "Stark Enterprises", tier: "tier-1", segment: "Strategic" },
};

export const CATALOG: Record<
  string,
  { name: string; listPrice: number; tierPrice: Record<string, number> }
> = {
  "SKU-WX-42": {
    name: "WX-42 Wholesale Bundle",
    listPrice: 120.0,
    tierPrice: { "tier-1": 80.0, "tier-2": 95.0, "tier-3": 110.0 },
  },
  "SKU-ZR-09": {
    name: "ZR-09 Industrial Kit",
    listPrice: 340.0,
    tierPrice: { "tier-1": 240.0, "tier-2": 280.0, "tier-3": 320.0 },
  },
  "SKU-LT-21": {
    name: "LT-21 Logistics Pack",
    listPrice: 55.0,
    tierPrice: { "tier-1": 38.0, "tier-2": 44.0, "tier-3": 50.0 },
  },
};
