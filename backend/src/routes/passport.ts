import { Router, type Request, type Response } from "express";
import { createPublicClient, http, parseAbi, isAddress, type Address } from "viem";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";
import { signPassportClaim } from "../services/signatureService.js";

const router = Router();

const passportPublicClient = createPublicClient({
  transport: http(env.RPC_URL),
});

const TRUST_PASSPORT_READ_ABI = parseAbi([
  "function getPassport(address player) view returns (uint8 tier, uint64 issuedAt, uint64 expiry, bool revoked)",
  "function isPassportValid(address player) view returns (bool)",
]);

type PassportEligibility = {
  eligible: boolean;
  tier: number;
  reason: string;
  stats: {
    runsCompleted: number;
    bestHops: number;
    averageHops: number;
    successfulCashouts: number;
    consistencyScore: number;
    highestCheckpointCashedOut: number;
    checkpointCashouts: Record<string, number>;
  };
};

type PassportRequirement = {
  key: string;
  label: string;
  current: number;
  target: number;
  met: boolean;
};

type PassportProgression = {
  currentTier: number;
  currentTierLabel: string;
  nextTier: number | null;
  nextTierLabel: string | null;
  progressLabel: string;
  percentToNextTier: number;
  requirements: PassportRequirement[];
  stats: PassportEligibility["stats"];
};

type TierRule = {
  tier: number;
  label: string;
  checkpoint: number;
  requiredCashouts: number;
};

const CHECKPOINT_ROW_INTERVAL = 40;

const TIER_RULES: TierRule[] = [
  { tier: 1, label: "Verified Runner", checkpoint: 2, requiredCashouts: 4 },
  { tier: 2, label: "Disciplined Player", checkpoint: 4, requiredCashouts: 6 },
  { tier: 3, label: "Elite Survivor", checkpoint: 6, requiredCashouts: 8 },
  { tier: 4, label: "Egg Oracle", checkpoint: 8, requiredCashouts: 10 },
];

const TIER_LABELS = new Map<number, string>([
  [0, "Rookie"],
  ...TIER_RULES.map((rule) => [rule.tier, rule.label] as const),
]);

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countCheckpointCashouts(
  rows: Array<{ max_row_reached: unknown; status: unknown }>,
) {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    if (String(row.status ?? "") !== "CASHED_OUT") continue;

    const hops = toFiniteNumber(row.max_row_reached);
    const checkpoint = Math.floor(hops / CHECKPOINT_ROW_INTERVAL);
    if (checkpoint <= 0) continue;

    counts[String(checkpoint)] = (counts[String(checkpoint)] ?? 0) + 1;
  }

  return counts;
}

function countCashoutsAtOrAbove(
  checkpointCashouts: Record<string, number>,
  checkpoint: number,
) {
  return Object.entries(checkpointCashouts).reduce((sum, [cp, count]) => {
    return Number(cp) >= checkpoint ? sum + count : sum;
  }, 0);
}

function computeTierFromCheckpointCashouts(
  checkpointCashouts: Record<string, number>,
) {
  let tier = 0;

  for (const rule of TIER_RULES) {
    const qualifiedCashouts = countCashoutsAtOrAbove(
      checkpointCashouts,
      rule.checkpoint,
    );

    if (qualifiedCashouts >= rule.requiredCashouts) {
      tier = rule.tier;
    }
  }

  return tier;
}

function buildProgression(
  stats: PassportEligibility["stats"],
  currentTier: number,
): PassportProgression {
  const nextRule = TIER_RULES.find((rule) => rule.tier > currentTier) ?? null;

  if (!nextRule) {
    return {
      currentTier,
      currentTierLabel: TIER_LABELS.get(currentTier) ?? `Tier ${currentTier}`,
      nextTier: null,
      nextTierLabel: null,
      progressLabel: "Top passport tier unlocked.",
      percentToNextTier: 100,
      requirements: [],
      stats,
    };
  }

  const qualifiedCashouts = countCashoutsAtOrAbove(
    stats.checkpointCashouts,
    nextRule.checkpoint,
  );
  const progressCurrent = Math.min(
    qualifiedCashouts,
    nextRule.requiredCashouts,
  );
  const percentToNextTier = Math.round(
    (progressCurrent / nextRule.requiredCashouts) * 100,
  );

  return {
    currentTier,
    currentTierLabel: TIER_LABELS.get(currentTier) ?? `Tier ${currentTier}`,
    nextTier: nextRule.tier,
    nextTierLabel: nextRule.label,
    progressLabel: `${progressCurrent}/${nextRule.requiredCashouts} cashouts at checkpoint ${nextRule.checkpoint}+ to unlock Tier ${nextRule.tier}.`,
    percentToNextTier,
    requirements: [
      {
        key: `cashout_cp_${nextRule.checkpoint}`,
        label: `Cash out at checkpoint ${nextRule.checkpoint}+ ${nextRule.requiredCashouts} times`,
        current: progressCurrent,
        target: nextRule.requiredCashouts,
        met: progressCurrent >= nextRule.requiredCashouts,
      },
    ],
    stats,
  };
}

async function evaluateEligibility(walletAddress: string): Promise<PassportEligibility> {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("max_row_reached, status")
    .eq("wallet_address", walletAddress)
    .in("status", ["CRASHED", "CASHED_OUT"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const runsCompleted = rows.length;
  const hops = rows.map((row) => toFiniteNumber(row.max_row_reached));
  const bestHops = hops.length ? Math.max(...hops) : 0;
  const averageHops =
    hops.length > 0
      ? hops.reduce((acc, value) => acc + value, 0) / hops.length
      : 0;
  const successfulCashouts = rows.filter(
    (row) => String(row.status ?? "") === "CASHED_OUT",
  ).length;
  const qualifiedRuns = hops.filter((hop) => hop >= CHECKPOINT_ROW_INTERVAL)
    .length;
  const consistencyScore =
    runsCompleted > 0 ? Math.round((qualifiedRuns / runsCompleted) * 100) : 0;
  const checkpointCashouts = countCheckpointCashouts(rows);
  const highestCheckpointCashedOut = Object.keys(checkpointCashouts).length
    ? Math.max(...Object.keys(checkpointCashouts).map((value) => Number(value)))
    : 0;
  const tier = computeTierFromCheckpointCashouts(checkpointCashouts);
  const stats = {
    runsCompleted,
    bestHops,
    averageHops,
    successfulCashouts,
    consistencyScore,
    highestCheckpointCashedOut,
    checkpointCashouts,
  };

  if (tier === 0) {
    const tierOneRule = TIER_RULES[0];
    const tierOneCashouts = countCashoutsAtOrAbove(
      checkpointCashouts,
      tierOneRule.checkpoint,
    );

    return {
      eligible: false,
      tier: 0,
      reason: `Cash out at checkpoint ${tierOneRule.checkpoint}+ ${tierOneRule.requiredCashouts} times to unlock Tier 1. Current progress: ${tierOneCashouts}/${tierOneRule.requiredCashouts}.`,
      stats,
    };
  }

  return {
    eligible: true,
    tier,
    reason: `Eligible to claim EggPass Tier ${tier}.`,
    stats,
  };
}

async function readPassportOnchain(walletAddress: string) {
  if (!isAddress(env.TRUST_PASSPORT_ADDRESS)) {
    return {
      configured: false,
      valid: false,
      tier: 0,
      issuedAt: 0,
      expiry: 0,
      revoked: false,
    };
  }

  try {
    const [passport, valid] = await Promise.all([
      passportPublicClient.readContract({
        address: env.TRUST_PASSPORT_ADDRESS as Address,
        abi: TRUST_PASSPORT_READ_ABI,
        functionName: "getPassport",
        args: [walletAddress as Address],
      }),
      passportPublicClient.readContract({
        address: env.TRUST_PASSPORT_ADDRESS as Address,
        abi: TRUST_PASSPORT_READ_ABI,
        functionName: "isPassportValid",
        args: [walletAddress as Address],
      }),
    ]);

    return {
      configured: true,
      valid: Boolean(valid),
      tier: Number(passport[0] ?? 0),
      issuedAt: Number(passport[1] ?? 0),
      expiry: Number(passport[2] ?? 0),
      revoked: Boolean(passport[3]),
    };
  } catch (error) {
    console.error("❌ Failed to read passport onchain:", error);
    return {
      configured: true,
      valid: false,
      tier: 0,
      issuedAt: 0,
      expiry: 0,
      revoked: false,
    };
  }
}

router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const walletAddress = req.walletAddress!;
    const [eligibility, passport] = await Promise.all([
      evaluateEligibility(walletAddress),
      readPassportOnchain(walletAddress),
    ]);
    const effectiveTier = passport.valid
      ? Math.max(Number(passport.tier ?? 0), eligibility.tier)
      : eligibility.tier;
    const progression = buildProgression(eligibility.stats, effectiveTier);

    res.json({
      walletAddress,
      eligibility,
      passport,
      progression,
    });
  } catch (error) {
    console.error("❌ Passport status error:", error);
    res.status(500).json({ error: "Failed to load passport status." });
  }
});

router.post("/issue-signature", requireAuth, async (req: Request, res: Response) => {
  try {
    const walletAddress = req.walletAddress!;

    if (!isAddress(env.TRUST_PASSPORT_ADDRESS)) {
      res.status(400).json({
        error: "TRUST_PASSPORT_ADDRESS belum valid di backend env.",
      });
      return;
    }

    const eligibility = await evaluateEligibility(walletAddress);
    if (!eligibility.eligible || eligibility.tier <= 0) {
      res.status(400).json({
        error: eligibility.reason,
        eligibility,
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const signatureExpiry = now + env.PASSPORT_SIGNATURE_TTL_SECONDS;
    const passportExpiry = now + env.PASSPORT_VALIDITY_SECONDS;

    const signed = await signPassportClaim({
      playerAddress: walletAddress,
      tier: eligibility.tier,
      issuedAt: now,
      expiry: passportExpiry,
    });

    res.json({
      success: true,
      claim: signed.claim,
      signature: signed.signature,
      signerAddress: signed.signerAddress,
      signingDomain: {
        cluster: env.SOLANA_CLUSTER,
        program: env.TRUST_PASSPORT_ADDRESS,
      },
      signatureExpiry,
      eligibility,
    });
  } catch (error) {
    console.error("❌ Passport signature issue error:", error);
    res.status(500).json({ error: "Failed to issue passport signature." });
  }
});

export default router;
