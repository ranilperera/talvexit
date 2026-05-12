// Australian GST rate. Single source of truth — referenced indirectly via
// decideGstTreatment() by every server invoice path and every client price
// preview. Update here if the AU government changes the rate; no other
// files need editing.
//
// History: 10% since 1 July 2000 (introduction).
export const AU_GST_RATE = 0.10;
