import type { TelemetryValues } from "@open-efb/shared";

/**
 * FSUIPC raw value -> internal unit. Scaling factors come from the official
 * "FSUIPC4 Offsets Status" document (fsuipc.simflight.com/beta/FSUIPC4_Offsets_Status.pdf).
 */
const M_TO_FT = 3.280839895;
const MS_TO_KT = 1.943844492;
const TWO_32 = 4294967296;

/** Raw values exactly as the WebSocket server returned them, keyed by the names we declared. */
export type RawOffsets = Record<string, unknown>;

/** Accepts numbers and numeric strings. Anything else (NaN, objects, null) is unavailable. */
export function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

const inRange = (n: number | null, min: number, max: number): number | null => (n !== null && n >= min && n <= max ? n : null);

/** 0x0570, 8 bytes: whole metres in the high 32 bits, fraction in the low 32 bits. */
export const altitudeFt = (raw: unknown): number | null => {
  const n = asNumber(raw);
  return inRange(n === null ? null : (n / TWO_32) * M_TO_FT, -2000, 100_000);
};
/** 0x02B4, 4 bytes: metres per second x 65536. */
export const groundSpeedKt = (raw: unknown): number | null => {
  const n = asNumber(raw);
  return inRange(n === null ? null : (n / 65536) * MS_TO_KT, 0, 2000);
};
/** 0x02BC, 4 bytes: knots x 128. */
export const indicatedAirspeedKt = (raw: unknown): number | null => {
  const n = asNumber(raw);
  return inRange(n === null ? null : n / 128, 0, 2000);
};
/** 0x0580, 4 bytes: degrees true x 2^32 / 360. */
export const headingTrueDeg = (raw: unknown): number | null => {
  const n = asNumber(raw);
  if (n === null || n < 0 || n > TWO_32) return null;
  const d = (n * 360) / TWO_32;
  return d >= 360 ? d - 360 : d;
};
/** 0x02C8, 4 bytes, signed: metres per second x 256. */
export const verticalSpeedFpm = (raw: unknown): number | null => {
  const n = asNumber(raw);
  return inRange(n === null ? null : (n * 60 * M_TO_FT) / 256, -30_000, 30_000);
};
/** 0x0E8C, 2 bytes, signed: degrees C x 256. */
export const outsideAirTempC = (raw: unknown): number | null => {
  const n = asNumber(raw);
  return inRange(n === null ? null : n / 256, -120, 80);
};
/** 0x0366, 2 bytes: 0 airborne, 1 on ground. Any other value is treated as unknown. */
export const onGround = (raw: unknown): boolean | null => {
  const n = asNumber(raw);
  return n === 1 ? true : n === 0 ? false : null;
};

/** Latitude and longitude arrive already as decimal degrees (server "lat"/"lon" types). */
export const latitudeDeg = (raw: unknown): number | null => inRange(asNumber(raw), -90, 90);
export const longitudeDeg = (raw: unknown): number | null => inRange(asNumber(raw), -180, 180);

export function convertRaw(raw: RawOffsets): TelemetryValues {
  return {
    latitudeDeg: latitudeDeg(raw.latitude),
    longitudeDeg: longitudeDeg(raw.longitude),
    altitudeFt: altitudeFt(raw.altitude),
    groundSpeedKt: groundSpeedKt(raw.groundSpeed),
    indicatedAirspeedKt: indicatedAirspeedKt(raw.indicatedAirspeed),
    headingTrueDeg: headingTrueDeg(raw.heading),
    trackTrueDeg: null,
    verticalSpeedFpm: verticalSpeedFpm(raw.verticalSpeed),
    outsideAirTempC: outsideAirTempC(raw.outsideAirTemp),
    onGround: onGround(raw.onGround),
  };
}

/**
 * When FSUIPC is running but MSFS has not loaded a flight, the core offsets read as zero.
 * Position 0,0 with nothing moving is treated as "no data", not as a real aircraft.
 */
export function looksLikeNoSimData(raw: RawOffsets): boolean {
  return ["latitude", "longitude", "altitude", "groundSpeed", "indicatedAirspeed"].every((k) => asNumber(raw[k]) === 0);
}