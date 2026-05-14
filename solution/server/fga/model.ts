// =============================================================
// FGA model -- RetailZero Z-Merchant wholesale account graph
//
// Relationships:
//   user -> owns -> account          (rep is account owner)
//   user -> manages -> team          (manager leads a team)
//   team -> owns -> account          (team collectively owns account)
//   user -> reads  -> catalog        (inherent to rep role)
//
// can_read_account = owns OR (manages team AND team owns account)
// can_commit_quote = owns account (managers can commit too)
// =============================================================

export const FGA_MODEL = {
  type_definitions: [
    { type: "user" },
    {
      type: "team",
      relations: {
        member: { directly_related: ["user"] },
        manager: { directly_related: ["user"] },
      },
    },
    {
      type: "account",
      relations: {
        owner: { directly_related: ["user"] },
        owning_team: { directly_related: ["team"] },
        can_read: { union: ["owner", "owning_team#manager", "owning_team#member"] },
        can_commit: { union: ["owner", "owning_team#manager"] },
      },
    },
    {
      type: "catalog",
      relations: {
        reader: { directly_related: ["user"] },
      },
    },
  ],
};

// Demo account catalog (tiered pricing by buyer tier).
export const ACCOUNTS: Record<
  string,
  { name: string; tier: "tier-1" | "tier-2" | "tier-3"; segment: string }
> = {
  acme: { name: "Acme Corp", tier: "tier-2", segment: "Industrial" },
  globex: { name: "Globex Wholesale", tier: "tier-2", segment: "Retail" },
  initech: { name: "Initech Supply", tier: "tier-3", segment: "SMB" },
  stark: { name: "Stark Enterprises", tier: "tier-1", segment: "Strategic" },
};

// Demo SKU catalog.
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
