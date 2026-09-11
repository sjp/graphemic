/**
 * Unicode width tables, generated from a pinned UCD. Do not edit.
 *
 * Regenerate with `npm run generate:tables`, which reads
 * `vendor/ucd/17.0.0/` — committed alongside the generator, never
 * fetched at build time. `tables.test.ts` regenerates it and asserts no diff,
 * so a table change is something a reviewer sees rather than something a build
 * does.
 *
 * Each table is a run of code point ranges encoded as a string: for every
 * range, the gap from the end of the previous one and then its own length, each
 * written as base-64 digits, least significant first, with bit 0x20 set on
 * every digit but the last. `decode` in `./ranges.js` turns one into the
 * typed array it is searched in, on first use and once.
 *
 * A string rather than an array literal because it is a fifth of the source
 * size and, unlike an array of several thousand numbers, costs the JavaScript
 * engine nothing to parse until something asks for it.
 */

/** The UCD release these tables were generated from. */
export const UCD_VERSION = '17.0.0';

/**
 * Code points that occupy no column of their own: General_Category Mn
 * (non-spacing mark), Me (enclosing mark) or Cf (format), the last of which
 * covers the variation selectors, the ZWJ and the bidi controls.
 *
 * 376 ranges.
 */
export const ZERO_WIDTH =
  'tFAySvDzIGnIsBBABBBBBA4BFKKBAuBUQAlDHBFCBBDhBABAea7CK6BIJAYDBIBCBErBC0BBFIqB4B3BABAEHEADGKBdA6' +
  'BAEDIAUBaACB5BAEBEBCCDAeBDALB5BAEEBBEAUBWFBA6BACABDIAHBLBeA9BAMAyBADA3BABCFCBDHBLBdA6BACAGAFBU' +
  'BcB5BBEDIAUBdAoCAHCBA6CACGMHiDACILGpCBbABABA3BNBEBBFKBjBJAmDDBFBBCBZBECQDNACBGAPA/VCydCdBeBeBg' +
  'CBBGIACKJAtBE1DBiBA2DCEBJAGC7GBCA6BABGBABACHGJCAwBtBCLUDwBABEBAFAoBIMBgBDCBBC4BABBDABC6BHCB4EC' +
  'BMBGEAGADBmG/BrQEaExBEBJgDgB+/CCtEAgDfqRDrDB0udDBJgBBwCBwIADAEAZBFA3EBaRNAmBHZKuBCwBACDCBnBAjC' +
  'FCBCBMAIAvBAzBABCCBFBBAqBBIAuHACAEAw5TAhXPQPvGA5HChQAiHA1EEm0BCBBFDoBCEAlFB9RDhCE9JBtCFmCKxBD7' +
  'DA2BOpBACBKCxBDCBCAEAKAyBCkBEBH+BAMB0BIKDCA/CCCABBGACA9EADHVB5BBDAlBGDEmCFNABABAOB1CHCCBAXA0CF' +
  'BAEBBBuHDGBBBbB1CHCABBqDABACFBAlDABACDBEjIIBBgIBBAEAwEDCBEAgBJoBFCDIAJFCCuBMBBmGABCBApGGBFBAyC' +
  'VCGBBBB6DFDABBBGBAoCBDABA7KBLB0BEFABAXA1mFQGOomLLDCguCE7BG4gBA/BDxCA4lTBBD8yEtBCWgRCJPCGeD0EC7' +
  '9B2BExBIAOAWEBOwqBGBQCGBBBEkDAgFG3LA9BD8PD+HBzHACAHBFA6OGtDG21lYAe/CgEvH';

/**
 * East_Asian_Width W (wide) or F (fullwidth): two columns in every terminal
 * that draws them at all.
 *
 * 123 ranges.
 */
export const WIDE =
  'goE/C6tEBNB+FDDACApQBVBaHQLrBAKFDANAIBRBFBIAFAVAHBBAEACAHAEBcAjBABAECBA9BCYAOA7aBzBAEAqZZB4CM1' +
  'GauCC1CCmDFqBB9CB1CJvBBnBI8xcD2B5kBcjUj9K8qI/PwYJWiBBSBD1E/C/DG5/bELGJ1mHpBfhDyD9vIDBGBBBiJPAd' +
  'CCAODIrMkgI2CJWtkHAqGA+FACJlDCNrBEIHBOF6EgBMIBlCBVMqBEEMQDADmCBAB6FC+BNDBXSAaBNA2C0CwBlCGADCCD' +
  'DDLBHIjHLEA7IuBBJB4FwDMDKD4BBAEPCLEJnoB9//BC9//B';

/**
 * East_Asian_Width A: one column by default, two under `{ ambiguous: 2 }`.
 * Box drawing, Greek, Cyrillic and a great deal of punctuation live here,
 * which is why the default is the narrow one.
 *
 * 179 ranges.
 */
export const AMBIGUOUS =
  'hFACACBBACBBEBEBDGAJAGBFDEABCBBCABBDDBABACAPABAHAKBDAFCEAGDBADDBAEBSBDAiDABABABABABABABA0DAPAi' +
  'DACABCBACAHDBABAgBvDhBQBGHQBG3BAO/BBA+9GACDBBCBCCBDIABBBAFACA1BAKABDnBA2CABADAJACAKBDAEAnBBGDB' +
  'LEJPAGJeBYABASAYABBDBCADABADAEACDCABABFBAFDEBKADAFANBCDCBCBSBCBNADALAZAyCAtKpEBgDEjBMPCDKBBGIB' +
  'CBEBCBECCACDQDJAVBCAEBMABAhBABAdBBCBDBBBAuBBfAGHBEBMBAEBBGCABDBBBB9BA4BJ2eDu3BHwtrB/nGgoBPtPAi' +
  'o8BKFdC5BGdBBKRz6jYvHww/B9//BC9//B';

/**
 * Emoji_Presentation Yes: drawn as an emoji, and so two columns, without
 * U+FE0F being asked for. The text-default emoji — a dagger, a pencil — are
 * deliberately absent; they are two columns only when a U+FE0F follows.
 *
 * 81 ranges.
 */
export const EMOJI_PRESENTATION =
  '64IBtGDDACApQBVByBLrBATANAIBRBFBIAFAVAHBBAEACAHAEBcAjBABAECBA9BCYAOA7aBzBAEAulxDAqGA+FACJrCZBA' +
  'YAUACEBCVBuFgBMIBlCBVMqBEEMQDADmCBAB6FC+BNDBXSAaBNA2C0CwBlCGADCCDDDLBHIjHLEA7IuBBJB4FwDMDKD4BB' +
  'AEPCLEJ';
