// Single source of truth for ABR (Australian Business Register) lookups.
//
// Endpoint: https://abr.business.gov.au/json/AbnDetails.aspx?abn=<ABN>&callback=callback&guid=<GUID>
//
// The GUID is issued per-user by data.gov.au; required by ABR's terms of
// service. Do not commit it. Set ABR_GUID in .env.prod / docker-compose env.
//
// Response shape (JSONP-wrapped — strip the `callback(...)` wrapper):
//   { Abn, AbnStatus, AbnStatusEffectiveFrom, Acn, AddressDate,
//     AddressPostcode, AddressState, BusinessName: string[],
//     EntityName, EntityTypeCode, EntityTypeName,
//     Gst, Message }
//
// `Gst` is the date GST was first registered (or empty if not registered),
// not the literal string "Active" — earlier code in this codebase compared
// `json.Gst === 'Active'` which never matches. We treat any non-empty Gst
// value as "registered".

import { AppError } from '../lib/errors.js';
import { validateABN } from './compliance.service.js';

export interface AbrLookupResult {
  abn: string;
  status: string;
  is_active: boolean;
  entity_name: string | null;
  entity_type_code: string | null;
  entity_type_name: string | null;
  acn: string | null;
  gst_registered: boolean;
  gst_effective_from: string | null;
  address_state: string | null;
  address_postcode: string | null;
  abn_status_effective_from: string | null;
  trading_names: string[];
  raw: Record<string, unknown>;
}

interface AbrJsonResponse {
  Abn?: string;
  AbnStatus?: string;
  AbnStatusEffectiveFrom?: string;
  Acn?: string;
  AddressPostcode?: string;
  AddressState?: string;
  BusinessName?: string[];
  EntityName?: string;
  EntityTypeCode?: string;
  EntityTypeName?: string;
  Gst?: string;
  Message?: string;
}

const ABR_BASE = 'https://abr.business.gov.au/json/AbnDetails.aspx';
const ABR_TIMEOUT_MS = 8000;

function emptyToNull(v: string | undefined): string | null {
  if (v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Look up an ABN against the ABR. Throws AppError with code:
 *   - INVALID_FORMAT   (400)  — ABN fails the ATO checksum
 *   - ABR_NOT_CONFIGURED (500) — ABR_GUID env var missing
 *   - ABR_UNAVAILABLE  (502)  — network / upstream timeout / unparseable response
 *   - ABR_NOT_FOUND    (404)  — ABR replied with no entity (Message includes "not found")
 *   - ABN_INACTIVE     (409)  — ABN found but status is not "Active"
 */
export async function lookupAbn(abn: string): Promise<AbrLookupResult> {
  const clean = abn.replace(/\s/g, '');
  if (!validateABN(clean)) {
    throw new AppError('INVALID_FORMAT', 400, 'ABN failed checksum validation.');
  }

  const guid = process.env.ABR_GUID;
  if (!guid) {
    throw new AppError(
      'ABR_NOT_CONFIGURED',
      500,
      'ABR_GUID is not set. Register at abr.business.gov.au/Tools/WebServices and add the GUID to your environment.',
    );
  }

  const url = `${ABR_BASE}?abn=${clean}&callback=callback&guid=${encodeURIComponent(guid)}`;

  let text: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ABR_TIMEOUT_MS) });
    if (!res.ok) {
      throw new AppError('ABR_UNAVAILABLE', 502, `ABR responded with HTTP ${res.status}.`);
    }
    text = await res.text();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('ABR_UNAVAILABLE', 502, 'Could not reach the ABR. Try again shortly.');
  }

  // Strip the JSONP wrapper. ABR always returns `callback(<json>)` for this endpoint.
  const match = text.match(/^callback\((.*)\)\s*;?\s*$/s);
  const body = match?.[1] ?? text;

  let json: AbrJsonResponse;
  try {
    json = JSON.parse(body) as AbrJsonResponse;
  } catch {
    throw new AppError('ABR_UNAVAILABLE', 502, 'Could not parse ABR response.');
  }

  // ABR returns 200 with an empty body + a Message when the ABN doesn't exist.
  if (!json.Abn || json.Abn.trim() === '') {
    const reason = (json.Message ?? '').trim();
    throw new AppError('ABR_NOT_FOUND', 404, reason || 'ABN not found in the ABR.');
  }

  if (!json.AbnStatus || json.AbnStatus !== 'Active') {
    // Caller still gets the parsed payload via the error message; useful for
    // showing the user "ABN was Cancelled on YYYY-MM-DD".
    throw new AppError(
      'ABN_INACTIVE',
      409,
      `ABN status is "${json.AbnStatus ?? 'Unknown'}" — only Active ABNs can be used on the platform.`,
    );
  }

  const gstFrom = emptyToNull(json.Gst);

  return {
    abn: clean,
    status: json.AbnStatus,
    is_active: true,
    entity_name: emptyToNull(json.EntityName),
    entity_type_code: emptyToNull(json.EntityTypeCode),
    entity_type_name: emptyToNull(json.EntityTypeName),
    acn: emptyToNull(json.Acn),
    gst_registered: gstFrom !== null,
    gst_effective_from: gstFrom,
    address_state: emptyToNull(json.AddressState),
    address_postcode: emptyToNull(json.AddressPostcode),
    abn_status_effective_from: emptyToNull(json.AbnStatusEffectiveFrom),
    trading_names: Array.isArray(json.BusinessName)
      ? json.BusinessName.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      : [],
    raw: json as unknown as Record<string, unknown>,
  };
}
