/**
 * Capability identity parsing and canonicalization.
 *
 * Implements the naming grammar from Docs/registry/14_Capability_Naming_And_Resolution_Implementation_Plan.md
 *
 * Supported input forms:
 *   Relative:        my.app/my.capability@1.0
 *   Alias-qualified: @partner/my.app/my.capability@1.0
 *   Canonical:       cap:@main/my.app/my.capability@1.0.0
 */

const SERVICE_NAME = "capabilities-client:identity";

// ── Types ────────────────────────────────────────────────────────────

export interface ParsedReference {
  /** Registry alias (e.g. "main", "partner") — undefined if not provided in input */
  alias?: string;
  /** Application identifier (e.g. "my.app") */
  app: string;
  /** Capability identifier (e.g. "my.capability") */
  cap: string;
  /** Version string if provided (e.g. "1.0", "1.2.3-beta1") — undefined if omitted */
  version?: string;
  /** Raw input string */
  raw: string;
}

export interface CanonicalizeOptions {
  /** Default alias when input has no @alias (defaults to "main") */
  defaultAlias?: string;
  /** If version is missing, use this as the resolved version */
  resolvedVersion?: string;
}

// ── Validation regexes ───────────────────────────────────────────────

const ALIAS_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const APP_CAP_RE = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
const ILLEGAL_CHARS_RE = /[#?\s\0]/;
const VERSION_STRIP_V_RE = /^v(\d.*)$/;
const VERSION_FULL_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9._-]+)?(\+[a-zA-Z0-9._-]+)?$/;
const VERSION_SHORT_RE = /^\d+\.\d+$/;
const VERSION_MAJOR_RE = /^\d+$/;

// ── Parse ────────────────────────────────────────────────────────────

/**
 * Parse a capability reference string into its components.
 * Accepts relative, alias-qualified, and canonical (cap:@...) forms.
 *
 * @throws Error on invalid format
 */
export function parseReference(input: string): ParsedReference {
  const raw = input.trim();
  if (!raw) {
    throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - empty input` });
  }

  if (ILLEGAL_CHARS_RE.test(raw)) {
    throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - illegal characters in "${raw}"` });
  }

  let working = raw;

  // Strip canonical prefix  cap:
  if (working.startsWith("cap:")) {
    working = working.slice(4);
  }

  // Extract alias if present (@alias/ at start)
  let alias: string | undefined;
  if (working.startsWith("@")) {
    const slashIdx = working.indexOf("/");
    if (slashIdx === -1) {
      throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - alias missing "/" in "${raw}"` });
    }
    alias = working.slice(1, slashIdx).toLowerCase();
    if (!alias || !ALIAS_RE.test(alias)) {
      throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - invalid alias "${alias}" in "${raw}"` });
    }
    working = working.slice(slashIdx + 1);
  }

  // Remaining: app/cap[@version]
  // Split on first "/" to get app, then remainder is cap[@version]
  const slashIdx = working.indexOf("/");
  if (slashIdx === -1) {
    throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - missing "/" between app and cap in "${raw}"` });
  }

  const app = working.slice(0, slashIdx);
  let capAndVersion = working.slice(slashIdx + 1);

  if (!app) {
    throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - empty app in "${raw}"` });
  }
  if (!APP_CAP_RE.test(app)) {
    throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - invalid app "${app}" in "${raw}"` });
  }

  // Extract version from cap: last "@" that is a version delimiter (not alias @)
  let version: string | undefined;
  const atIdx = capAndVersion.lastIndexOf("@");
  let cap: string;
  if (atIdx !== -1) {
    cap = capAndVersion.slice(0, atIdx);
    version = capAndVersion.slice(atIdx + 1);
    if (!version) {
      throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - empty version after "@" in "${raw}"` });
    }
  } else {
    cap = capAndVersion;
  }

  if (!cap) {
    throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - empty capability name in "${raw}"` });
  }
  if (!APP_CAP_RE.test(cap)) {
    throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:parseReference - invalid capability name "${cap}" in "${raw}"` });
  }

  return { alias, app, cap, version, raw };
}

// ── Normalize version ────────────────────────────────────────────────

/**
 * Normalize a version input to major.minor.patch[-prerelease][+build].
 * Strips leading "v"; pads missing minor/patch with 0.
 */
export function normalizeVersion(input: string): string {
  let v = input.trim();

  // Strip leading v
  const vMatch = VERSION_STRIP_V_RE.exec(v);
  if (vMatch) {
    v = vMatch[1];
  }

  // Already full  1.2.3 or 1.2.3-beta1 etc
  if (VERSION_FULL_RE.test(v)) return v;

  // Short  1.2 → 1.2.0
  if (VERSION_SHORT_RE.test(v)) return v + ".0";

  // Major only  1 → 1.0.0
  if (VERSION_MAJOR_RE.test(v)) return v + ".0.0";

  throw new IdentityError({ code: "INVALID_REFERENCE", message: `${SERVICE_NAME}:normalizeVersion - invalid version "${input}"` });
}

// ── Canonicalize ─────────────────────────────────────────────────────

/**
 * Build a canonical identity string from a parsed reference (or raw input).
 *
 * cap:@{alias}/{app}/{cap}@{version}
 *
 * @param input - raw reference string or ParsedReference
 * @param options - default alias, resolved version
 * @returns canonical identity string
 * @throws if version is missing and no resolvedVersion provided
 */
export function canonicalize(input: string | ParsedReference, options?: CanonicalizeOptions): string {
  const parsed = typeof input === "string" ? parseReference(input) : input;
  const alias = (parsed.alias ?? options?.defaultAlias ?? "main").toLowerCase();
  const version = parsed.version
    ? normalizeVersion(parsed.version)
    : options?.resolvedVersion
      ? normalizeVersion(options.resolvedVersion)
      : undefined;

  if (!version) {
    throw new IdentityError({
      code: "INVALID_REFERENCE",
      message: `${SERVICE_NAME}:canonicalize - version required for canonical identity (input: "${parsed.raw}")`,
    });
  }

  return `cap:@${alias}/${parsed.app}/${parsed.cap}@${version}`;
}

// ── Error type ───────────────────────────────────────────────────────

export interface IdentityErrorOptions {
  code: "INVALID_REFERENCE" | "UNKNOWN_ALIAS";
  message: string;
}

export class IdentityError extends Error {
  code: string;

  constructor(options: IdentityErrorOptions) {
    super(options.message);
    this.name = "IdentityError";
    this.code = options.code;
  }
}
