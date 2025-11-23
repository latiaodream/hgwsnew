// Crown HK odds conversion helpers, ported from front-end JS in html.md

/**
 * Floor number to given decimal factor (Decimal_point in HG JS).
 */
function decimalPoint(value: number, factor: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const floored = Math.floor(abs * factor + 1 / factor) / factor;
  return floored * sign;
}

/**
 * get_HK_ior from front-end: internal integer math (x1000) then floor to nearest 10.
 */
function getHKIor(hRatio: number, cRatio: number): [number, number] {
  let outH = 0;
  let outC = 0;

  if (hRatio <= 1000 && cRatio <= 1000) {
    outH = Math.floor(hRatio / 10 + 0.0001) * 10;
    outC = Math.floor(cRatio / 10 + 0.0001) * 10;
    return [outH, outC];
  }

  const line = 2000 - (hRatio + cRatio);
  let lowRatio: number;
  let nowType: 'H' | 'C';

  if (hRatio > cRatio) {
    lowRatio = cRatio;
    nowType = 'C';
  } else {
    lowRatio = hRatio;
    nowType = 'H';
  }

  let nowRatio: number;
  if (2000 - line - lowRatio > 1000) {
    nowRatio = (lowRatio + line) * -1;
  } else {
    nowRatio = 2000 - line - lowRatio;
  }

  let highRatio: number;
  if (nowRatio < 0) {
    highRatio = Math.floor(Math.abs(1000 / nowRatio) * 1000);
  } else {
    highRatio = 2000 - line - nowRatio;
  }

  if (nowType === 'H') {
    outH = Math.floor(lowRatio / 10 + 0.0001) * 10;
    outC = Math.floor(highRatio / 10 + 0.0001) * 10;
  } else {
    outH = Math.floor(highRatio / 10 + 0.0001) * 10;
    outC = Math.floor(lowRatio / 10 + 0.0001) * 10;
  }

  return [outH, outC];
}

/**
 * chg_ior(odd_f="H") for HK odds only, plus Decimal_point + printf steps.
 *
 * @param iorHRaw - raw HK home odds from XML (e.g. 0.72, 1.17)
 * @param iorCRaw - raw HK away odds from XML
 * @param showIor - Decimal_point factor, front-end uses 100
 * @param iorPoints - number of decimal places, front-end CONFIG_IORATIO = 2
 */
export function chgIorHK(
  iorHRaw: number,
  iorCRaw: number,
  showIor: number = 100,
  iorPoints: number = 2,
): [number, number] {
  // mirror front-end guards
  if (!Number.isFinite(iorHRaw) || !Number.isFinite(iorCRaw)) {
    return [iorHRaw, iorCRaw] as [number, number];
  }

  // Floor to 3 decimals first
  let h = Math.floor(iorHRaw * 1000 + 0.001) / 1000;
  let c = Math.floor(iorCRaw * 1000 + 0.001) / 1000;

  // Scale < 11 into internal integer representation
  if (h < 11) h *= 1000;
  if (c < 11) c *= 1000;

  h = parseFloat(String(h));
  c = parseFloat(String(c));

  // HK only
  let [outH, outC] = getHKIor(h, c);

  // Back to decimals
  let home = outH / 1000;
  let away = outC / 1000;

  // Decimal_point + printf logic: floor to factor, then to fixed decimals.
  home = decimalPoint(home, showIor);
  away = decimalPoint(away, showIor);

  const toFixed = (v: number): number => {
    const s = v.toFixed(iorPoints);
    return parseFloat(s);
  };

  return [toFixed(home), toFixed(away)];
}

