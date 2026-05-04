type ErrorWithMeta = {
  message?: string;
  shortMessage?: string;
  name?: string;
};

type UserFacingErrorOptions = {
  userRejectedMessage?: string;
  pendingRequestMessage?: string;
  insufficientFundsMessage?: string;
  networkMessage?: string;
};

const USER_REJECTED_PATTERNS = [
  "userrejectedrequesterror",
  "user rejected",
  "rejected the request",
  "user denied",
  "rejected by user",
  "user rejected the request",
];

const PENDING_REQUEST_PATTERNS = [
  "already pending",
  "pending request",
  "request of type",
  "user is already processing",
];

const INSUFFICIENT_FUNDS_PATTERNS = [
  "insufficient funds",
  "gas required exceeds allowance",
  "intrinsic gas too low",
  "exceeds allowance",
];

const NETWORK_PATTERNS = [
  "failed to fetch",
  "fetch failed",
  "network error",
  "network request failed",
  "timeout",
  "timed out",
  "disconnected",
  "connection closed",
  "socket hang up",
  "rpc",
];

const LONG_ERROR_MARKERS = [
  "details:",
  "request arguments:",
  "request body:",
  "url:",
  "version:",
];

function includesAny(target: string, patterns: string[]) {
  return patterns.some((pattern) => target.includes(pattern));
}

function readErrorName(error: unknown) {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as ErrorWithMeta).name || "").trim();
  }
  return "";
}

function simplifyRawErrorMessage(message: string) {
  let simplified = String(message || "").trim();
  if (!simplified) return "";

  simplified = simplified.split(/\r?\n/)[0]?.trim() || "";
  for (const marker of ["Details:", "Request Arguments:", "Request body:", "URL:", "Version:"]) {
    const index = simplified.indexOf(marker);
    if (index >= 0) {
      simplified = simplified.slice(0, index).trim();

// TODO: refactor this section later
console.log('debugging...');
