/**
 * Canonical MSFS 2024 SimConnect Key Names used by the autopilot adapter.
 *
 * These are the names passed to SimConnect_MapClientEventToSimEvent. They are
 * intentionally not the JavaScript K: variable names and do not include the
 * KEY_ prefix used by the Event ID column in the SDK documentation.
 */
export const autopilotKeyEvents = {
  autopilotOn: 'AUTOPILOT_ON',
  autopilotOff: 'AUTOPILOT_OFF',
  flightDirectorToggle: 'TOGGLE_FLIGHT_DIRECTOR',
  headingOn: 'AP_PANEL_HEADING_ON',
  headingOff: 'AP_PANEL_HEADING_OFF',
  navigationOn: 'AP_NAV1_HOLD_ON',
  navigationOff: 'AP_NAV1_HOLD_OFF',
  altitudeOn: 'AP_PANEL_ALTITUDE_ON',
  altitudeOff: 'AP_PANEL_ALTITUDE_OFF',
  verticalSpeedOn: 'AP_VS_ON',
  verticalSpeedOff: 'AP_VS_OFF',
  flightLevelChangeOn: 'FLIGHT_LEVEL_CHANGE_ON',
  flightLevelChangeOff: 'FLIGHT_LEVEL_CHANGE_OFF',
} as const;

export const autopilotTargetKeyEvents = {
  heading: {
    event: 'HEADING_BUG_SET',
    slotIndexSimvar: 'AUTOPILOT HEADING SLOT INDEX',
    readbackSimvar: 'AUTOPILOT HEADING LOCK DIR',
  },
  altitude: {
    event: 'AP_ALT_VAR_SET_ENGLISH',
    slotIndexSimvar: 'AUTOPILOT ALTITUDE SLOT INDEX',
    readbackSimvar: 'AUTOPILOT ALTITUDE LOCK VAR',
  },
  speed: {
    event: 'AP_SPD_VAR_SET',
    slotIndexSimvar: 'AUTOPILOT SPEED SLOT INDEX',
    readbackSimvar: 'AUTOPILOT AIRSPEED HOLD VAR',
  },
  verticalSpeed: {
    event: 'AP_VS_VAR_SET_ENGLISH',
    slotIndexSimvar: 'AUTOPILOT VS SLOT INDEX',
    readbackSimvar: 'AUTOPILOT VERTICAL HOLD VAR',
  },
} as const;

export type AutopilotTargetKey = keyof typeof autopilotTargetKeyEvents;

/**
 * Official target-slot ranges: altitude, heading, and VS expose slots 1-3
 * (plus the special slot 0); managed speed exposes slots 1-4 (plus slot 0).
 */
export const autopilotTargetSlotMaximum: Record<AutopilotTargetKey, number> = {
  heading: 3,
  altitude: 3,
  speed: 4,
  verticalSpeed: 3,
};

export const isAutopilotTargetSlotIndexValid = (
  target: AutopilotTargetKey,
  slotIndex: number,
): boolean =>
  Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex <= autopilotTargetSlotMaximum[target];

/**
 * SimConnect transmits Key Event data as DWORD values. Negative event values
 * therefore need their 32-bit two's-complement representation before they are
 * serialized by the CLI. The native CLI intentionally accepts the resulting
 * unsigned word.
 */
export const encodeKeyEventWord = (value: number): number => {
  const integer = Math.trunc(value);
  if (!Number.isSafeInteger(integer) || integer < -0x8000_0000 || integer > 0xffff_ffff) {
    throw new Error(`Key Event data is outside the supported 32-bit range: ${value}`);
  }
  return integer >>> 0;
};

export const encodeAutopilotTargetData = (
  target: AutopilotTargetKey,
  value: number,
  slotIndex: number,
): readonly [number, number] => {
  if (!isAutopilotTargetSlotIndexValid(target, slotIndex)) {
    throw new Error(`Invalid ${target} autopilot slot index: ${slotIndex}`);
  }
  return [encodeKeyEventWord(value), encodeKeyEventWord(slotIndex)];
};
