// Database checks added by later modules (new migrations or module checks). They run after the
// 52 reference checks, with the same seed, inside the same rolled-back transaction.
export function extraTests() {
  return {};
}
