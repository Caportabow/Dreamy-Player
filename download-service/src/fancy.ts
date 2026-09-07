/**
 * Normalize "fancy" Unicode text to plain ASCII — Mathematical Alphanumeric
 * Symbols (U+1D400–U+1D7FF, the bold/italic/sans-serif/monospace alphabets
 * used as stylized YouTube titles) and the Letterlike Symbols (U+2100–U+214F,
 * e.g. ℬ ℂ ℍ ℛ) decompose to their ASCII letters per the Unicode character
 * database. Generated from UnicodeData.txt (UCD); do not edit by hand.
 */

/** 1024 positions for U+1D400–U+1D7FF; '\u0000' marks unassigned codepoints. */
const MATH_ALPHA =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg\u0000ijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzA\u0000CD\u0000\u0000G\u0000\u0000JK\u0000\u0000NOPQ\u0000STUVWXYZabcd\u0000f\u0000hijklmn\u0000pqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzAB\u0000DEFG\u0000\u0000JKLMNOPQ\u0000STUVWXY\u0000abcdefghijklmnopqrstuvwxyzAB\u0000DEFG\u0000IJKLM\u0000O\u0000\u0000\u0000STUVWXY\u0000abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzıȷ\u0000\u0000ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖϜϝ\u0000\u000001234567890123456789012345678901234567890123456789'

/** Letterlike Symbols whose decomposition is a plain ASCII string. */
const LETTERLIKE: Record<string, string> = { '2100': 'a/c', '2101': 'a/s', '2102': 'C', '2103': '°C', '2105': 'c/o', '2106': 'c/u', '2107': 'Ɛ', '2109': '°F', '210a': 'g', '210b': 'H', '210c': 'H', '210d': 'H', '210e': 'h', '210f': 'ħ', '2110': 'I', '2111': 'I', '2112': 'L', '2113': 'l', '2115': 'N', '2116': 'No', '2119': 'P', '211a': 'Q', '211b': 'R', '211c': 'R', '211d': 'R', '2120': 'SM', '2121': 'TEL', '2122': 'TM', '2124': 'Z', '2126': 'Ω', '2128': 'Z', '212a': 'K', '212b': 'Å', '212c': 'B', '212d': 'C', '212f': 'e', '2130': 'E', '2131': 'F', '2133': 'M', '2134': 'o', '2135': 'א', '2136': 'ב', '2137': 'ג', '2138': 'ד', '2139': 'i', '213b': 'FAX', '213c': 'π', '213d': 'γ', '213e': 'Γ', '213f': 'Π', '2140': '∑', '2145': 'D', '2146': 'd', '2147': 'e', '2148': 'i', '2149': 'j' }

/** Map one fancy codepoint to its ASCII equivalent (identity when unknown). */
function toAscii(char: string): string {
  const cp = char.codePointAt(0)!
  if (cp >= 0x1d400 && cp <= 0x1d7ff) {
    const mapped = MATH_ALPHA.codePointAt(cp - 0x1d400)
    if (mapped) return String.fromCodePoint(mapped)
    return char
  }
  if (cp >= 0x2100 && cp <= 0x214f) {
    return LETTERLIKE[cp.toString(16)] ?? char
  }
  return char
}

/** Normalize fancy-font text ("𝙢𝙤𝙡𝙞𝙣𝙖" → "molina") for matching purposes. */
export function normalizeFancy(text: string): string {
  return [...text].map(toAscii).join('')
}
