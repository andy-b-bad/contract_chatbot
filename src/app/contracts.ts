export type ContractScope =
  | "pact-cinema"
  | "pact-tv-svod"
  | "bbc-tv"
  | "itv-tv"
  | "commercial"
  | "mocap";

export type ContractScopeOption = {
  id: ContractScope;
  label: string;
  searchHint: string;
  docNameHints: string[];
};

const SHARED_SUMMARY_PAGE_RANGES: Record<ContractScope, string> = {
  "pact-cinema": "3-5",
  "pact-tv-svod": "6-8",
  "bbc-tv": "10",
  "itv-tv": "9",
  commercial: "11",
  mocap: "12",
};

export const DEFAULT_CONTRACT_SCOPE: ContractScope = "pact-cinema";

export const CONTRACT_SCOPE_OPTIONS = [
  {
    id: "pact-cinema",
    label: "Pact Cinema",
    searchHint: "Pact Cinema",
    docNameHints: [
      "pact-equity-cinema",
      "cinema-films-agreement",
      "pact-cinema",
    ],
  },
  {
    id: "pact-tv-svod",
    label: "Pact TV & SVoD",
    searchHint: "Pact TV SVoD",
    docNameHints: [
      "pact-equity-tv",
      "pact-tv",
      "tv-svod",
      "svod",
    ],
  },
  {
    id: "bbc-tv",
    label: "BBC TV",
    searchHint: "BBC TV",
    docNameHints: ["bbc"],
  },
  {
    id: "itv-tv",
    label: "ITV TV",
    searchHint: "ITV TV",
    docNameHints: ["itv"],
  },
  {
    id: "commercial",
    label: "Commercial",
    searchHint: "Commercial",
    docNameHints: ["commercial"],
  },
  {
    id: "mocap",
    label: "MoCap",
    searchHint: "MoCap motion capture",
    docNameHints: ["mocap", "motion-capture", "motion_capture", "motion capture"],
  },
] as const satisfies readonly ContractScopeOption[];

const SHARED_SUMMARY_NAME_HINTS = [
  "summary",
  "combined rate card",
  "latest_rates_and_definitions",
];

function normalizeDocumentName(name: string) {
  return name.trim().toLowerCase();
}

export function parseContractScope(value: unknown): ContractScope {
  if (
    typeof value === "string" &&
    CONTRACT_SCOPE_OPTIONS.some((option) => option.id === value)
  ) {
    return value as ContractScope;
  }

  return DEFAULT_CONTRACT_SCOPE;
}

export function getContractScopeOption(scope: ContractScope) {
  return (
    CONTRACT_SCOPE_OPTIONS.find((option) => option.id === scope) ??
    CONTRACT_SCOPE_OPTIONS[0]
  );
}

export function isSharedSummaryDocumentName(name: string) {
  const normalizedName = normalizeDocumentName(name);

  return SHARED_SUMMARY_NAME_HINTS.some((hint) =>
    normalizedName.includes(hint),
  );
}

function expandPageSelection(pages: string) {
  const selectedPages = new Set<number>();

  for (const segment of pages.split(",")) {
    const trimmedSegment = segment.trim();

    if (!trimmedSegment) {
      continue;
    }

    const rangeMatch = trimmedSegment.match(/^(\d+)\s*-\s*(\d+)$/);

    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);

      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
        return null;
      }

      for (let page = start; page <= end; page += 1) {
        selectedPages.add(page);
      }

      continue;
    }

    const page = Number(trimmedSegment);

    if (!Number.isInteger(page)) {
      return null;
    }

    selectedPages.add(page);
  }

  return [...selectedPages];
}

export function documentMatchesScope(name: string, scope: ContractScope) {
  const normalizedName = normalizeDocumentName(name);
  const scopeOption = getContractScopeOption(scope);

  return scopeOption.docNameHints.some((hint) => normalizedName.includes(hint));
}

export function isDocumentAllowedForScope(name: string, scope: ContractScope) {
  return isSharedSummaryDocumentName(name) || documentMatchesScope(name, scope);
}

export function getSharedSummaryPageRange(scope: ContractScope) {
  return SHARED_SUMMARY_PAGE_RANGES[scope];
}

export function isSharedSummaryPageSelectionAllowed(
  pages: string,
  scope: ContractScope,
) {
  const allowedPages = expandPageSelection(getSharedSummaryPageRange(scope));
  const requestedPages = expandPageSelection(pages);

  if (!allowedPages || !requestedPages) {
    return false;
  }

  const allowedPageSet = new Set(allowedPages);

  return requestedPages.every((page) => allowedPageSet.has(page));
}
